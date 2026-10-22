using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.DrivingGuide;

/// <summary>What the reference lap's driver was doing at a point. The values are the feed's wire values.</summary>
public enum GuidePedal : uint
{
    Coast = 0,
    Throttle = 1,
    Brake = 2,
}

/// <summary>One point of the line, in <c>CarPose</c>'s world frame.</summary>
public readonly record struct GuidePoint(float X, float Y, float Z, GuidePedal Pedal);

/// <summary>
/// A brake board: where the reference lap started braking, set beside the track on the outside
/// of the corner that follows.
/// </summary>
/// <param name="FacingX">With <paramref name="FacingZ"/>, the horizontal unit vector the board faces: back toward the approaching car.</param>
/// <param name="PointIndex">The line point the board belongs to, so a renderer can tell how far ahead it is.</param>
public readonly record struct GuideBoard(float X, float Y, float Z, float FacingX, float FacingZ, int PointIndex);

/// <summary>A reference lap drawn into the world. Point <c>i</c> is at lap fraction <c>i * PositionStep</c>.</summary>
public sealed record DrivingGuideGeometry(
    IReadOnlyList<GuidePoint> Line,
    IReadOnlyList<GuideBoard> Boards,
    double PositionStep,
    double TrackLengthMeters);

/// <summary>
/// Turns a lap trace into the guide's line and boards. Pure, so every rule here is a unit test.
/// </summary>
public static class DrivingGuideBuilder
{
    /// <summary>Board size in metres. A board reads as a sign, not as a wall.</summary>
    public const float BoardWidth = 1.5f;
    public const float BoardHeight = 2.0f;

    /// <summary>Brake travel that counts as braking on the line.</summary>
    private const float BrakeThreshold = 0.05f;

    /// <summary>Throttle travel that counts as driving on it; anything less is a lift.</summary>
    private const float ThrottleThreshold = 0.5f;

    /// <summary>
    /// A board marks a real braking zone, not a dab: the pedal must pass this, after the driver
    /// was off the brake for <see cref="QuietMetersBeforeBoard"/>.
    /// </summary>
    private const float BoardBrakeThreshold = 0.15f;
    private const double QuietMetersBeforeBoard = 60;

    /// <summary>How far ahead the corner's direction is read, and how far off the line the board stands.</summary>
    private const double CornerLookaheadMeters = 120;
    private const float BoardLateralMeters = 6f;

    /// <summary>
    /// The guide for a lap, or null when the trace has no world positions (laps recorded before
    /// the channels existed) or too few points to describe a track.
    /// </summary>
    public static DrivingGuideGeometry? Build(LapChannelTrace trace)
    {
        ArgumentNullException.ThrowIfNull(trace);

        if (!trace.IsUsable
            || !trace.TryGetChannel(LapTraceChannels.WorldX, out float[] xs)
            || !trace.TryGetChannel(LapTraceChannels.WorldY, out float[] ys)
            || !trace.TryGetChannel(LapTraceChannels.WorldZ, out float[] zs)
            || !trace.TryGetChannel(LapTraceChannels.Brake, out float[] brake)
            || !trace.TryGetChannel(LapTraceChannels.Throttle, out float[] throttle))
        {
            return null;
        }

        int count = trace.SampleCount;
        GuidePoint[] line = new GuidePoint[count];
        for (int i = 0; i < count; i++)
        {
            line[i] = new GuidePoint(xs[i], ys[i], zs[i], PedalAt(brake[i], throttle[i]));
        }

        double trackLength = trace.TrackLengthMeters is { } reported && double.IsFinite(reported) && reported > 0
            ? reported
            : PathLength(line);
        if (trackLength <= 0)
        {
            return null;
        }

        double metersPerPoint = trace.PositionStep * trackLength;
        return new DrivingGuideGeometry(line, Boards(line, brake, metersPerPoint), trace.PositionStep, trackLength);
    }

    private static GuidePedal PedalAt(float brake, float throttle) =>
        brake >= BrakeThreshold ? GuidePedal.Brake
        : throttle >= ThrottleThreshold ? GuidePedal.Throttle
        : GuidePedal.Coast;

    /// <summary>
    /// A board at every braking onset. The lap is a loop (the last point closes on the first),
    /// so the quiet stretch before a zone near the line wraps into the end of the lap.
    /// </summary>
    private static List<GuideBoard> Boards(GuidePoint[] line, float[] brake, double metersPerPoint)
    {
        List<GuideBoard> boards = [];
        int loop = line.Length - 1;
        int quietPoints = Math.Max(1, (int)Math.Ceiling(QuietMetersBeforeBoard / metersPerPoint));
        int lookahead = Math.Max(2, (int)Math.Round(CornerLookaheadMeters / metersPerPoint));

        for (int i = 0; i < loop; i++)
        {
            if (brake[i] < BoardBrakeThreshold || !QuietBefore(brake, i, quietPoints, loop))
            {
                continue;
            }

            GuidePoint here = line[i];
            GuidePoint next = line[(i + 1) % loop];
            GuidePoint ahead = line[(i + lookahead) % loop];
            if (!TryHorizontalUnit(next.X - here.X, next.Z - here.Z, out float tx, out float tz))
            {
                continue;
            }

            // Right of travel, for forward t in a right-handed Y-up frame: t × up = (-tz, 0, tx).
            float rightX = -tz;
            float rightZ = tx;
            bool turnsRight = ((ahead.X - here.X) * rightX) + ((ahead.Z - here.Z) * rightZ) > 0;
            float outside = turnsRight ? -BoardLateralMeters : BoardLateralMeters;
            boards.Add(new GuideBoard(
                here.X + (rightX * outside),
                here.Y,
                here.Z + (rightZ * outside),
                -tx,
                -tz,
                i));
        }

        return boards;
    }

    private static bool QuietBefore(float[] brake, int index, int quietPoints, int loop)
    {
        for (int back = 1; back <= quietPoints; back++)
        {
            int j = ((index - back) % loop + loop) % loop;
            if (brake[j] >= BrakeThreshold)
            {
                return false;
            }
        }

        return true;
    }

    private static bool TryHorizontalUnit(float x, float z, out float ux, out float uz)
    {
        float length = MathF.Sqrt((x * x) + (z * z));
        ux = length > 1e-4f ? x / length : 0;
        uz = length > 1e-4f ? z / length : 0;
        return length > 1e-4f;
    }

    private static double PathLength(GuidePoint[] line)
    {
        double total = 0;
        for (int i = 1; i < line.Length; i++)
        {
            double dx = line[i].X - line[i - 1].X;
            double dy = line[i].Y - line[i - 1].Y;
            double dz = line[i].Z - line[i - 1].Z;
            total += Math.Sqrt((dx * dx) + (dy * dy) + (dz * dz));
        }

        return total;
    }
}
