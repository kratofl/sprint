using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.DrivingGuide;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Host.DrivingGuide;

/// <summary>
/// <c>GET /api/guide/stream</c>: the monitor overlay's feed, as newline-delimited JSON. The pose
/// goes out at telemetry rate, settings and geometry only when they change. The 250 ms state poll
/// is far too slow for a line that has to stay on the road at 300 km/h.
/// <para>
/// Latest-value semantics: a slow reader skips poses rather than queueing them, so what it
/// draws is always the newest pose there is.
/// </para>
/// </summary>
internal sealed class DrivingGuideStream
{
    /// <summary>How often a quiet stream still looks for settings or geometry changes.</summary>
    private static readonly TimeSpan IdleCheck = TimeSpan.FromMilliseconds(250);

    private TelemetryFrame? _latest;
    private TaskCompletionSource _tick = new(TaskCreationOptions.RunContinuationsAsynchronously);

    /// <summary>Called on the telemetry reader thread with every frame read.</summary>
    public void Offer(TelemetryFrame frame)
    {
        Volatile.Write(ref this._latest, frame);
        Interlocked.Exchange(ref this._tick, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).TrySetResult();
    }

    public async Task ServeAsync(
        HttpResponse response,
        Func<DrivingGuideSettings> settings,
        Func<DrivingGuideState> state,
        CancellationToken ct)
    {
        response.ContentType = "application/x-ndjson";
        response.Headers.CacheControl = "no-store";

        DrivingGuideSettings? sentSettings = null;
        int sentGeometryId = -1;
        TelemetryFrame? sentFrame = null;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                Task tick = Volatile.Read(ref this._tick).Task;

                DrivingGuideSettings currentSettings = settings();
                if (!ReferenceEquals(currentSettings, sentSettings))
                {
                    sentSettings = currentSettings;
                    await WriteAsync(response, writer => WriteSettings(writer, currentSettings), ct);
                }

                DrivingGuideState currentState = state();
                if (currentState.GeometryId != sentGeometryId)
                {
                    sentGeometryId = currentState.GeometryId;
                    await WriteAsync(response, writer => WriteGeometry(writer, currentState), ct);
                }

                TelemetryFrame? frame = Volatile.Read(ref this._latest);
                if (frame is not null && !ReferenceEquals(frame, sentFrame))
                {
                    sentFrame = frame;
                    await WriteAsync(response, writer => WritePose(writer, frame), ct);
                }

                await Task.WhenAny(tick, Task.Delay(IdleCheck, ct));
            }
        }
        catch (OperationCanceledException)
        {
            // The overlay closed.
        }
    }

    private static async Task WriteAsync(HttpResponse response, Action<Utf8JsonWriter> write, CancellationToken ct)
    {
        using MemoryStream buffer = new();
        using (Utf8JsonWriter writer = new(buffer))
        {
            write(writer);
        }

        buffer.WriteByte((byte)'\n');
        await response.Body.WriteAsync(buffer.GetBuffer().AsMemory(0, (int)buffer.Length), ct);
        await response.Body.FlushAsync(ct);
    }

    private static void WriteSettings(Utf8JsonWriter writer, DrivingGuideSettings settings)
    {
        writer.WriteStartObject();
        writer.WriteString("type", "settings");
        writer.WriteBoolean("showLine", settings.ShowLine);
        writer.WriteBoolean("showBoards", settings.ShowBoards);
        writer.WriteNumber("eyeRight", settings.EyeRightMeters);
        writer.WriteNumber("eyeUp", settings.EyeUpMeters);
        writer.WriteNumber("eyeForward", settings.EyeForwardMeters);
        writer.WriteNumber("yaw", settings.YawOffsetDegrees);
        writer.WriteNumber("pitch", settings.PitchOffsetDegrees);
        writer.WriteNumber("fov", settings.MonitorFovDegrees);
        writer.WriteNumber("metersAhead", settings.MetersAhead);
        writer.WriteEndObject();
    }

    /// <summary>Points go out flat (x, y, z, pedal, ...): a Le Mans lap is 6800 of them.</summary>
    private static void WriteGeometry(Utf8JsonWriter writer, DrivingGuideState state)
    {
        writer.WriteStartObject();
        writer.WriteString("type", "geometry");
        if (state.Geometry is not { } geometry)
        {
            writer.WriteNull("geometry");
            writer.WriteEndObject();
            return;
        }

        writer.WriteStartObject("geometry");
        writer.WriteNumber("positionStep", geometry.PositionStep);
        writer.WriteNumber("trackLength", geometry.TrackLengthMeters);
        writer.WriteStartArray("points");
        foreach (GuidePoint point in geometry.Line)
        {
            writer.WriteNumberValue(point.X);
            writer.WriteNumberValue(point.Y);
            writer.WriteNumberValue(point.Z);
            writer.WriteNumberValue((uint)point.Pedal);
        }

        writer.WriteEndArray();
        writer.WriteStartArray("boards");
        foreach (GuideBoard board in geometry.Boards)
        {
            writer.WriteNumberValue(board.X);
            writer.WriteNumberValue(board.Y);
            writer.WriteNumberValue(board.Z);
            writer.WriteNumberValue(board.FacingX);
            writer.WriteNumberValue(board.FacingZ);
            writer.WriteNumberValue(board.PointIndex);
        }

        writer.WriteEndArray();
        writer.WriteNumber("boardWidth", DrivingGuideBuilder.BoardWidth);
        writer.WriteNumber("boardHeight", DrivingGuideBuilder.BoardHeight);
        writer.WriteEndObject();
        writer.WriteEndObject();
    }

    private static void WritePose(Utf8JsonWriter writer, TelemetryFrame frame)
    {
        writer.WriteStartObject();
        writer.WriteString("type", "pose");
        if (!frame.Session.InCar || frame.Car.Pose is not { } pose)
        {
            writer.WriteNull("pose");
            writer.WriteEndObject();
            return;
        }

        writer.WriteStartObject("pose");
        writer.WriteNumber("x", pose.PositionX);
        writer.WriteNumber("y", pose.PositionY);
        writer.WriteNumber("z", pose.PositionZ);
        writer.WriteNumber("qx", pose.OrientationX);
        writer.WriteNumber("qy", pose.OrientationY);
        writer.WriteNumber("qz", pose.OrientationZ);
        writer.WriteNumber("qw", pose.OrientationW);
        writer.WriteNumber("vx", pose.VelocityX);
        writer.WriteNumber("vy", pose.VelocityY);
        writer.WriteNumber("vz", pose.VelocityZ);
        writer.WriteNumber("wx", pose.AngularVelocityX);
        writer.WriteNumber("wy", pose.AngularVelocityY);
        writer.WriteNumber("wz", pose.AngularVelocityZ);
        writer.WriteNumber("trackPosition", frame.Lap.TrackPosition);
        writer.WriteEndObject();
        writer.WriteEndObject();
    }
}
