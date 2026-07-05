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

/// <summary>A signed JWT returned after a successful register/login.</summary>
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

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }
}

/// <summary>Liveness response for <c>GET /api/health</c> and the <c>health</c> query.</summary>
public sealed record HealthStatus
{
    [JsonPropertyName("status")]
    public string Status { get; init; } = "ok";

    [JsonPropertyName("version")]
    public string Version { get; init; } = "";
}
