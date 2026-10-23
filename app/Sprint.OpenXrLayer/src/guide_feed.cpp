#include "guide_feed.h"

#include <algorithm>
#include <atomic>
#include <cstring>

#include "guide_feed_layout.h"
#include "layer_log.h"

namespace sprint::xr {
namespace {

using namespace sprint::guide;

constexpr int kSeqlockAttempts = 4;
constexpr ULONGLONG kRetryIntervalMs = 1000;

// Block extents copied in one go; each covers its fields up to the next block.
constexpr uint32_t kPoseBlockStart = 64;
constexpr uint32_t kPoseBlockSize = kSettingsSeqOffset - kPoseBlockStart;
constexpr uint32_t kSettingsBlockStart = kSettingsSeqOffset;
constexpr uint32_t kSettingsBlockSize = kGeometrySeqOffset - kSettingsBlockStart;
constexpr uint32_t kGeometryHeaderStart = kGeometrySeqOffset;
constexpr uint32_t kGeometryHeaderSize = 32;

// The writer is another process, so the view is read through volatile loads and fences: the
// sequence load must not move past the copy, nor the copy past the second load.
uint32_t LoadU32(const uint8_t* view, uint32_t offset) {
  const uint32_t value = *reinterpret_cast<const volatile uint32_t*>(view + offset);
  std::atomic_thread_fence(std::memory_order_acquire);
  return value;
}

template <typename T>
T At(const uint8_t* block, uint32_t blockStart, uint32_t offset) {
  T value;
  std::memcpy(&value, block + (offset - blockStart), sizeof(T));
  return value;
}

// Copies [start, start + size) under the seqlock at seqOffset. False when every attempt was torn.
bool ReadBlock(const uint8_t* view, uint32_t seqOffset, uint32_t start, uint32_t size, uint8_t* out) {
  for (int attempt = 0; attempt < kSeqlockAttempts; ++attempt) {
    const uint32_t before = LoadU32(view, seqOffset);
    if (before & 1u) {
      YieldProcessor();
      continue;
    }
    std::memcpy(out, view + start, size);
    std::atomic_thread_fence(std::memory_order_acquire);
    if (LoadU32(view, seqOffset) == before) return true;
  }
  return false;
}

void ParsePose(const uint8_t* b, GuideSnapshot& snapshot) {
  constexpr uint32_t s = kPoseBlockStart;
  snapshot.poseValid = (At<uint32_t>(b, s, kPoseFlagsOffset) & kPoseFlagValid) != 0;
  snapshot.sampleQpc = At<int64_t>(b, s, kPoseSampleQpcOffset);
  snapshot.qpcFrequency = At<int64_t>(b, s, kPoseQpcFrequencyOffset);
  CarPose& pose = snapshot.pose;
  pose.position = {At<double>(b, s, kPosePositionOffset), At<double>(b, s, kPosePositionOffset + 8),
                   At<double>(b, s, kPosePositionOffset + 16)};
  pose.orientation = {At<float>(b, s, kPoseOrientationOffset), At<float>(b, s, kPoseOrientationOffset + 4),
                      At<float>(b, s, kPoseOrientationOffset + 8), At<float>(b, s, kPoseOrientationOffset + 12)};
  pose.velocity = {At<float>(b, s, kPoseVelocityOffset), At<float>(b, s, kPoseVelocityOffset + 4),
                   At<float>(b, s, kPoseVelocityOffset + 8)};
  pose.angular = {At<float>(b, s, kPoseAngularOffset), At<float>(b, s, kPoseAngularOffset + 4),
                  At<float>(b, s, kPoseAngularOffset + 8)};
  pose.trackPosition = At<double>(b, s, kPoseTrackPositionOffset);
}

void ParseSettings(const uint8_t* b, GuideSnapshot& snapshot) {
  constexpr uint32_t s = kSettingsBlockStart;
  snapshot.settingsFlags = At<uint32_t>(b, s, kSettingsFlagsOffset);
  SeatCalibration& calibration = snapshot.calibration;
  calibration.right = At<float>(b, s, kSettingsEyeOffset);
  calibration.up = At<float>(b, s, kSettingsEyeOffset + 4);
  calibration.forward = At<float>(b, s, kSettingsEyeOffset + 8);
  calibration.yawDegrees = At<float>(b, s, kSettingsYawOffset);
  calibration.pitchDegrees = At<float>(b, s, kSettingsPitchOffset);
  snapshot.metersAhead = At<float>(b, s, kSettingsMetersAheadOffset);
}

Pedal ToPedal(uint32_t raw) {
  return raw <= static_cast<uint32_t>(Pedal::Brake) ? static_cast<Pedal>(raw) : Pedal::Coast;
}

}  // namespace

GuideFeed::~GuideFeed() { Close(); }

bool GuideFeed::Read(GuideSnapshot& snapshot) {
  if (view_ == nullptr) {
    if (!EnsureOpen()) return false;
    // A fresh connection may be a restarted host whose geometry ids start over.
    snapshot = GuideSnapshot{};
  }
  if (!HostAlive()) {
    Disconnect("the Sprint host exited");
    return false;
  }
  if (LoadU32(view_, kMagicOffset) != kMagic || LoadU32(view_, kVersionOffset) != kVersion) {
    Disconnect("the feed header changed");
    return false;
  }

  uint8_t pose[kPoseBlockSize];
  if (ReadBlock(view_, kPoseSeqOffset, kPoseBlockStart, kPoseBlockSize, pose)) ParsePose(pose, snapshot);
  uint8_t settings[kSettingsBlockSize];
  if (ReadBlock(view_, kSettingsSeqOffset, kSettingsBlockStart, kSettingsBlockSize, settings)) {
    ParseSettings(settings, snapshot);
  }

  // Geometry: the header, and the arrays only when the lap changed, all under one sequence.
  GuideGeometry& geometry = snapshot.geometry;
  for (int attempt = 0; attempt < kSeqlockAttempts; ++attempt) {
    const uint32_t before = LoadU32(view_, kGeometrySeqOffset);
    if (before & 1u) {
      YieldProcessor();
      continue;
    }
    uint8_t header[kGeometryHeaderSize];
    std::memcpy(header, view_ + kGeometryHeaderStart, sizeof(header));
    constexpr uint32_t s = kGeometryHeaderStart;
    const auto id = At<uint32_t>(header, s, kGeometryIdOffset);
    if (id == geometry.id) break;  // unchanged; a torn id only delays the update by a frame

    const uint32_t pointCount = std::min(At<uint32_t>(header, s, kGeometryPointCountOffset), kMaxPoints);
    const uint32_t boardCount = std::min(At<uint32_t>(header, s, kGeometryBoardCountOffset), kMaxBoards);
    pointBytes_.resize(static_cast<size_t>(pointCount) * kPointStride);
    boardBytes_.resize(static_cast<size_t>(boardCount) * kBoardStride);
    std::memcpy(pointBytes_.data(), view_ + kPointsOffset, pointBytes_.size());
    std::memcpy(boardBytes_.data(), view_ + kBoardsOffset, boardBytes_.size());
    std::atomic_thread_fence(std::memory_order_acquire);
    if (LoadU32(view_, kGeometrySeqOffset) != before) continue;

    geometry.id = id;
    geometry.positionStep = At<double>(header, s, kGeometryPositionStepOffset);
    geometry.trackLength = At<double>(header, s, kGeometryTrackLengthOffset);
    geometry.points.resize(pointCount);
    for (uint32_t i = 0; i < pointCount; ++i) {
      const uint8_t* p = pointBytes_.data() + static_cast<size_t>(i) * kPointStride;
      LinePoint& point = geometry.points[i];
      point.position = {At<float>(p, 0, 0), At<float>(p, 0, 4), At<float>(p, 0, 8)};
      point.pedal = ToPedal(At<uint32_t>(p, 0, 12));
    }
    geometry.boards.resize(boardCount);
    for (uint32_t i = 0; i < boardCount; ++i) {
      const uint8_t* p = boardBytes_.data() + static_cast<size_t>(i) * kBoardStride;
      BrakeBoard& board = geometry.boards[i];
      board.base = {At<float>(p, 0, 0), At<float>(p, 0, 4), At<float>(p, 0, 8)};
      board.facingX = At<float>(p, 0, 12);
      board.facingZ = At<float>(p, 0, 16);
      board.width = At<float>(p, 0, 20);
      board.height = At<float>(p, 0, 24);
      board.pointIndex = At<uint32_t>(p, 0, 28);
    }
    Log("feed: reference lap %u (%u points, %u boards)", id, pointCount, boardCount);
    break;
  }
  return true;
}

bool GuideFeed::EnsureOpen() {
  if (view_ != nullptr) return true;
  const ULONGLONG now = GetTickCount64();
  if (lastOpenAttemptMs_ != 0 && now - lastOpenAttemptMs_ < kRetryIntervalMs) return false;
  lastOpenAttemptMs_ = now;

  // Absent while Sprint is not running: the normal case, so nothing is logged.
  HANDLE mapping = OpenFileMappingW(FILE_MAP_READ, FALSE, kMappingName);
  if (mapping == nullptr) return false;
  const void* view = MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, kTotalSize);
  if (view == nullptr) {
    if (!loggedInvalid_) Log("feed: mapping found but MapViewOfFile failed (error %lu)", GetLastError());
    loggedInvalid_ = true;
    CloseHandle(mapping);
    return false;
  }

  const auto* bytes = static_cast<const uint8_t*>(view);
  const uint32_t magic = LoadU32(bytes, kMagicOffset);
  const uint32_t version = LoadU32(bytes, kVersionOffset);
  const uint32_t totalSize = LoadU32(bytes, kTotalSizeOffset);
  if (magic != kMagic || version != kVersion || totalSize != kTotalSize) {
    // Magic 0 is a host that has created the mapping but not written the header yet.
    if (magic != 0 && !loggedInvalid_) {
      Log("feed: header mismatch (magic 0x%08X version %u size %u; expected version %u size %u)", magic, version,
          totalSize, kVersion, kTotalSize);
      loggedInvalid_ = true;
    }
    UnmapViewOfFile(view);
    CloseHandle(mapping);
    return false;
  }

  mapping_ = mapping;
  view_ = bytes;
  loggedInvalid_ = false;
  const uint32_t hostPid = LoadU32(bytes, kHostProcessIdOffset);
  hostProcess_ = hostPid != 0 ? OpenProcess(SYNCHRONIZE, FALSE, hostPid) : nullptr;
  lastHostCheckMs_ = now;
  Log("feed: connected (host pid %u)", hostPid);
  return true;
}

// The mapping outlives the host while we hold it, so the host's exit is what ends a connection.
// Checked at most once a second; without a process handle the host is assumed alive.
bool GuideFeed::HostAlive() {
  if (hostProcess_ == nullptr) return true;
  const ULONGLONG now = GetTickCount64();
  if (now - lastHostCheckMs_ < kRetryIntervalMs) return true;
  lastHostCheckMs_ = now;
  return WaitForSingleObject(hostProcess_, 0) != WAIT_OBJECT_0;
}

void GuideFeed::Disconnect(const char* reason) {
  Log("feed: disconnected (%s)", reason);
  Close();
}

void GuideFeed::Close() {
  if (view_ != nullptr) UnmapViewOfFile(view_);
  if (mapping_ != nullptr) CloseHandle(mapping_);
  if (hostProcess_ != nullptr) CloseHandle(hostProcess_);
  view_ = nullptr;
  mapping_ = nullptr;
  hostProcess_ = nullptr;
}

}  // namespace sprint::xr
