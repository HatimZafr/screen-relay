#pragma once

#include <utility>

namespace relay::android {
bool screenChanged();
std::pair<int, int> streamDimensions();
std::pair<int, int> deviceDimensions();
}
