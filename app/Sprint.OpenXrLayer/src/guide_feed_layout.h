// The driving guide feed: a named shared-memory block the Sprint host writes and the
// OpenXR layer reads. This header and app/Sprint.Desktop.Host/DrivingGuide/DrivingGuideFeedLayout.cs
// describe the same bytes; change both or neither, and bump kVersion when a field moves.
//
// Every block is a seqlock. The writer makes its sequence odd, writes, then makes it even.
// A reader copies the block and keeps the copy only when the sequence was even and unchanged
// across the copy. Little-endian, no padding beyond what the offsets state.
//
// Coordinates: right-handed, +Y up. World positions are the game's world mapped into that
// convention. The car body frame is +X right, +Y up, -Z forward (the OpenXR convention), and
// the pose quaternion rotates body vectors into world vectors.
#pragma once

#include <cstdint>

namespace sprint::guide {

inline constexpr const wchar_t* kMappingName = L"Local\\SprintDrivingGuide";
inline constexpr uint32_t kMagic = 0x47445053;  // "SPDG"
inline constexpr uint32_t kVersion = 1;

// Header.
inline constexpr uint32_t kMagicOffset = 0;            // u32
inline constexpr uint32_t kVersionOffset = 4;          // u32
inline constexpr uint32_t kTotalSizeOffset = 8;        // u32
inline constexpr uint32_t kHostProcessIdOffset = 12;   // u32, diagnostics only

// Pose block: the player's car, written on every telemetry read.
inline constexpr uint32_t kPoseSeqOffset = 64;          // u32
inline constexpr uint32_t kPoseFlagsOffset = 68;        // u32, bit 0: valid (in the car, live)
inline constexpr uint32_t kPoseSampleQpcOffset = 72;    // i64, QueryPerformanceCounter when the host read it
inline constexpr uint32_t kPoseQpcFrequencyOffset = 80; // i64, QueryPerformanceFrequency
inline constexpr uint32_t kPosePositionOffset = 88;     // 3 x f64, world metres
inline constexpr uint32_t kPoseOrientationOffset = 112; // 4 x f32, quaternion x, y, z, w (body to world)
inline constexpr uint32_t kPoseVelocityOffset = 128;    // 3 x f32, body frame m/s
inline constexpr uint32_t kPoseAngularOffset = 140;     // 3 x f32, body frame rad/s
inline constexpr uint32_t kPoseTrackPositionOffset = 152; // f64, lap fraction 0..1
inline constexpr uint32_t kPoseFlagValid = 1u << 0;

// Settings block: what to draw and the seat calibration.
inline constexpr uint32_t kSettingsSeqOffset = 192;     // u32
inline constexpr uint32_t kSettingsFlagsOffset = 196;   // u32
inline constexpr uint32_t kSettingsEyeOffset = 200;     // 3 x f32: right, up, forward (metres, body frame)
inline constexpr uint32_t kSettingsYawOffset = 212;     // f32, degrees; positive turns the guide right
inline constexpr uint32_t kSettingsPitchOffset = 216;   // f32, degrees; positive raises the guide
inline constexpr uint32_t kSettingsMetersAheadOffset = 220; // f32
inline constexpr uint32_t kSettingsFlagLine = 1u << 0;
inline constexpr uint32_t kSettingsFlagBoards = 1u << 1;
inline constexpr uint32_t kSettingsFlagVr = 1u << 2;

// Geometry block: the reference lap, rewritten only when the lap changes. Its sequence also
// guards the point and board arrays.
inline constexpr uint32_t kGeometrySeqOffset = 256;     // u32
inline constexpr uint32_t kGeometryIdOffset = 260;      // u32, 0 = no geometry; changes with every new lap
inline constexpr uint32_t kGeometryPointCountOffset = 264; // u32
inline constexpr uint32_t kGeometryBoardCountOffset = 268; // u32
inline constexpr uint32_t kGeometryPositionStepOffset = 272;   // f64, lap fraction between points
inline constexpr uint32_t kGeometryTrackLengthOffset = 280;    // f64, metres

// Point i sits at lap fraction i * PositionStep. The last point closes the lap on the first.
inline constexpr uint32_t kPointsOffset = 512;
inline constexpr uint32_t kPointStride = 16;   // f32 x, y, z; u32 pedal
inline constexpr uint32_t kMaxPoints = 20000;

inline constexpr uint32_t kBoardsOffset = kPointsOffset + kPointStride * kMaxPoints;  // 320512
inline constexpr uint32_t kBoardStride = 32;   // f32 x, y, z (base centre); f32 facingX, facingZ; f32 width, height; u32 point index
inline constexpr uint32_t kMaxBoards = 256;

inline constexpr uint32_t kTotalSize = kBoardsOffset + kBoardStride * kMaxBoards;     // 328704

enum class Pedal : uint32_t { Coast = 0, Throttle = 1, Brake = 2 };

// Colours, sRGB-encoded 0..1 RGBA: convert to linear before writing to an _SRGB swapchain.
// They repeat dashColor in packages/dashboard/src/palette.ts
// (green, yellow, red, text), because this side cannot read it.
inline constexpr float kThrottleColor[4] = {0x16 / 255.f, 0xB5 / 255.f, 0x66 / 255.f, 1.f};
inline constexpr float kCoastColor[4] = {0xE0 / 255.f, 0xA3 / 255.f, 0x0C / 255.f, 1.f};
inline constexpr float kBrakeColor[4] = {0xF0 / 255.f, 0x27 / 255.f, 0x44 / 255.f, 1.f};
inline constexpr float kBoardEdgeColor[4] = {0xF5 / 255.f, 0xF5 / 255.f, 0xF7 / 255.f, 1.f};

}  // namespace sprint::guide
