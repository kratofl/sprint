using System.Text.Json.Serialization;

namespace Sprint.Contracts;

// Owner-scoped persistence records for the previously-stubbed Go handlers
// (sessions / setups / dash layouts). Relational metadata lives in Postgres; the
// free-form `Data` blobs stay opaque JSON so preset richness round-trips losslessly.

/// <summary>A saved telemetry session record.</summary>
public sealed record SessionSummary
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("ownerId")]
    public string OwnerId { get; init; } = "";

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("track")]
    public string Track { get; init; } = "";

    [JsonPropertyName("car")]
    public string Car { get; init; } = "";

    [JsonPropertyName("sessionType")]
    public string SessionType { get; init; } = "unknown";

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }
}

/// <summary>Input for the <c>createSession</c> mutation.</summary>
public sealed record CreateSessionInput
{
    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("track")]
    public string Track { get; init; } = "";

    [JsonPropertyName("car")]
    public string Car { get; init; } = "";

    [JsonPropertyName("sessionType")]
    public string SessionType { get; init; } = "unknown";
}

/// <summary>A saved car setup.</summary>
public sealed record SetupSummary
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("ownerId")]
    public string OwnerId { get; init; } = "";

    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("car")]
    public string Car { get; init; } = "";

    [JsonPropertyName("track")]
    public string Track { get; init; } = "";

    /// <summary>Opaque setup payload (JSON).</summary>
    [JsonPropertyName("data")]
    public string Data { get; init; } = "{}";

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; init; }
}

/// <summary>Input for the <c>saveSetup</c> mutation. A null/empty <see cref="Id"/> creates; otherwise upserts.</summary>
public sealed record SaveSetupInput
{
    [JsonPropertyName("id")]
    public string? Id { get; init; }

    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("car")]
    public string Car { get; init; } = "";

    [JsonPropertyName("track")]
    public string Track { get; init; } = "";

    [JsonPropertyName("data")]
    public string Data { get; init; } = "{}";
}

/// <summary>A saved dash layout.</summary>
public sealed record LayoutSummary
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("ownerId")]
    public string OwnerId { get; init; } = "";

    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    /// <summary>Opaque dash-layout payload (JSON).</summary>
    [JsonPropertyName("data")]
    public string Data { get; init; } = "{}";

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; init; }
}

/// <summary>Input for the <c>saveLayout</c> mutation. A null/empty <see cref="Id"/> creates; otherwise upserts.</summary>
public sealed record SaveLayoutInput
{
    [JsonPropertyName("id")]
    public string? Id { get; init; }

    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("data")]
    public string Data { get; init; } = "{}";
}
