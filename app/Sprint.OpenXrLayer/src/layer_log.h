// Appends lines to %LOCALAPPDATA%\Sprint\openxr-layer.log. Meant for rare events (load, session,
// feed connect, failures); never call it per frame.
#pragma once

namespace sprint::xr {

// printf-style. Never throws; a log that cannot be written is silently dropped.
void Log(const char* format, ...);

}  // namespace sprint::xr
