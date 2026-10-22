// Reads the Sprint host's shared-memory feed (guide_feed_layout.h) into a GuideSnapshot.
#pragma once

#include <windows.h>

#include <cstdint>
#include <vector>

#include "guide_math.h"

namespace sprint::xr {

// Owns the read-only view of Local\SprintDrivingGuide. Opens it lazily, at most once a second, so a
// Sprint started after the game is picked up; lets go of it when the host process exits.
// Single-threaded: the layer calls it under its own lock.
class GuideFeed {
 public:
  GuideFeed() = default;
  GuideFeed(const GuideFeed&) = delete;
  GuideFeed& operator=(const GuideFeed&) = delete;
  ~GuideFeed();

  // Refreshes `snapshot` in place. Pose and settings are re-read every call; points and boards are
  // copied only when the geometry id changes. A block that stays torn after a few tries keeps its
  // previous copy. Returns false when the feed is absent or invalid.
  bool Read(guide::GuideSnapshot& snapshot);

  // Drops the mapping, e.g. when the session ends.
  void Close();

 private:
  bool EnsureOpen();
  bool HostAlive();
  void Disconnect(const char* reason);

  HANDLE mapping_ = nullptr;
  const uint8_t* view_ = nullptr;
  HANDLE hostProcess_ = nullptr;
  ULONGLONG lastOpenAttemptMs_ = 0;
  ULONGLONG lastHostCheckMs_ = 0;
  bool loggedInvalid_ = false;
  std::vector<uint8_t> pointBytes_;
  std::vector<uint8_t> boardBytes_;
};

}  // namespace sprint::xr
