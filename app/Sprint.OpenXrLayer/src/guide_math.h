// The driving guide's geometry, free of Windows and OpenXR so it builds and tests anywhere.
// docs/internals/driving-guide.md ("From world to the driver's eye") is the contract; the
// TypeScript twin is app/desktop/src/guide/guideProjection.ts and the two must agree.
#pragma once

#include <cstdint>
#include <vector>

#include "guide_feed_layout.h"

namespace sprint::guide {

struct Vec3 {
  float x = 0.f;
  float y = 0.f;
  float z = 0.f;
};

// World positions stay in double until they are made relative to the car: tracks span kilometres.
struct DVec3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
};

struct Vec4 {
  float x = 0.f;
  float y = 0.f;
  float z = 0.f;
  float w = 0.f;
};

struct Quat {
  float x = 0.f;
  float y = 0.f;
  float z = 0.f;
  float w = 1.f;
};

// Row-major storage, column vectors: clip = m * (x, y, z, 1). HLSL reads it as row_major.
struct Mat4 {
  float m[16] = {};
};

// The player's car as the feed states it. The quaternion rotates body vectors into world vectors;
// velocity and angular velocity are in the body frame (+X right, +Y up, -Z forward).
struct CarPose {
  DVec3 position;
  Quat orientation;
  Vec3 velocity;
  Vec3 angular;
  double trackPosition = 0.0;  // lap fraction 0..1
};

// Where the driver's eye sits in the car and how the guide is turned to meet the game's camera.
struct SeatCalibration {
  float right = 0.f;
  float up = 0.f;
  float forward = 0.f;
  float yawDegrees = 0.f;
  float pitchDegrees = 0.f;
};

struct LinePoint {
  Vec3 position;
  Pedal pedal = Pedal::Coast;
};

struct BrakeBoard {
  Vec3 base;           // centre of the board's foot, world metres
  float facingX = 0.f;  // unit horizontal vector pointing back toward the approaching car
  float facingZ = 0.f;
  float width = 0.f;
  float height = 0.f;
  uint32_t pointIndex = 0;
};

// The reference lap. Point i sits at lap fraction i * positionStep; the last point repeats the first.
struct GuideGeometry {
  uint32_t id = 0;
  double positionStep = 0.0;
  double trackLength = 0.0;
  std::vector<LinePoint> points;
  std::vector<BrakeBoard> boards;
};

// One consistent read of the shared memory, already parsed. guide_feed.cpp fills it on Windows;
// tests build it by hand.
struct GuideSnapshot {
  bool poseValid = false;
  int64_t sampleQpc = 0;
  int64_t qpcFrequency = 0;
  CarPose pose;
  uint32_t settingsFlags = 0;
  SeatCalibration calibration;
  float metersAhead = 0.f;
  GuideGeometry geometry;
};

// Seat-space position and linear colour with straight (not premultiplied) alpha.
struct Vertex {
  float x, y, z;
  float r, g, b, a;
};

// Tangent half-angles of an eye's frustum, as XrFovf states them (left and down are usually negative).
struct Fov {
  float angleLeft = 0.f;
  float angleRight = 0.f;
  float angleUp = 0.f;
  float angleDown = 0.f;
};

inline constexpr double kMaxExtrapolationSeconds = 0.1;
inline constexpr float kNearMeters = 4.f;          // the line starts this far ahead, off the bonnet
inline constexpr float kRibbonHalfWidth = 0.15f;
inline constexpr float kRibbonAlpha = 0.85f;
inline constexpr float kRibbonFadeFraction = 0.3f;  // the far 30% of the window fades out
inline constexpr float kBoardLift = 0.3f;           // board bottom edge above its base
inline constexpr float kBoardInset = 0.08f;         // white frame width
inline constexpr float kBoardAlpha = 0.9f;

Quat Multiply(const Quat& a, const Quat& b);
Vec3 Rotate(const Quat& q, const Vec3& v);

// Moves the pose forward by dt seconds, clamped to 0..kMaxExtrapolationSeconds:
// position += q*v*dt, orientation = q * (rotation of |w|dt about w/|w|).
CarPose ExtrapolatePose(const CarPose& pose, double dtSeconds);

// world -> seat in one step: s = rotation * (w - carPosition) - offset.
struct SeatTransform {
  float rotation[9] = {};  // row-major 3x3: Rx(pitch) * Ry(-yaw) * R(q)^-1
  DVec3 carPosition;
  Vec3 offset;             // Rx(pitch) * Ry(-yaw) * e, e = (right, up, -forward)
};

SeatTransform MakeSeatTransform(const CarPose& pose, const SeatCalibration& calibration);
Vec3 WorldToSeat(const SeatTransform& transform, const Vec3& world);

// A position on the reference lap inside the visible window.
struct LineSample {
  uint32_t index = 0;     // point index, already wrapped into 0..pointCount-2
  float t = 0.f;          // fraction of the way from point `index` to point `index + 1`
  float distance = 0.f;   // metres ahead of the car
};

// The samples from kNearMeters to metersAhead ahead of the car, in order, wrapping across the lap
// end. The first and last samples sit exactly on the window edges so the ribbon does not pop.
void SampleLineWindow(const GuideGeometry& geometry, double trackPosition, float metersAhead,
                      std::vector<LineSample>& out);

// True when the board's line point lies between kNearMeters and metersAhead ahead of the car.
bool BoardInWindow(const GuideGeometry& geometry, double trackPosition, float metersAhead,
                   uint32_t pointIndex);

// True when the feed asks for VR, for at least one of line and boards, and has a usable pose and lap.
bool ShouldDraw(const GuideSnapshot& snapshot);

// Builds the triangle list for one frame in seat space: the ribbon (when the line flag is on) and
// then the boards (when the boards flag is on). `pose` is the extrapolated car pose.
void BuildGuideMesh(const GuideSnapshot& snapshot, const CarPose& pose, std::vector<Vertex>& out);

// View-projection for one eye: the view is the inverse of the eye pose; the projection is the
// asymmetric OpenXR frustum (right-handed, -Z forward) mapped to D3D clip space (depth 0..1).
Mat4 ViewProjection(const Quat& eyeOrientation, const Vec3& eyePosition, const Fov& fov,
                    float nearZ, float farZ);

Vec4 Transform(const Mat4& m, const Vec3& v);

float SrgbToLinear(float c);

}  // namespace sprint::guide
