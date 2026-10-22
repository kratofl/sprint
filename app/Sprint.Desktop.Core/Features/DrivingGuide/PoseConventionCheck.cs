using System.Numerics;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.DrivingGuide;

/// <summary>
/// Watches whether a game adapter's <see cref="CarPose"/> obeys the contract, from the car's own
/// motion: the body's forward axis must point where the car travels, and the reported yaw rate
/// must turn the way the heading turns. A transposed or mirrored orientation matrix fails one of
/// the two at the first corner, and it is invisible without a headset on, so it goes to the log.
/// </summary>
public sealed class PoseConventionCheck
{
    /// <summary>Below this the car is crawling or sliding; its travel says little about its heading.</summary>
    private const double MinSpeed = 15;

    /// <summary>Distance between two samples: long enough that noise does not decide the direction.</summary>
    private const double SampleMeters = 8;

    private const double MaxHeadingErrorDegrees = 25;
    private static readonly TimeSpan ReportEvery = TimeSpan.FromMinutes(1);

    private readonly ILog _log;
    private Vector3? _lastPosition;
    private Vector3 _lastForward;
    private DateTimeOffset _lastTime;
    private DateTimeOffset _lastReport = DateTimeOffset.MinValue;

    public PoseConventionCheck(ILog log)
    {
        this._log = log;
    }

    /// <summary>The last verdict, for tests: null until a sample was judged.</summary>
    public bool? Consistent { get; private set; }

    public void Observe(TelemetryFrame frame)
    {
        if (!frame.Session.InCar || frame.Car.Pose is not { } pose || frame.Car.SpeedMetersPerSecond < MinSpeed)
        {
            this._lastPosition = null;
            return;
        }

        Vector3 position = new((float)pose.PositionX, (float)pose.PositionY, (float)pose.PositionZ);
        Quaternion orientation = new(pose.OrientationX, pose.OrientationY, pose.OrientationZ, pose.OrientationW);
        Vector3 forward = Vector3.Transform(-Vector3.UnitZ, orientation);
        if (this._lastPosition is not { } last)
        {
            this.Remember(position, forward, frame.Timestamp);
            return;
        }

        Vector3 travel = position - last;
        double seconds = (frame.Timestamp - this._lastTime).TotalSeconds;
        if (travel.Length() < SampleMeters || seconds <= 0)
        {
            return;
        }

        double headingError = AngleDegrees(Flat(travel), Flat(forward + this._lastForward));

        // The world-frame yaw rate the telemetry claims, against how far the heading actually turned.
        float claimedYawRate = Vector3.Transform(new Vector3(pose.AngularVelocityX, pose.AngularVelocityY, pose.AngularVelocityZ), orientation).Y;
        float turned = Vector3.Cross(Flat(this._lastForward), Flat(forward)).Y;
        bool yawAgrees = Math.Abs(claimedYawRate) < 0.05 || Math.Abs(turned) < 1e-3 || Math.Sign(claimedYawRate) == Math.Sign(turned);

        this.Consistent = headingError <= MaxHeadingErrorDegrees && yawAgrees;
        if (this.Consistent == false && frame.Timestamp - this._lastReport >= ReportEvery)
        {
            this._lastReport = frame.Timestamp;
            this._log.Warn(
                $"Driving guide: the car pose disagrees with its motion (heading off by {headingError:F0} deg, "
                + $"yaw rate {(yawAgrees ? "agrees" : "has the wrong sign")}). The line will not sit on the road.");
        }

        this.Remember(position, forward, frame.Timestamp);
    }

    private void Remember(Vector3 position, Vector3 forward, DateTimeOffset time)
    {
        this._lastPosition = position;
        this._lastForward = forward;
        this._lastTime = time;
    }

    private static Vector3 Flat(Vector3 vector) => new(vector.X, 0, vector.Z);

    private static double AngleDegrees(Vector3 a, Vector3 b)
    {
        float lengths = a.Length() * b.Length();
        if (lengths < 1e-6f)
        {
            return 0;
        }

        double cosine = Math.Clamp(Vector3.Dot(a, b) / lengths, -1, 1);
        return Math.Acos(cosine) * 180 / Math.PI;
    }
}
