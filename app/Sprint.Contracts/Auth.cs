using System.Text.Json.Serialization;

namespace Sprint.Contracts;

// Cloud API wire contracts shared by the .NET GraphQL server (api/Sprint.Api) and
// the desktop client. Pure data shapes — no transport, no persistence. JSON names
// are pinned to keep REST/desktop payloads stable; GraphQL derives its own field
// names from the property names.

/// <summary>Credentials for <c>register</c> / <c>login</c>.</summary>
public sealed record AuthRequest
{
    [JsonPropertyName("email")]
    public string Email { get; init; } = "";

    [JsonPropertyName("password")]
    public string Password { get; init; } = "";
}

/// <summary>A signed JWT returned after a successful register/login/redeemSignInTicket.</summary>
public sealed record AuthResponse
{
    [JsonPropertyName("token")]
    public string Token { get; init; } = "";
}

/// <summary>The authenticated user, as exposed by the <c>me</c> query.</summary>
public sealed record UserProfile
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("email")]
    public string Email { get; init; } = "";

    /// <summary>
    /// What other drivers see. A shared lap is attributed to this, never to
    /// <see cref="Email"/> — crediting somebody's Spa lap to <c>alex@…</c> is both wrong and a
    /// disclosure nobody asked for. Empty until the driver sets one.
    /// </summary>
    [JsonPropertyName("displayName")]
    public string DisplayName { get; init; } = "";

    /// <summary>Whether this account may change the server settings. The server's first account is.</summary>
    [JsonPropertyName("isAdmin")]
    public bool IsAdmin { get; init; }

    /// <summary>The Discord avatar, refreshed on every Discord sign-in. Null when the account has none.</summary>
    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; init; }

    /// <summary>
    /// False for an account created through Discord that never set a password. Such an account
    /// signs in with Discord only; <c>changePassword</c> sets its first password without asking
    /// for a current one.
    /// </summary>
    [JsonPropertyName("hasPassword")]
    public bool HasPassword { get; init; }

    /// <summary>Whether a Discord account is linked, so Discord sign-in reaches this account.</summary>
    [JsonPropertyName("discordLinked")]
    public bool DiscordLinked { get; init; }

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }
}

/// <summary>Liveness response for <c>GET /api/health</c> and the <c>health</c> query.</summary>
public sealed record HealthStatus
{
    [JsonPropertyName("status")]
    public string Status { get; init; } = "ok";

    /// <summary>Always <see cref="SprintService"/>: how the desktop tells a Sprint server from any other port 8080 on the network.</summary>
    [JsonPropertyName("service")]
    public string Service { get; init; } = SprintService;

    public const string SprintService = "sprint-api";

    [JsonPropertyName("version")]
    public string Version { get; init; } = "";
}
