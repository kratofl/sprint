using System.Text.Json.Serialization;

namespace Sprint.Desktop.Api.Engineer;

// Shared engineer↔driver command/event contract for the desktop app. These are
// pure data shapes (no transport, no wiring) — the .NET mirror of the Go source
// of truth in pkg/dto/engineer.go and packages/types/src/engineer.ts, so desktop
// and web speak the same vocabulary. The JSON names/enum strings below pin the
// wire to that source. WS3 owns the shapes; WS9 owns the transport, including the
// polymorphic decode of the Payload members (interpreted by Type) and the
// Engineer-page staged-change UI (Sprint.Desktop.Client EngineerControl).

/// <summary>A command sent from an engineer client to the driver's desktop app.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<EngineerCommandType>))]
public enum EngineerCommandType
{
    /// <summary>Set (or, with a zero lap time, clear) the driver's target lap.</summary>
    [JsonStringEnumMemberName("set_target_lap")]
    SetTargetLap,

    /// <summary>Send a free-text note to the driver.</summary>
    [JsonStringEnumMemberName("send_note")]
    SendNote,

    /// <summary>Ask the desktop app to re-broadcast its current state.</summary>
    [JsonStringEnumMemberName("request_sync")]
    RequestSync
}

/// <summary>
/// A message pushed from an engineer client to the driver's desktop app. The
/// <see cref="Payload"/> is interpreted according to <see cref="Type"/>
/// (<see cref="SetTargetLapPayload"/> for <see cref="EngineerCommandType.SetTargetLap"/>,
/// <see cref="NotePayload"/> for <see cref="EngineerCommandType.SendNote"/>,
/// <c>null</c> for <see cref="EngineerCommandType.RequestSync"/>). The
/// polymorphic decode of that payload is WS9's transport concern.
/// </summary>
public sealed record EngineerCommand
{
    /// <summary>Unique id, set by the sender.</summary>
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("type")]
    public EngineerCommandType Type { get; init; }

    /// <summary><see cref="SetTargetLapPayload"/> | <see cref="NotePayload"/> | null.</summary>
    [JsonPropertyName("payload")]
    public object? Payload { get; init; }

    /// <summary>Unix milliseconds.</summary>
    [JsonPropertyName("timestamp")]
    public long TimestampMs { get; init; }

    /// <summary>Engineer display name or client id.</summary>
    [JsonPropertyName("from")]
    public string From { get; init; } = "";
}

/// <summary>Payload for <see cref="EngineerCommandType.SetTargetLap"/>. A zero <see cref="LapTimeSeconds"/> clears the target.</summary>
public sealed record SetTargetLapPayload
{
    [JsonPropertyName("lapTime")]
    public double LapTimeSeconds { get; init; }

    /// <summary>Informational: the lap number the target came from.</summary>
    [JsonPropertyName("lapNum")]
    public int LapNumber { get; init; }
}

/// <summary>Payload for <see cref="EngineerCommandType.SendNote"/>.</summary>
public sealed record NotePayload
{
    [JsonPropertyName("text")]
    public string Text { get; init; } = "";
}

/// <summary>An event pushed from the driver's desktop app to connected engineers.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<EngineerEventType>))]
public enum EngineerEventType
{
    [JsonStringEnumMemberName("telemetry_frame")]
    TelemetryFrame,

    [JsonStringEnumMemberName("target_changed")]
    TargetChanged,

    [JsonStringEnumMemberName("lap_completed")]
    LapCompleted,

    [JsonStringEnumMemberName("session_changed")]
    SessionChanged
}

/// <summary>A message pushed from the driver's desktop app to all connected engineers.</summary>
public sealed record EngineerEvent
{
    [JsonPropertyName("type")]
    public EngineerEventType Type { get; init; }

    /// <summary>Shape depends on <see cref="Type"/> (telemetry frame, lap state, target payload, …).</summary>
    [JsonPropertyName("payload")]
    public object? Payload { get; init; }

    /// <summary>Unix milliseconds.</summary>
    [JsonPropertyName("timestamp")]
    public long TimestampMs { get; init; }
}

/// <summary>
/// A single staged change to a car-control value: the value currently on the car
/// vs. the value an engineer has staged but not yet pushed. The reviewable unit
/// behind "stage → review → push" (US19/US20). <see cref="Key"/> matches the
/// client-side control identity (e.g. "tc", "abs", "motorMap", "brakeBias").
/// </summary>
public sealed record StagedControlChange
{
    [JsonPropertyName("key")]
    public string Key { get; init; } = "";

    /// <summary>The value currently applied on the car.</summary>
    [JsonPropertyName("carValue")]
    public double CarValue { get; init; }

    /// <summary>The value staged by the engineer, pending push.</summary>
    [JsonPropertyName("stagedValue")]
    public double StagedValue { get; init; }

    /// <summary>True when the staged value differs from what is on the car (epsilon-compared, matching the client's dirty check).</summary>
    [JsonIgnore]
    public bool IsDirty => Math.Abs(StagedValue - CarValue) > 1e-6;
}
