using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Contracts;

// Live telemetry wire contracts, shared by the API and the desktop (and mirrored in TypeScript
// for the web). The desktop streams LiveSamples over a WebSocket while it reads a game; viewers
// get them back over SSE; InfluxDB keeps them for afterwards. JSON names are the contract.

/// <summary>
/// One compact telemetry sample: what an engineer needs from a <see cref="TelemetryFrame"/>,
/// without the rest. Times are seconds, speed is km/h, pedals are 0..1, steering is -1..1.
/// </summary>
public sealed record LiveSample
{
    /// <summary>Unix milliseconds (UTC) when the desktop read the frame.</summary>
    [JsonPropertyName("timestamp")]
    public long Timestamp { get; init; }

    [JsonPropertyName("lap")]
    public int Lap { get; init; }

    /// <summary>The current sector, 1-based; 0 when the game does not say.</summary>
    [JsonPropertyName("sector")]
    public int Sector { get; init; }

    [JsonPropertyName("currentLapTime")]
    public double CurrentLapTime { get; init; }

    [JsonPropertyName("lastLapTime")]
    public double LastLapTime { get; init; }

    [JsonPropertyName("bestLapTime")]
    public double BestLapTime { get; init; }

    /// <summary>Live delta to the best lap in seconds, as the game reports it.</summary>
    [JsonPropertyName("delta")]
    public double Delta { get; init; }

    /// <summary>Whether the current lap still counts.</summary>
    [JsonPropertyName("lapValid")]
    public bool LapValid { get; init; } = true;

    /// <summary>Race position, 1-based; 0 when unknown.</summary>
    [JsonPropertyName("position")]
    public int Position { get; init; }

    [JsonPropertyName("speedKph")]
    public double SpeedKph { get; init; }

    [JsonPropertyName("rpm")]
    public double Rpm { get; init; }

    [JsonPropertyName("maxRpm")]
    public double MaxRpm { get; init; }

    /// <summary>-1 reverse, 0 neutral, 1.. forward gears.</summary>
    [JsonPropertyName("gear")]
    public int Gear { get; init; }

    [JsonPropertyName("throttle")]
    public double Throttle { get; init; }

    [JsonPropertyName("brake")]
    public double Brake { get; init; }

    [JsonPropertyName("steering")]
    public double Steering { get; init; }

    /// <summary>Fuel in the tank, litres.</summary>
    [JsonPropertyName("fuel")]
    public double Fuel { get; init; }

    /// <summary>How far round the lap the car is, 0..1.</summary>
    [JsonPropertyName("trackPosition")]
    public double TrackPosition { get; init; }

    /// <summary>Tyre surface temperatures, °C.</summary>
    [JsonPropertyName("tyreTempFl")]
    public double TyreTempFl { get; init; }

    [JsonPropertyName("tyreTempFr")]
    public double TyreTempFr { get; init; }

    [JsonPropertyName("tyreTempRl")]
    public double TyreTempRl { get; init; }

    [JsonPropertyName("tyreTempRr")]
    public double TyreTempRr { get; init; }

    /// <summary>Tyre wear, percent worn.</summary>
    [JsonPropertyName("tyreWearFl")]
    public double TyreWearFl { get; init; }

    [JsonPropertyName("tyreWearFr")]
    public double TyreWearFr { get; init; }

    [JsonPropertyName("tyreWearRl")]
    public double TyreWearRl { get; init; }

    [JsonPropertyName("tyreWearRr")]
    public double TyreWearRr { get; init; }

    /// <summary>The desktop's mapping from a frame. One definition, so every sender samples the same way.</summary>
    public static LiveSample FromFrame(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        TireState Tire(TirePosition position) =>
            frame.Tires.FirstOrDefault(tire => tire.Position == position) ?? new TireState { Position = position };
        TireState fl = Tire(TirePosition.FrontLeft);
        TireState fr = Tire(TirePosition.FrontRight);
        TireState rl = Tire(TirePosition.RearLeft);
        TireState rr = Tire(TirePosition.RearRight);

        return new LiveSample
        {
            Timestamp = frame.Timestamp.ToUnixTimeMilliseconds(),
            Lap = frame.Lap.CurrentLap,
            Sector = frame.Lap.Sector,
            CurrentLapTime = frame.Lap.CurrentLapTime,
            LastLapTime = frame.Lap.LastLapTime,
            BestLapTime = frame.Lap.BestLapTime,
            Delta = frame.Lap.Delta,
            LapValid = frame.Lap.IsValid,
            Position = frame.Race.Position,
            SpeedKph = frame.Car.SpeedMetersPerSecond * 3.6,
            Rpm = frame.Car.Rpm,
            MaxRpm = frame.Car.MaxRpm,
            Gear = frame.Car.Gear,
            Throttle = frame.Car.Throttle,
            Brake = frame.Car.Brake,
            Steering = frame.Car.Steering,
            Fuel = frame.Car.FuelLiters,
            TrackPosition = frame.Lap.TrackPosition,
            TyreTempFl = fl.TempSurfaceCelsius,
            TyreTempFr = fr.TempSurfaceCelsius,
            TyreTempRl = rl.TempSurfaceCelsius,
            TyreTempRr = rr.TempSurfaceCelsius,
            TyreWearFl = fl.WearPercent,
            TyreWearFr = fr.WearPercent,
            TyreWearRl = rl.WearPercent,
            TyreWearRr = rr.WearPercent,
        };
    }
}

/// <summary>A completed lap, detected on the server from the samples (when <c>lastLapTime</c> changes).</summary>
public sealed record LiveLap
{
    [JsonPropertyName("lap")]
    public int Lap { get; init; }

    /// <summary>Seconds.</summary>
    [JsonPropertyName("lapTime")]
    public double LapTime { get; init; }

    [JsonPropertyName("valid")]
    public bool Valid { get; init; }

    /// <summary>Unix milliseconds of the sample that reported it.</summary>
    [JsonPropertyName("completedAt")]
    public long CompletedAt { get; init; }
}

/// <summary>
/// A text message the desktop sends on <c>GET /api/live/ingest</c>. The <c>type</c> property says
/// which: <c>start</c>, <c>samples</c> or <c>end</c>.
/// <para>
/// Serialize as <see cref="LiveIngestMessage"/> (the base type), not the derived record:
/// System.Text.Json writes the <c>type</c> discriminator only for the base type.
/// </para>
/// </summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(LiveStartMessage), "start")]
[JsonDerivedType(typeof(LiveSamplesMessage), "samples")]
[JsonDerivedType(typeof(LiveEndMessage), "end")]
public abstract record LiveIngestMessage;

/// <summary>Begins (or resumes, after a reconnect) the live session <see cref="SessionKey"/>.</summary>
public sealed record LiveStartMessage : LiveIngestMessage
{
    /// <summary>The desktop's own session id; the same key its synced session carries.</summary>
    [JsonPropertyName("sessionKey")]
    public string SessionKey { get; init; } = "";

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("track")]
    public string Track { get; init; } = "";

    [JsonPropertyName("car")]
    public string Car { get; init; } = "";

    [JsonPropertyName("sessionType")]
    public string SessionType { get; init; } = "unknown";
}

/// <summary>A batch of samples for the started session, oldest first.</summary>
public sealed record LiveSamplesMessage : LiveIngestMessage
{
    [JsonPropertyName("samples")]
    public IReadOnlyList<LiveSample> Samples { get; init; } = [];
}

/// <summary>Ends the started session: the driver left the car or the game.</summary>
public sealed record LiveEndMessage : LiveIngestMessage;

/// <summary>A session being streamed right now, as <c>liveSessions</c> and the SSE snapshot describe it.</summary>
public sealed record LiveSessionDto
{
    /// <summary>The server's id for the session (see <see cref="VisibleSession.Id"/>).</summary>
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = "";

    [JsonPropertyName("sessionKey")]
    public string SessionKey { get; init; } = "";

    [JsonPropertyName("driver")]
    public AccountSummary Driver { get; init; } = new();

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("track")]
    public string Track { get; init; } = "";

    [JsonPropertyName("car")]
    public string Car { get; init; } = "";

    [JsonPropertyName("sessionType")]
    public string SessionType { get; init; } = "unknown";

    [JsonPropertyName("startedAt")]
    public DateTimeOffset StartedAt { get; init; }

    /// <summary>False while the desktop is reconnecting; the session ends if it does not come back.</summary>
    [JsonPropertyName("connected")]
    public bool Connected { get; init; }
}

/// <summary>SSE <c>snapshot</c>: the first event on a live stream.</summary>
public sealed record LiveSnapshotEvent
{
    [JsonPropertyName("session")]
    public LiveSessionDto Session { get; init; } = new();

    /// <summary>The newest sample, or null before the first one arrived.</summary>
    [JsonPropertyName("latest")]
    public LiveSample? Latest { get; init; }

    /// <summary>
    /// The last 30 s of samples by their timestamps, oldest first, so a late viewer's rolling
    /// trace starts full. Ends with <see cref="Latest"/>; empty before the first sample.
    /// </summary>
    [JsonPropertyName("recent")]
    public IReadOnlyList<LiveSample> Recent { get; init; } = [];

    /// <summary>Laps completed so far in this live session, in order.</summary>
    [JsonPropertyName("laps")]
    public IReadOnlyList<LiveLap> Laps { get; init; } = [];
}

/// <summary>SSE <c>samples</c>: a batch as the desktop sent it.</summary>
public sealed record LiveSamplesEvent
{
    [JsonPropertyName("samples")]
    public IReadOnlyList<LiveSample> Samples { get; init; } = [];
}

/// <summary>SSE <c>lap</c>: a lap was completed.</summary>
public sealed record LiveLapEvent
{
    [JsonPropertyName("lap")]
    public LiveLap Lap { get; init; } = new();
}

/// <summary>SSE <c>ended</c> and <c>revoked</c>: the stream closes after it.</summary>
public sealed record LiveClosedEvent
{
    [JsonPropertyName("sessionKey")]
    public string SessionKey { get; init; } = "";

    /// <summary>Human-readable why, e.g. "The driver removed you from this session."</summary>
    [JsonPropertyName("reason")]
    public string Reason { get; init; } = "";
}

/// <summary>A session's stored telemetry, downsampled, plus its laps (the <c>sessionTelemetry</c> query).</summary>
public sealed record SessionTelemetry
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = "";

    [JsonPropertyName("sessionKey")]
    public string SessionKey { get; init; } = "";

    /// <summary>At most the requested number of points, oldest first. Empty when nothing was streamed.</summary>
    [JsonPropertyName("samples")]
    public IReadOnlyList<LiveSample> Samples { get; init; } = [];

    [JsonPropertyName("laps")]
    public IReadOnlyList<LiveLap> Laps { get; init; } = [];
}
