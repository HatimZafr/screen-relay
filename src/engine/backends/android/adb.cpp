#include "adb.hpp"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <array>
#include <cerrno>
#include <charconv>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string_view>

namespace relay::android {
namespace {
std::string target;

class Socket {
  int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);

 public:
  Socket() = default;
  Socket(const Socket&) = delete;
  Socket& operator=(const Socket&) = delete;
  ~Socket() { if (fd >= 0) close(fd); }

  void open() {
    const timeval timeout{2, 0};
    if (fd < 0 || setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) ||
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)))
      throw std::runtime_error("Cannot create an ADB connection");
    constexpr std::string_view scheme = "localfilesystem:";
    const char* configured = std::getenv("ADB_SERVER_SOCKET");
    const std::string_view spec = configured ? configured : "";
    sockaddr_un address{};
    if (spec.substr(0, scheme.size()) != scheme ||
        spec.size() <= scheme.size() || spec[scheme.size()] != '/' ||
        spec.size() - scheme.size() >= sizeof(address.sun_path))
      throw std::runtime_error("Set ADB_SERVER_SOCKET to a private localfilesystem socket");
    address.sun_family = AF_UNIX;
    std::memcpy(address.sun_path, spec.data() + scheme.size(), spec.size() - scheme.size());
    if (connect(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address)) != 0)
      throw std::runtime_error("Cannot connect to the private ADB socket");
  }

  void read(void* data, size_t length) {
    auto* bytes = static_cast<uint8_t*>(data);
    while (length) {
      const ssize_t size = recv(fd, bytes, length, 0);
      if (size < 0 && errno == EINTR) continue;
      if (size <= 0) throw std::runtime_error("ADB connection closed or timed out");
      bytes += size;
      length -= size;
    }
  }

  void write(std::string_view bytes) {
    while (!bytes.empty()) {
      const ssize_t size = send(fd, bytes.data(), bytes.size(), MSG_NOSIGNAL);
      if (size < 0 && errno == EINTR) continue;
      if (size <= 0) throw std::runtime_error("Writing to ADB failed");
      bytes.remove_prefix(size);
    }
  }

  void request(std::string_view service) {
    if (service.size() > 0xffff) throw std::runtime_error("ADB request is too long");
    char digits[4];
    const auto number = std::to_chars(digits, digits + sizeof(digits), service.size(), 16);
    std::string prefix(4 - (number.ptr - digits), '0');
    prefix.append(digits, number.ptr);
    write(prefix);
    write(service);
    char reply[4];
    read(reply, sizeof(reply));
    if (std::string_view(reply, sizeof(reply)) != "OKAY")
      throw std::runtime_error("ADB rejected the request. Check the device with adb devices.");
  }
};
}

size_t readLittle32(const uint8_t* bytes) {
  return size_t(bytes[0]) | size_t(bytes[1]) << 8 | size_t(bytes[2]) << 16 | size_t(bytes[3]) << 24;
}

bool selectDevice(const std::string& serial) {
  if (serial.empty() || serial.size() > 1024 || serial.find_first_of(" \t\r\n") != std::string::npos) return false;
  target = serial;
  return true;
}

std::vector<uint8_t> shell(const std::string& command, size_t limit) {
  Socket socket;
  socket.open();
  socket.request("host:transport:" + target);
  socket.request("shell,v2,raw:" + command);
  std::vector<uint8_t> output;
  size_t remaining = limit;
  for (;;) {
    uint8_t header[5];
    socket.read(header, sizeof(header));
    const size_t length = readLittle32(header + 1);
    if (header[0] == 3 && length == 1) {
      uint8_t status;
      socket.read(&status, 1);
      if (status) throw std::runtime_error("Android shell command failed");
      return output;
    }
    if (!length || length > remaining || (header[0] != 1 && header[0] != 2))
      throw std::runtime_error("Invalid response from ADB");
    remaining -= length;
    if (header[0] == 1) {
      const size_t offset = output.size();
      output.resize(offset + length);
      socket.read(output.data() + offset, length);
    } else {
      std::array<uint8_t, 4096> ignored;
      for (size_t left = length; left;) {
        const size_t chunk = left < ignored.size() ? left : ignored.size();
        socket.read(ignored.data(), chunk);
        left -= chunk;
      }
    }
  }
}
}
