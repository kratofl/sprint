using Sprint.Desktop.Api.Engineer;

namespace Sprint.Api.GraphQL;

// GraphQL-facing relay messages. These mirror Sprint.Desktop.Api's EngineerEvent /
// EngineerCommand but carry the opaque payload as a JSON string, since GraphQL has
// no untyped `object` field. The relay passes payloads through verbatim; only
// telemetry_frame events are additionally parsed (to persist to InfluxDB).

/// <summary>An event pushed from the driver's desktop app to connected engineers.</summary>
public sealed record EngineerEventMessage
{
    public EngineerEventType Type { get; init; }

    /// <summary>Opaque payload as a JSON string (shape depends on <see cref="Type"/>).</summary>
    public string? Payload { get; init; }

    /// <summary>Unix milliseconds.</summary>
    public long Timestamp { get; init; }
}

/// <summary>A command sent from an engineer client to the driver's desktop app.</summary>
public sealed record EngineerCommandMessage
{
    public string Id { get; init; } = "";
    public EngineerCommandType Type { get; init; }

    /// <summary>Opaque payload as a JSON string (shape depends on <see cref="Type"/>).</summary>
    public string? Payload { get; init; }

    /// <summary>Unix milliseconds.</summary>
    public long Timestamp { get; init; }

    /// <summary>Engineer display name or client id.</summary>
    public string From { get; init; } = "";
}

/// <summary>Pub/sub topic names for the engineer relay, keyed by invite code.</summary>
internal static class RelayTopics
{
    public static string Events(string code) => $"events:{code}";
    public static string Commands(string code) => $"commands:{code}";
}
