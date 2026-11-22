#include "adb.hpp"
#include "screen.hpp"
#include "core/capture-source.hpp"
#include <sys/timerfd.h>
#include <unistd.h>
#include <algorithm>
#include <atomic>
#include <iostream>

namespace relay::android {
namespace {
constexpr size_t max_capture_bytes = 64 * 1024 * 1024;
constexpr int max_stream_extent = 1920;
std::pair<int, int> deviceSize, streamSize;
std::atomic<bool> rotated{false};

struct Screen {
  std::vector<uint8_t> raw = shell("/system/bin/screencap", max_capture_bytes + 16);
  size_t width, height, offset, bytesPerPixel, format;

  Screen() {
    if (raw.size() < 16) throw std::runtime_error("Android did not return a screenshot");
    width = readLittle32(raw.data());
    height = readLittle32(raw.data() + 4);
    format = readLittle32(raw.data() + 8);
    switch (format) {
      case 1: case 2: case 5: bytesPerPixel = 4; break;
      case 3: bytesPerPixel = 3; break;
      case 4: bytesPerPixel = 2; break;
      default: throw std::runtime_error("Android returned an unsupported screenshot format");
    }
    if (!width || !height || width > max_frame_width || height > max_frame_height ||
        width * height > max_capture_bytes / bytesPerPixel)
      throw std::runtime_error("Android screenshot dimensions are outside the supported range");
    const auto pixelBytes = width * height * bytesPerPixel;
    if (raw.size() == pixelBytes + 16) offset = 16;
    else if (raw.size() == pixelBytes + 12) offset = 12;
    else throw std::runtime_error("Android returned an incomplete screenshot");
  }

  void copyPixel(size_t x, size_t y, uint8_t* pixel) const {
    const auto* source = raw.data() + offset + (y * width + x) * bytesPerPixel;
    if (format == 4) {
      const unsigned value = unsigned(source[1]) << 8 | source[0];
      pixel[0] = uint8_t((value & 31) * 255 / 31);
      pixel[1] = uint8_t((value >> 5 & 63) * 255 / 63);
      pixel[2] = uint8_t((value >> 11) * 255 / 31);
    } else {
      pixel[0] = source[format == 5 ? 0 : 2];
      pixel[1] = source[1];
      pixel[2] = source[format == 5 ? 2 : 0];
    }
    pixel[3] = 255;
  }
};

class AndroidCapture final : public CaptureSource {
  int timer = -1;
  std::vector<uint8_t> pixels;

 public:
  AndroidCapture() {
    const auto [width, height] = streamSize;
    pixels.resize(size_t(width) * height * 4);
    timer = timerfd_create(CLOCK_MONOTONIC, TFD_NONBLOCK | TFD_CLOEXEC);
    const itimerspec interval{{0, 100000000}, {0, 100000000}};
    if (timer < 0 || timerfd_settime(timer, 0, &interval, nullptr)) {
      if (timer >= 0) close(timer);
      throw std::runtime_error("Cannot start Android capture timer");
    }
  }
  ~AndroidCapture() override { close(timer); }
  WaitHandle fd() const override { return timer; }
  std::pair<int, int> dimensions() const override { return streamSize; }
  PixelFormat pixelFormat() const override { return PixelFormat::BGRA; }
  bool drainDamage() override {
    uint64_t ticks = 0;
    return read(timer, &ticks, sizeof(ticks)) == sizeof(ticks);
  }
  FrameView capture() override {
    const Screen screen;
    if (screen.width != size_t(deviceSize.first) || screen.height != size_t(deviceSize.second)) {
      rotated = true;
      throw std::runtime_error("Android screen size changed. Restart the relay session.");
    }
    rotated = false;
    const auto [width, height] = streamSize;
    for (int y = 0; y < height; ++y) {
      const size_t row = size_t(y) * (screen.height - 1) / (height - 1);
      auto* target = pixels.data() + size_t(y) * width * 4;
      for (int x = 0; x < width; ++x)
        screen.copyPixel(size_t(x) * (screen.width - 1) / (width - 1), row, target + x * 4);
    }
    return {pixels.data(), width * 4, width, height, pixelFormat()};
  }
};
}

bool screenChanged() { return rotated; }
std::pair<int, int> deviceDimensions() { return deviceSize; }
std::pair<int, int> streamDimensions() { return streamSize; }

bool initializeNativeBackend(const std::string& output) {
  try {
    if (!selectDevice(output)) throw std::runtime_error("Pass the Android device serial with --output");
    const Screen screen;
    deviceSize = {int(screen.width), int(screen.height)};
    const int extent = std::max(deviceSize.first, deviceSize.second);
    const int scale = std::min(extent, max_stream_extent);
    streamSize = {deviceSize.first * scale / extent & ~1, deviceSize.second * scale / extent & ~1};
    requireSurfaceSize(streamSize.first, streamSize.second);
    rotated = false;
    return true;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return false;
  }
}

std::unique_ptr<CaptureSource> makeCaptureSource() {
  return std::make_unique<AndroidCapture>();
}
}
