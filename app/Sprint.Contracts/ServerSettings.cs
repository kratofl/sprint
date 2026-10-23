using System.Text.Json.Serialization;

namespace Sprint.Contracts;

/// <summary>Server-wide settings an admin controls. Readable by anyone: the sign-in page needs both.</summary>
public sealed record ServerSettingsDto
{
    /// <summary>What this self-hosted server calls itself, shown on the sign-in page.</summary>
    [JsonPropertyName("instanceName")]
    public string InstanceName { get; init; } = "Sprint";

    /// <summary>Whether strangers may create accounts. The first account is always allowed.</summary>
    [JsonPropertyName("allowRegistration")]
    public bool AllowRegistration { get; init; } = true;

    /// <summary>
    /// Whether "Sign in with Discord" works on this server: true when the operator configured
    /// <c>DISCORD_CLIENT_ID</c> and <c>DISCORD_CLIENT_SECRET</c>. Not an admin setting.
    /// </summary>
    [JsonPropertyName("discordSignIn")]
    public bool DiscordSignIn { get; init; }
}

/// <summary>Input for the admin-only <c>updateServerSettings</c> mutation.</summary>
public sealed record UpdateServerSettingsInput
{
    [JsonPropertyName("instanceName")]
    public string InstanceName { get; init; } = "Sprint";

    [JsonPropertyName("allowRegistration")]
    public bool AllowRegistration { get; init; } = true;
}
