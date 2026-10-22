#include "layer_log.h"

#include <windows.h>

#include <cstdarg>
#include <cstdio>
#include <mutex>
#include <string>

namespace sprint::xr {
namespace {

constexpr LONGLONG kMaxLogBytes = 1024 * 1024;

std::mutex& LogMutex() {
  static std::mutex mutex;
  return mutex;
}

// %LOCALAPPDATA%\Sprint\openxr-layer.log, creating the folder. Empty when LOCALAPPDATA is unset.
std::wstring LogPath() {
  wchar_t base[MAX_PATH];
  const DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", base, MAX_PATH);
  if (length == 0 || length >= MAX_PATH) return {};
  std::wstring folder = std::wstring(base, length) + L"\\Sprint";
  CreateDirectoryW(folder.c_str(), nullptr);  // fails harmlessly when it exists
  return folder + L"\\openxr-layer.log";
}

}  // namespace

void Log(const char* format, ...) {
  char message[1024];
  va_list args;
  va_start(args, format);
  const int written = std::vsnprintf(message, sizeof(message), format, args);
  va_end(args);
  if (written < 0) return;

  SYSTEMTIME now;
  GetLocalTime(&now);
  char line[1200];
  const int lineLength =
      std::snprintf(line, sizeof(line), "%04u-%02u-%02u %02u:%02u:%02u.%03u [%lu] %s\r\n", now.wYear, now.wMonth,
                    now.wDay, now.wHour, now.wMinute, now.wSecond, now.wMilliseconds, GetCurrentProcessId(), message);
  if (lineLength <= 0) return;

  try {
    std::lock_guard<std::mutex> lock(LogMutex());
    static const std::wstring path = LogPath();
    if (path.empty()) return;
    HANDLE file = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                              nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return;
    // Keep the file small: start over once it passes 1 MB.
    LARGE_INTEGER size{};
    if (GetFileSizeEx(file, &size) && size.QuadPart > kMaxLogBytes) {
      CloseHandle(file);
      file = CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                         nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
      if (file == INVALID_HANDLE_VALUE) return;
    }
    DWORD bytes = 0;
    const DWORD toWrite = static_cast<DWORD>(lineLength < static_cast<int>(sizeof(line)) ? lineLength : sizeof(line) - 1);
    WriteFile(file, line, toWrite, &bytes, nullptr);
    CloseHandle(file);
  } catch (...) {
    // Logging must never take the game down.
  }
}

}  // namespace sprint::xr
