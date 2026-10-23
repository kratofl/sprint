#include "guide_math.h"

#include <algorithm>
#include <cmath>

namespace sprint::guide {
namespace {

constexpr double kPi = 3.14159265358979323846;

using Mat3 = float[9];  // row-major

void QuatToMatrix(const Quat& q, Mat3& m) {
  const float xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
  const float xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
  const float wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
  m[0] = 1.f - 2.f * (yy + zz);
  m[1] = 2.f * (xy - wz);
  m[2] = 2.f * (xz + wy);
  m[3] = 2.f * (xy + wz);
  m[4] = 1.f - 2.f * (xx + zz);
  m[5] = 2.f * (yz - wx);
  m[6] = 2.f * (xz - wy);
  m[7] = 2.f * (yz + wx);
  m[8] = 1.f - 2.f * (xx + yy);
}

void Multiply3(const Mat3& a, const Mat3& b, Mat3& out) {
  for (int r = 0; r < 3; ++r) {
    for (int c = 0; c < 3; ++c) {
      out[r * 3 + c] = a[r * 3 + 0] * b[0 * 3 + c] + a[r * 3 + 1] * b[1 * 3 + c] + a[r * 3 + 2] * b[2 * 3 + c];
    }
  }
}

Vec3 Apply3(const Mat3& m, const Vec3& v) {
  return {m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z,
          m[6] * v.x + m[7] * v.y + m[8] * v.z};
}

Quat Normalize(const Quat& q) {
  const float length = std::sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (!(length > 1e-6f)) return Quat{};
  return {q.x / length, q.y / length, q.z / length, q.w / length};
}

// x wrapped into [0, n).
double WrapIndex(double x, uint32_t n) {
  double r = std::fmod(x, static_cast<double>(n));
  if (r < 0.0) r += n;
  if (r >= n) r = 0.0;  // fmod of a value just below a multiple can round up to n
  return r;
}

bool GeometryUsable(const GuideGeometry& geometry) {
  return geometry.points.size() >= 2 && std::isfinite(geometry.positionStep) && geometry.positionStep > 0.0 &&
         std::isfinite(geometry.trackLength) && geometry.trackLength > 0.0;
}

double MetersPerPoint(const GuideGeometry& geometry) { return geometry.positionStep * geometry.trackLength; }

// The window never reaches further than one lap, so it cannot overlap itself.
double EffectiveAhead(const GuideGeometry& geometry, float metersAhead) {
  const auto lap = MetersPerPoint(geometry) * static_cast<double>(geometry.points.size() - 1);
  return std::min(static_cast<double>(metersAhead), lap);
}

struct Rgba {
  float r, g, b, a;
};

Rgba LinearColor(const float (&srgb)[4]) {
  return {SrgbToLinear(srgb[0]), SrgbToLinear(srgb[1]), SrgbToLinear(srgb[2]), srgb[3]};
}

struct Palette {
  Rgba throttle = LinearColor(kThrottleColor);
  Rgba coast = LinearColor(kCoastColor);
  Rgba brake = LinearColor(kBrakeColor);
  Rgba boardEdge = LinearColor(kBoardEdgeColor);
};

const Palette& Colors() {
  static const Palette palette;
  return palette;
}

Rgba PedalColor(Pedal pedal) {
  switch (pedal) {
    case Pedal::Throttle:
      return Colors().throttle;
    case Pedal::Brake:
      return Colors().brake;
    case Pedal::Coast:
    default:
      return Colors().coast;
  }
}

// 0.85 up to 70% of the window, then a linear fade to 0 at its far edge.
float RibbonAlpha(float distance, double ahead) {
  const double fadeStart = ahead * (1.0 - kRibbonFadeFraction);
  if (distance <= fadeStart) return kRibbonAlpha;
  const double remaining = (ahead - distance) / (ahead * kRibbonFadeFraction);
  return kRibbonAlpha * static_cast<float>(std::clamp(remaining, 0.0, 1.0));
}

void Push(std::vector<Vertex>& out, const Vec3& p, const Rgba& c) {
  out.push_back({p.x, p.y, p.z, c.r, c.g, c.b, c.a});
}

void AppendRibbon(const GuideSnapshot& snapshot, const CarPose& pose, const SeatTransform& transform,
                  std::vector<Vertex>& out) {
  thread_local std::vector<LineSample> samples;
  const GuideGeometry& geometry = snapshot.geometry;
  SampleLineWindow(geometry, pose.trackPosition, snapshot.metersAhead, samples);
  if (samples.size() < 2) return;

  const auto n = static_cast<uint32_t>(geometry.points.size() - 1);
  const double ahead = EffectiveAhead(geometry, snapshot.metersAhead);

  struct Edge {
    Vec3 left, right;
    Rgba color;
  };
  Edge previous{};
  bool havePrevious = false;
  Vec3 lastRight{};
  bool haveRight = false;

  for (const LineSample& sample : samples) {
    const LinePoint& a = geometry.points[sample.index];
    const LinePoint& b = geometry.points[sample.index + 1];
    const Vec3 p{a.position.x + (b.position.x - a.position.x) * sample.t,
                 a.position.y + (b.position.y - a.position.y) * sample.t,
                 a.position.z + (b.position.z - a.position.z) * sample.t};

    // Horizontal right vector from the chord across this sample, so neighbouring quads share edges.
    const Vec3& behind = geometry.points[sample.index == 0 ? n - 1 : sample.index - 1].position;
    const float tx = b.position.x - behind.x;
    const float tz = b.position.z - behind.z;
    const float length = std::sqrt(tx * tx + tz * tz);
    Vec3 right;
    if (length > 1e-4f) {
      right = {-tz / length, 0.f, tx / length};
      lastRight = right;
      haveRight = true;
    } else if (haveRight) {
      right = lastRight;
    } else {
      continue;  // duplicate points before any direction is known
    }

    Rgba color = PedalColor(a.pedal);
    color.a = RibbonAlpha(sample.distance, ahead);
    const Edge edge{
        WorldToSeat(transform, {p.x - right.x * kRibbonHalfWidth, p.y, p.z - right.z * kRibbonHalfWidth}),
        WorldToSeat(transform, {p.x + right.x * kRibbonHalfWidth, p.y, p.z + right.z * kRibbonHalfWidth}),
        color};
    if (havePrevious) {
      Push(out, previous.left, previous.color);
      Push(out, previous.right, previous.color);
      Push(out, edge.right, edge.color);
      Push(out, previous.left, previous.color);
      Push(out, edge.right, edge.color);
      Push(out, edge.left, edge.color);
    }
    previous = edge;
    havePrevious = true;
  }
}

void AppendBoards(const GuideSnapshot& snapshot, const CarPose& pose, const SeatTransform& transform,
                  std::vector<Vertex>& out) {
  const GuideGeometry& geometry = snapshot.geometry;
  Rgba edgeColor = Colors().boardEdge;
  edgeColor.a = kBoardAlpha;
  Rgba fillColor = Colors().brake;
  fillColor.a = kBoardAlpha;

  for (const BrakeBoard& board : geometry.boards) {
    if (!BoardInWindow(geometry, pose.trackPosition, snapshot.metersAhead, board.pointIndex)) continue;
    const float facingLength = std::sqrt(board.facingX * board.facingX + board.facingZ * board.facingZ);
    if (!(facingLength > 1e-4f) || !(board.width > 0.f) || !(board.height > 0.f)) continue;

    // Horizontal axis in the board's plane; the plane's normal is the facing vector.
    const float acrossX = -board.facingZ / facingLength;
    const float acrossZ = board.facingX / facingLength;
    const float bottom = board.base.y + kBoardLift;
    const auto corner = [&](float u, float v) {
      return WorldToSeat(transform, {board.base.x + acrossX * u, bottom + v, board.base.z + acrossZ * u});
    };
    const auto quad = [&](float u0, float u1, float v0, float v1, const Rgba& color) {
      const Vec3 c00 = corner(u0, v0), c10 = corner(u1, v0), c11 = corner(u1, v1), c01 = corner(u0, v1);
      Push(out, c00, color);
      Push(out, c10, color);
      Push(out, c11, color);
      Push(out, c00, color);
      Push(out, c11, color);
      Push(out, c01, color);
    };

    const float half = board.width * 0.5f;
    const float top = board.height;
    const float i = kBoardInset;
    if (board.width <= 2.f * i || board.height <= 2.f * i) {
      quad(-half, half, 0.f, top, edgeColor);
      continue;
    }
    // The frame is four strips around the fill, so nothing overlaps and alpha stays even.
    quad(-half, half, 0.f, i, edgeColor);
    quad(-half, half, top - i, top, edgeColor);
    quad(-half, -half + i, i, top - i, edgeColor);
    quad(half - i, half, i, top - i, edgeColor);
    quad(-half + i, half - i, i, top - i, fillColor);
  }
}

}  // namespace

Quat Multiply(const Quat& a, const Quat& b) {
  return {a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
          a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}

Vec3 Rotate(const Quat& q, const Vec3& v) {
  // v + w*t + u x t with t = 2 (u x v), u the vector part.
  const Vec3 t{2.f * (q.y * v.z - q.z * v.y), 2.f * (q.z * v.x - q.x * v.z), 2.f * (q.x * v.y - q.y * v.x)};
  return {v.x + q.w * t.x + (q.y * t.z - q.z * t.y), v.y + q.w * t.y + (q.z * t.x - q.x * t.z),
          v.z + q.w * t.z + (q.x * t.y - q.y * t.x)};
}

CarPose ExtrapolatePose(const CarPose& pose, double dtSeconds) {
  const double dt = dtSeconds > 0.0 ? std::min(dtSeconds, kMaxExtrapolationSeconds) : 0.0;  // NaN -> 0
  CarPose result = pose;
  if (dt == 0.0) return result;

  const Vec3 worldVelocity = Rotate(pose.orientation, pose.velocity);
  result.position.x += worldVelocity.x * dt;
  result.position.y += worldVelocity.y * dt;
  result.position.z += worldVelocity.z * dt;

  const Vec3& w = pose.angular;
  const double rate = std::sqrt(static_cast<double>(w.x) * w.x + static_cast<double>(w.y) * w.y +
                                static_cast<double>(w.z) * w.z);
  const double angle = rate * dt;
  if (angle > 1e-9) {
    const double s = std::sin(angle * 0.5) / rate;
    const Quat delta{static_cast<float>(w.x * s), static_cast<float>(w.y * s), static_cast<float>(w.z * s),
                     static_cast<float>(std::cos(angle * 0.5))};
    // Body-frame angular velocity composes on the right.
    result.orientation = Normalize(Multiply(pose.orientation, delta));
  }
  return result;
}

SeatTransform MakeSeatTransform(const CarPose& pose, const SeatCalibration& calibration) {
  const auto yaw = static_cast<float>(calibration.yawDegrees * kPi / 180.0);
  const auto pitch = static_cast<float>(calibration.pitchDegrees * kPi / 180.0);
  const float cy = std::cos(yaw), sy = std::sin(yaw);
  const float cp = std::cos(pitch), sp = std::sin(pitch);
  const Mat3 rotateYawBack = {cy, 0.f, -sy, 0.f, 1.f, 0.f, sy, 0.f, cy};  // Ry(-yaw)
  const Mat3 rotatePitch = {1.f, 0.f, 0.f, 0.f, cp, -sp, 0.f, sp, cp};    // Rx(pitch)
  Mat3 calibrationRotation;
  Multiply3(rotatePitch, rotateYawBack, calibrationRotation);

  Mat3 bodyToWorld;
  QuatToMatrix(Normalize(pose.orientation), bodyToWorld);
  const Mat3 worldToBody = {bodyToWorld[0], bodyToWorld[3], bodyToWorld[6], bodyToWorld[1], bodyToWorld[4],
                            bodyToWorld[7], bodyToWorld[2], bodyToWorld[5], bodyToWorld[8]};

  SeatTransform transform;
  Multiply3(calibrationRotation, worldToBody, transform.rotation);
  transform.carPosition = pose.position;
  transform.offset = Apply3(calibrationRotation, {calibration.right, calibration.up, -calibration.forward});
  return transform;
}

Vec3 WorldToSeat(const SeatTransform& transform, const Vec3& world) {
  const Vec3 relative{static_cast<float>(world.x - transform.carPosition.x),
                      static_cast<float>(world.y - transform.carPosition.y),
                      static_cast<float>(world.z - transform.carPosition.z)};
  const Vec3 s = Apply3(transform.rotation, relative);
  return {s.x - transform.offset.x, s.y - transform.offset.y, s.z - transform.offset.z};
}

void SampleLineWindow(const GuideGeometry& geometry, double trackPosition, float metersAhead,
                      std::vector<LineSample>& out) {
  out.clear();
  if (!GeometryUsable(geometry) || !std::isfinite(trackPosition) || !std::isfinite(metersAhead)) return;
  const auto n = static_cast<uint32_t>(geometry.points.size() - 1);
  const double metersPerPoint = MetersPerPoint(geometry);
  const double ahead = EffectiveAhead(geometry, metersAhead);
  if (!(ahead > kNearMeters)) return;

  const double i0 = WrapIndex(trackPosition / geometry.positionStep, n);
  const double start = i0 + kNearMeters / metersPerPoint;
  const double end = i0 + ahead / metersPerPoint;
  const auto push = [&](double f) {
    const double whole = std::floor(f);
    out.push_back({static_cast<uint32_t>(WrapIndex(whole, n)), static_cast<float>(f - whole),
                   static_cast<float>((f - i0) * metersPerPoint)});
  };
  push(start);
  for (double k = std::floor(start) + 1.0; k < end; k += 1.0) push(k);
  push(end);
}

bool BoardInWindow(const GuideGeometry& geometry, double trackPosition, float metersAhead, uint32_t pointIndex) {
  if (!GeometryUsable(geometry) || !std::isfinite(trackPosition)) return false;
  const auto n = static_cast<uint32_t>(geometry.points.size() - 1);
  const double i0 = WrapIndex(trackPosition / geometry.positionStep, n);
  const double distance = WrapIndex(static_cast<double>(pointIndex) - i0, n) * MetersPerPoint(geometry);
  return distance >= kNearMeters && distance <= EffectiveAhead(geometry, metersAhead);
}

bool ShouldDraw(const GuideSnapshot& snapshot) {
  const uint32_t flags = snapshot.settingsFlags;
  if ((flags & kSettingsFlagVr) == 0) return false;
  if ((flags & (kSettingsFlagLine | kSettingsFlagBoards)) == 0) return false;
  if (!snapshot.poseValid || !std::isfinite(snapshot.pose.trackPosition)) return false;
  if (!(snapshot.metersAhead > kNearMeters)) return false;
  return snapshot.geometry.id != 0 && GeometryUsable(snapshot.geometry);
}

void BuildGuideMesh(const GuideSnapshot& snapshot, const CarPose& pose, std::vector<Vertex>& out) {
  out.clear();
  if (!ShouldDraw(snapshot)) return;
  const SeatTransform transform = MakeSeatTransform(pose, snapshot.calibration);
  if (snapshot.settingsFlags & kSettingsFlagLine) AppendRibbon(snapshot, pose, transform, out);
  if (snapshot.settingsFlags & kSettingsFlagBoards) AppendBoards(snapshot, pose, transform, out);
}

Mat4 ViewProjection(const Quat& eyeOrientation, const Vec3& eyePosition, const Fov& fov, float nearZ,
                    float farZ) {
  Mat3 eyeToSpace;
  QuatToMatrix(Normalize(eyeOrientation), eyeToSpace);
  // View: the transpose of the eye rotation, then minus the rotated eye position.
  const Mat3 r = {eyeToSpace[0], eyeToSpace[3], eyeToSpace[6], eyeToSpace[1], eyeToSpace[4],
                  eyeToSpace[7], eyeToSpace[2], eyeToSpace[5], eyeToSpace[8]};
  const Vec3 t = Apply3(r, eyePosition);
  const float view[16] = {r[0], r[1], r[2], -t.x, r[3], r[4], r[5], -t.y,
                          r[6], r[7], r[8], -t.z, 0.f,  0.f,  0.f,  1.f};

  const float left = std::tan(fov.angleLeft);
  const float right = std::tan(fov.angleRight);
  const float up = std::tan(fov.angleUp);
  const float down = std::tan(fov.angleDown);
  const float width = right - left;
  const float height = up - down;
  // Points ahead have z < 0, so w = -z; depth maps near -> 0 and far -> 1.
  const float projection[16] = {2.f / width, 0.f, (right + left) / width, 0.f,
                                0.f, 2.f / height, (up + down) / height, 0.f,
                                0.f, 0.f, farZ / (nearZ - farZ), nearZ * farZ / (nearZ - farZ),
                                0.f, 0.f, -1.f, 0.f};

  Mat4 result;
  for (int row = 0; row < 4; ++row) {
    for (int col = 0; col < 4; ++col) {
      float sum = 0.f;
      for (int k = 0; k < 4; ++k) sum += projection[row * 4 + k] * view[k * 4 + col];
      result.m[row * 4 + col] = sum;
    }
  }
  return result;
}

Vec4 Transform(const Mat4& m, const Vec3& v) {
  const float* a = m.m;
  return {a[0] * v.x + a[1] * v.y + a[2] * v.z + a[3], a[4] * v.x + a[5] * v.y + a[6] * v.z + a[7],
          a[8] * v.x + a[9] * v.y + a[10] * v.z + a[11], a[12] * v.x + a[13] * v.y + a[14] * v.z + a[15]};
}

float SrgbToLinear(float c) {
  return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f);
}

}  // namespace sprint::guide
