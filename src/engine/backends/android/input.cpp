#include "adb.hpp"
#include "screen.hpp"
#include "core/input.hpp"
#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace relay::android {
namespace {
using Clock = std::chrono::steady_clock;

std::string coordinate(int x, int y) {
  const auto [width, height] = streamDimensions();
  const auto [deviceWidth, deviceHeight] = deviceDimensions();
  return std::to_string(x * (deviceWidth - 1) / (width - 1)) + ' ' +
         std::to_string(y * (deviceHeight - 1) / (height - 1));
}

bool sendInput(const std::string& args) {
  if (screenChanged()) return false;
  try {
    shell("/system/bin/input " + args, 4096);
    return true;
  } catch (...) {
    return false;
  }
}

std::string textArgument(const std::string& text) {
  std::string quoted = "'";
  for (const char ch : text) {
    if (ch == ' ') quoted += "%s";
    else if (ch == '\'') quoted += "'\\''";
    else quoted += ch;
  }
  quoted += '\'';
  return quoted;
}

class AndroidInput final : public InputBackend {
  mutable std::mutex mutex;
  std::condition_variable ready;
  InputQueue queue;
  bool stopping = false;
  int x = 0, y = 0, startX = 0, startY = 0;
  std::optional<Clock::time_point> downAt;
  std::thread worker;

 public:
  AndroidInput() : worker([this] { run(); }) {}
  ~AndroidInput() override {
    { std::lock_guard<std::mutex> lock(mutex); stopping = true; }
    ready.notify_one();
    worker.join();
  }

  const char* name() const override { return "android"; }
  std::pair<uint16_t, uint16_t> dimensions() const override {
    const auto [width, height] = streamDimensions();
    return {uint16_t(width), uint16_t(height)};
  }

  std::optional<NativeKey> nativeKey(uint16_t usage) const override {
    if (usage >= 4 && usage <= 29) return 29 + (usage - 4);
    if (usage >= 30 && usage <= 38) return 8 + (usage - 30);
    switch (usage) {
      case 39: return 7;
      case 40: return 66;
      case 41: return 4;
      case 42: return 67;
      case 43: return 61;
      case 44: return 62;
      case 45: return 69;
      case 46: return 70;
      case 47: return 71;
      case 48: return 72;
      case 49: return 73;
      case 51: return 74;
      case 52: return 75;
      case 53: return 68;
      case 54: return 55;
      case 55: return 56;
      case 56: return 76;
      case 74: return 3;
      case 75: return 92;
      case 76: return 112;
      case 77: return 123;
      case 78: return 93;
      case 79: return 22;
      case 80: return 21;
      case 81: return 20;
      case 82: return 19;
      default: return std::nullopt;
    }
  }

  void pressKey(NativeKey key) override {
    InputJob job{InputJob::Kind::key};
    job.code = key;
    post(job);
  }
  void releaseKey(NativeKey) override {}

  bool typeText(uint32_t codepoint) override {
    if (codepoint < 32 || codepoint > 126) return false;
    InputJob job{InputJob::Kind::text};
    job.codepoint = codepoint;
    post(job);
    return true;
  }
  void pressButton(unsigned button) override { postButton(button, true); }
  void releaseButton(unsigned button) override { postButton(button, false); }
  void move(int x, int y) override {
    InputJob job{InputJob::Kind::motion};
    job.x = x;
    job.y = y;
    post(job);
  }
  void scroll(unsigned axis, int notches) override {
    InputJob job{InputJob::Kind::scroll};
    job.number = axis;
    job.notches = notches;
    post(job);
  }
  void resetLocks() override { post(InputJob{InputJob::Kind::locks}); }
  void fence(std::shared_ptr<InputFence> mark) override {
    InputJob job{InputJob::Kind::fence};
    job.fence = std::move(mark);
    post(job);
  }
  size_t pending() const override {
    std::lock_guard<std::mutex> lock(mutex);
    return queue.pending();
  }
  void cancel() override {
    std::lock_guard<std::mutex> lock(mutex);
    queue.cancel();
  }
  void flush() override { post(InputJob{InputJob::Kind::flush}); }

 private:
  void post(InputJob job) {
    { std::lock_guard<std::mutex> lock(mutex); queue.post(std::move(job)); }
    ready.notify_one();
  }

  void postButton(unsigned button, bool press) {
    InputJob job{InputJob::Kind::button};
    job.number = button;
    job.press = press;
    post(job);
  }

  void run() {
    std::string text;
    size_t dropped = 0;
    const auto sendText = [&] {
      if (!text.empty() && !sendInput("text " + textArgument(text))) dropped += text.size();
      text.clear();
    };
    std::unique_lock<std::mutex> lock(mutex);
    for (;;) {
      ready.wait(lock, [this] { return stopping || !queue.empty(); });
      if (stopping) break;
      auto job = queue.take();
      const bool last = queue.empty();
      lock.unlock();
      if (job.kind == InputJob::Kind::text) {
        text += char(job.codepoint);
        if (job.codepoint == '%') sendText();
      } else if (job.kind != InputJob::Kind::flush) {
        sendText();
        if (job.kind == InputJob::Kind::fence) {
          job.dropped += dropped;
          job.complete();
          dropped = 0;
        } else if (!apply(job)) {
          ++dropped;
        }
      }
      if (last) sendText();
      lock.lock();
    }
  }

  bool apply(const InputJob& job) {
    switch (job.kind) {
      case InputJob::Kind::key: return sendInput("keyevent " + std::to_string(job.code));
      case InputJob::Kind::motion: x = job.x; y = job.y; return true;
      case InputJob::Kind::button: return button(job.number, job.press);
      case InputJob::Kind::scroll: return swipe(job.number, job.notches);
      case InputJob::Kind::locks: downAt.reset(); return true;
      default: return true;
    }
  }

  bool button(unsigned number, bool press) {
    if (number != 1) return !press || sendInput(number == 2 ? "keyevent 3" : "keyevent 4");
    if (press) {
      startX = x;
      startY = y;
      downAt = Clock::now();
      return true;
    }
    if (!downAt) return true;
    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - *downAt).count();
    downAt.reset();
    if (x == startX && y == startY && elapsed < 400) return sendInput("tap " + coordinate(x, y));
    const auto duration = std::clamp<int64_t>(elapsed, 100, 1500);
    return sendInput("swipe " + coordinate(startX, startY) + ' ' + coordinate(x, y) + ' ' + std::to_string(duration));
  }

  bool swipe(unsigned axis, int notches) {
    if (!notches) return true;
    const auto [width, height] = streamDimensions();
    const int extent = axis == 0 ? height : width;
    const int distance = std::min(extent / 2, std::abs(notches) * extent / 8) * (notches > 0 ? -1 : 1);
    const int point = axis == 0 ? y : x;
    const int start = std::clamp(point, std::max(0, -distance), std::min(extent - 1, extent - 1 - distance));
    const int end = start + distance;
    return sendInput("swipe " + (axis == 0 ? coordinate(x, start) : coordinate(start, y)) +
                     ' ' + (axis == 0 ? coordinate(x, end) : coordinate(end, y)) + " 200");
  }
};
}

std::unique_ptr<InputBackend> makeInputBackend() {
  return std::make_unique<AndroidInput>();
}
}
