// Tests for the portable guide geometry. No framework: each check prints on failure and the
// process exits non-zero when any failed, which is all ctest needs.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

#include "guide_math.h"

using namespace sprint::guide;

namespace {

int failures = 0;

void Check(bool condition, const char* what, int line) {
  if (!condition) {
    std::printf("FAIL line %d: %s\n", line, what);
    ++failures;
  }
}

bool Near(double a, double b, double tolerance = 1e-4) { return std::fabs(a - b) <= tolerance; }

bool Near(const Vec3& a, const Vec3& b, double tolerance = 1e-4) {
  return Near(a.x, b.x, tolerance) && Near(a.y, b.y, tolerance) && Near(a.z, b.z, tolerance);
}

#define CHECK(condition) Check((condition), #condition, __LINE__)

constexpr double kPi = 3.14159265358979323846;

Quat AboutY(double radians) {
  return {0.f, static_cast<float>(std::sin(radians / 2)), 0.f, static_cast<float>(std::cos(radians / 2))};
}

const Vec3 kForward{0.f, 0.f, -1.f};

// A closed lap of `segments` points spaced `spacing` metres apart along world -Z, plus the closing
// point. Straight, so a lap that "closes" is unrealistic, but the indices are all that matters here.
GuideGeometry StraightLap(uint32_t segments, double spacing) {
  GuideGeometry geometry;
  geometry.id = 1;
  geometry.positionStep = 1.0 / segments;
  geometry.trackLength = spacing * segments;
  for (uint32_t i = 0; i <= segments; ++i) {
    geometry.points.push_back({{0.f, 0.f, -static_cast<float>(i * spacing)}, Pedal::Throttle});
  }
  return geometry;
}

void ExtrapolationZeroDtIsIdentity() {
  CarPose pose;
  pose.position = {10.0, 2.0, -30.0};
  pose.orientation = AboutY(0.3);
  pose.velocity = {1.f, 0.f, -40.f};
  pose.angular = {0.2f, 0.5f, 0.f};
  const CarPose result = ExtrapolatePose(pose, 0.0);
  CHECK(result.position.x == pose.position.x && result.position.y == pose.position.y &&
        result.position.z == pose.position.z);
  CHECK(result.orientation.x == pose.orientation.x && result.orientation.y == pose.orientation.y &&
        result.orientation.z == pose.orientation.z && result.orientation.w == pose.orientation.w);
  // A negative dt (a sample newer than the frame) also leaves the pose alone.
  CHECK(ExtrapolatePose(pose, -0.02).position.z == pose.position.z);
}

void ExtrapolationYawRateTurnsHeading() {
  CarPose pose;
  pose.angular = {0.f, 1.f, 0.f};  // 1 rad/s to the left, about body +Y
  const CarPose result = ExtrapolatePose(pose, 0.1);
  const Vec3 heading = Rotate(result.orientation, kForward);
  CHECK(Near(heading, {static_cast<float>(-std::sin(0.1)), 0.f, static_cast<float>(-std::cos(0.1))}));
}

void ExtrapolationMovesAlongBodyVelocity() {
  CarPose pose;
  pose.orientation = AboutY(kPi / 2);  // facing world -X
  pose.velocity = {0.f, 0.f, -20.f};   // 20 m/s forward
  const CarPose result = ExtrapolatePose(pose, 0.05);
  CHECK(Near(result.position.x, -1.0) && Near(result.position.z, 0.0));
}

void ExtrapolationAngularVelocityIsBodyFrame() {
  // Facing world -X, pitching about the body's own X axis: the body up vector tips toward world +X.
  // A world-frame composition would tip it toward world +Z instead.
  CarPose pose;
  pose.orientation = AboutY(kPi / 2);
  pose.angular = {1.f, 0.f, 0.f};
  const CarPose result = ExtrapolatePose(pose, 0.1);
  const Vec3 up = Rotate(result.orientation, {0.f, 1.f, 0.f});
  CHECK(Near(up, {static_cast<float>(std::sin(0.1)), static_cast<float>(std::cos(0.1)), 0.f}));
}

void ExtrapolationClampsAt100Ms() {
  CarPose pose;
  pose.velocity = {0.f, 0.f, -50.f};
  pose.angular = {0.f, 1.f, 0.f};
  const CarPose clamped = ExtrapolatePose(pose, 0.5);
  const CarPose limit = ExtrapolatePose(pose, 0.1);
  CHECK(Near(clamped.position.z, -5.0));
  CHECK(Near(clamped.position.z, limit.position.z));
  CHECK(Near(Rotate(clamped.orientation, kForward), Rotate(limit.orientation, kForward)));
}

void SeatStraightAheadIsMinusZ() {
  CarPose pose;
  const SeatTransform transform = MakeSeatTransform(pose, {});
  CHECK(Near(WorldToSeat(transform, {0.f, 0.f, -10.f}), {0.f, 0.f, -10.f}));

  // Far from the world origin the result is still exact enough: positions subtract in double.
  pose.position = {4000.0, 50.0, -3000.0};
  const SeatTransform far = MakeSeatTransform(pose, {});
  CHECK(Near(WorldToSeat(far, {4000.f, 50.f, -3010.f}), {0.f, 0.f, -10.f}, 1e-3));
}

void SeatFollowsCarHeading() {
  CarPose pose;
  pose.orientation = AboutY(kPi / 2);  // facing world -X
  const SeatTransform transform = MakeSeatTransform(pose, {});
  CHECK(Near(WorldToSeat(transform, {-10.f, 0.f, 0.f}), {0.f, 0.f, -10.f}));
  CHECK(Near(WorldToSeat(transform, {0.f, 0.f, -10.f}), {10.f, 0.f, 0.f}));  // world -Z is to the car's right
}

void SeatSubtractsEyeOffset() {
  SeatCalibration calibration;
  calibration.right = 0.3f;
  calibration.up = 1.1f;
  calibration.forward = 0.2f;
  const SeatTransform transform = MakeSeatTransform({}, calibration);
  CHECK(Near(WorldToSeat(transform, {0.f, 0.f, -10.f}), {-0.3f, -1.1f, -9.8f}));
}

void SeatYawTurnsGuideRight() {
  SeatCalibration calibration;
  calibration.yawDegrees = 10.f;
  const SeatTransform transform = MakeSeatTransform({}, calibration);
  const double yaw = 10.0 * kPi / 180.0;
  const Vec3 s = WorldToSeat(transform, {0.f, 0.f, -10.f});
  CHECK(s.x > 0.f);
  CHECK(Near(s, {static_cast<float>(10 * std::sin(yaw)), 0.f, static_cast<float>(-10 * std::cos(yaw))}));
}

void SeatPitchRaisesGuide() {
  SeatCalibration calibration;
  calibration.pitchDegrees = 5.f;
  const SeatTransform transform = MakeSeatTransform({}, calibration);
  const double pitch = 5.0 * kPi / 180.0;
  const Vec3 s = WorldToSeat(transform, {0.f, 0.f, -10.f});
  CHECK(s.y > 0.f);
  CHECK(Near(s, {0.f, static_cast<float>(10 * std::sin(pitch)), static_cast<float>(-10 * std::cos(pitch))}));
}

void LineWindowWrapsAcrossLapEnd() {
  const GuideGeometry geometry = StraightLap(100, 10.0);  // 10 m per point, 1000 m lap
  std::vector<LineSample> samples;
  SampleLineWindow(geometry, 0.97, 60.f, samples);  // car at point 97

  const uint32_t expectedIndex[] = {97, 98, 99, 0, 1, 2, 3};
  const float expectedT[] = {0.4f, 0.f, 0.f, 0.f, 0.f, 0.f, 0.f};
  const float expectedDistance[] = {4.f, 10.f, 20.f, 30.f, 40.f, 50.f, 60.f};
  CHECK(samples.size() == 7);
  if (samples.size() == 7) {
    for (size_t i = 0; i < samples.size(); ++i) {
      CHECK(samples[i].index == expectedIndex[i]);
      CHECK(Near(samples[i].t, expectedT[i]));
      CHECK(Near(samples[i].distance, expectedDistance[i], 1e-3));
    }
  }

  // The window never laps itself, however far ahead the setting asks for.
  SampleLineWindow(geometry, 0.5, 5000.f, samples);
  CHECK(!samples.empty() && Near(samples.back().distance, 1000.0, 1e-2));
}

void BoardWindowCountsWrappedDistance() {
  const GuideGeometry geometry = StraightLap(100, 10.0);
  const double carAt97 = 0.97;
  CHECK(BoardInWindow(geometry, carAt97, 60.f, 2));     // 50 m ahead, across the lap end
  CHECK(!BoardInWindow(geometry, carAt97, 40.f, 2));    // beyond the setting
  CHECK(BoardInWindow(geometry, carAt97, 60.f, 98));    // 10 m ahead
  CHECK(!BoardInWindow(geometry, carAt97, 60.f, 97));   // at the car, inside the 4 m gap
  CHECK(!BoardInWindow(geometry, carAt97, 60.f, 96));   // just behind: 990 m ahead
  CHECK(BoardInWindow(geometry, carAt97, 60.f, 100));   // the closing point is point 0, 30 m ahead
}

void RibbonLiesFlatAcrossTheLineAndFades() {
  // The car sits at point 10, away from the straight test lap's unrealistic seam at point 0.
  GuideSnapshot snapshot;
  snapshot.poseValid = true;
  snapshot.settingsFlags = kSettingsFlagVr | kSettingsFlagLine;
  snapshot.metersAhead = 60.f;
  snapshot.geometry = StraightLap(100, 10.0);
  snapshot.pose.position = {0.0, 0.0, -100.0};
  snapshot.pose.trackPosition = 0.1;
  std::vector<Vertex> mesh;
  BuildGuideMesh(snapshot, snapshot.pose, mesh);

  CHECK(!mesh.empty() && mesh.size() % 6 == 0);
  bool flat = true;
  float nearest = -1e9f, farthest = 1e9f;
  for (const Vertex& v : mesh) {
    flat = flat && Near(std::fabs(v.x), kRibbonHalfWidth) && Near(v.y, 0.0);
    nearest = std::max(nearest, v.z);
    farthest = std::min(farthest, v.z);
  }
  CHECK(flat);
  CHECK(Near(nearest, -4.0, 1e-3) && Near(farthest, -60.0, 1e-3));
  // First quad's left edge sits on the car's left (-x), and the far edge is fully faded.
  if (!mesh.empty()) {
    CHECK(mesh.front().x < 0.f);
    CHECK(Near(mesh.front().a, kRibbonAlpha));
    CHECK(Near(mesh.back().a, 0.0));
  }

  snapshot.settingsFlags = kSettingsFlagLine;  // VR off: nothing to draw
  BuildGuideMesh(snapshot, snapshot.pose, mesh);
  CHECK(mesh.empty());
}

void ProjectionMapsFrustumEdges() {
  const Fov fov{static_cast<float>(-kPi / 4), static_cast<float>(kPi / 4), static_cast<float>(kPi / 4),
                static_cast<float>(-kPi / 4)};
  const Mat4 identity = ViewProjection({}, {}, fov, 0.05f, 2000.f);
  const Vec4 centre = Transform(identity, {0.f, 0.f, -10.f});
  CHECK(Near(centre.x, 0.0) && Near(centre.y, 0.0) && Near(centre.w, 10.0));
  const Vec4 rightEdge = Transform(identity, {10.f, 0.f, -10.f});
  CHECK(Near(rightEdge.x / rightEdge.w, 1.0));
  const Vec4 nearPlane = Transform(identity, {0.f, 0.f, -0.05f});
  CHECK(Near(nearPlane.z / nearPlane.w, 0.0));

  // An eye turned to face -X and raised 1 m sees (-5, 1, 0) dead centre.
  const Mat4 turned = ViewProjection(AboutY(kPi / 2), {0.f, 1.f, 0.f}, fov, 0.05f, 2000.f);
  const Vec4 ahead = Transform(turned, {-5.f, 1.f, 0.f});
  CHECK(Near(ahead.x / ahead.w, 0.0) && Near(ahead.y / ahead.w, 0.0) && Near(ahead.w, 5.0));
}

}  // namespace

int main() {
  ExtrapolationZeroDtIsIdentity();
  ExtrapolationYawRateTurnsHeading();
  ExtrapolationMovesAlongBodyVelocity();
  ExtrapolationAngularVelocityIsBodyFrame();
  ExtrapolationClampsAt100Ms();
  SeatStraightAheadIsMinusZ();
  SeatFollowsCarHeading();
  SeatSubtractsEyeOffset();
  SeatYawTurnsGuideRight();
  SeatPitchRaisesGuide();
  LineWindowWrapsAcrossLapEnd();
  BoardWindowCountsWrappedDistance();
  RibbonLiesFlatAcrossTheLineAndFades();
  ProjectionMapsFrustumEdges();
  if (failures == 0) std::printf("guide_math_test: all checks passed\n");
  return failures == 0 ? 0 : 1;
}
