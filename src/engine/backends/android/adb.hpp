#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace relay::android {
std::vector<uint8_t> shell(const std::string& command, size_t limit);
size_t readLittle32(const uint8_t* bytes);
bool selectDevice(const std::string& serial);
}
