using System.Text.Json.Serialization;

namespace Sprint.Contracts;

// Race engineer wire contracts. A driver invites another account with a link; the engineer then
// sees every session of that driver, live and past, except the ones the driver excluded them from.

/// <summary>Another account as a driver or engineer sees it: never the email, which is nobody else's business.</summary>
public sealed record AccountSummary
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    /// <summary>The account's display name, or "Sprint user" when it never set one.</summary>
    [JsonPropertyName("displayName")]
    public string DisplayName { get; init; } = "";

    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; init; }
}

/// <summary>Where an invite link stands. A link works only while <see cref="Valid"/>.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<EngineerInviteStatus>))]
public enum EngineerInviteStatus
{
    Valid,
    Expired,
    Used,
    Revoked,
    NotFound,
}

/// <summary>An invite link the driver created, as the driver sees it.</summary>
public sealed record EngineerInviteDto
{
    /// <summary>The unguessable token. Whoever opens the link with it can become the driver's engineer, once.</summary>
    [JsonPropertyName("token")]
    public string Token { get; init; } = "";

    /// <summary><c>${SPRINT_PUBLIC_WEB_URL}/engineer/invite/{token}</c>, or just the path when that URL is not configured.</summary>
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("status")]
    public EngineerInviteStatus Status { get; init; }

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }

    [JsonPropertyName("expiresAt")]
    public DateTimeOffset ExpiresAt { get; init; }
}

/// <summary>What the person opening an invite link sees before accepting it.</summary>
public sealed record EngineerInvitePreview
{
    [JsonPropertyName("status")]
    public EngineerInviteStatus Status { get; init; }

    /// <summary>Who sent the link. Null when the token is unknown.</summary>
    [JsonPropertyName("driver")]
    public AccountSummary? Driver { get; init; }

    [JsonPropertyName("expiresAt")]
    public DateTimeOffset? ExpiresAt { get; init; }
}

/// <summary>One driver–engineer pair.</summary>
public sealed record EngineerLinkDto
{
    [JsonPropertyName("driver")]
    public AccountSummary Driver { get; init; } = new();

    [JsonPropertyName("engineer")]
    public AccountSummary Engineer { get; init; } = new();

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }
}

/// <summary>Whether one of the driver's engineers sees one of the driver's sessions.</summary>
public sealed record SessionEngineerAccess
{
    [JsonPropertyName("engineer")]
    public AccountSummary Engineer { get; init; } = new();

    /// <summary>False when the driver excluded this engineer from the session.</summary>
    [JsonPropertyName("hasAccess")]
    public bool HasAccess { get; init; }
}

/// <summary>A session the caller may see: their own, or one of a driver they engineer for.</summary>
public sealed record VisibleSession
{
    /// <summary>The server's id for the session; what <c>visibleSession</c> and <c>sessionTelemetry</c> take.</summary>
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    /// <summary>The desktop's session id: what the live stream URL takes.</summary>
    [JsonPropertyName("sessionKey")]
    public string SessionKey { get; init; } = "";

    [JsonPropertyName("driver")]
    public AccountSummary Driver { get; init; } = new();

    /// <summary>True when the caller is the driver.</summary>
    [JsonPropertyName("isMine")]
    public bool IsMine { get; init; }

    /// <summary>True while the driver's desktop is streaming this session.</summary>
    [JsonPropertyName("isLive")]
    public bool IsLive { get; init; }

    [JsonPropertyName("game")]
    public string Game { get; init; } = "";

    [JsonPropertyName("track")]
    public string Track { get; init; } = "";

    [JsonPropertyName("car")]
    public string Car { get; init; } = "";

    [JsonPropertyName("sessionType")]
    public string SessionType { get; init; } = "unknown";

    [JsonPropertyName("startedAt")]
    public DateTimeOffset? StartedAt { get; init; }

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>The desktop's lap history (JSON) once the session synced; <c>{}</c> before.</summary>
    [JsonPropertyName("data")]
    public string Data { get; init; } = "{}";

    /// <summary>Per engineer, whether they see this session. Only filled for the caller's own sessions.</summary>
    [JsonPropertyName("engineerAccess")]
    public IReadOnlyList<SessionEngineerAccess> EngineerAccess { get; init; } = [];
}
