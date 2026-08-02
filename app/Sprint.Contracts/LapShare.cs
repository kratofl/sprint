using System.Text.Json.Serialization;

namespace Sprint.Contracts;

// Lap sharing wire contracts (#197), shared by the GraphQL server and the desktop client.
// The lap's channels never appear as fields here: they travel as one opaque payload, which is
// byte-for-byte the exported .sprintlap file. One format on disk and on the wire means an
// exported file and a fetched lap cannot disagree about what the lap was.

/// <summary>What the driver uploads when they share a lap.</summary>
public sealed record ShareLapInput
{
    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("trackCourse")]
    public string TrackCourse { get; init; } = "";

    [JsonPropertyName("carModel")]
    public string CarModel { get; init; } = "";

    [JsonPropertyName("lapNumber")]
    public int LapNumber { get; init; }

    [JsonPropertyName("lapTimeSeconds")]
    public double LapTimeSeconds { get; init; }

    [JsonPropertyName("drivenAt")]
    public DateTimeOffset? DrivenAt { get; init; }

    /// <summary>The <c>.sprintlap</c> bytes, base64 for transport.</summary>
    [JsonPropertyName("payloadBase64")]
    public string PayloadBase64 { get; init; } = "";
}

/// <summary>A lap the driver has shared, as their own library lists it. No payload.</summary>
public sealed record SharedLapSummary
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("shareCode")]
    public string ShareCode { get; init; } = "";

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("trackCourse")]
    public string TrackCourse { get; init; } = "";

    [JsonPropertyName("carModel")]
    public string CarModel { get; init; } = "";

    [JsonPropertyName("lapNumber")]
    public int LapNumber { get; init; }

    [JsonPropertyName("lapTimeSeconds")]
    public double LapTimeSeconds { get; init; }

    /// <summary>Revoked codes stay listed so the owner can see what they have withdrawn.</summary>
    [JsonPropertyName("revoked")]
    public bool Revoked { get; init; }

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }
}

/// <summary>A lap fetched with a code: the summary plus who drove it and the payload.</summary>
public sealed record SharedLapDto
{
    [JsonPropertyName("shareCode")]
    public string ShareCode { get; init; } = "";

    /// <summary>The owner's display name, never their email.</summary>
    [JsonPropertyName("sharedBy")]
    public string SharedBy { get; init; } = "";

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("trackCourse")]
    public string TrackCourse { get; init; } = "";

    [JsonPropertyName("carModel")]
    public string CarModel { get; init; } = "";

    [JsonPropertyName("lapNumber")]
    public int LapNumber { get; init; }

    [JsonPropertyName("lapTimeSeconds")]
    public double LapTimeSeconds { get; init; }

    [JsonPropertyName("drivenAt")]
    public DateTimeOffset? DrivenAt { get; init; }

    [JsonPropertyName("payloadBase64")]
    public string PayloadBase64 { get; init; } = "";
}
