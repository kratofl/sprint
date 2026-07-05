using System.Text.Json.Serialization;

namespace Sprint.Contracts;

/// <summary>
/// A time-limited engineer session invite. A driver mints one from their desktop
/// app; engineers must present <see cref="Value"/> to join the live relay. Mirrors
/// the Go <c>invite.Code</c> that this API replaces.
/// </summary>
public sealed record InviteCodeDto
{
    /// <summary>Random hex string the engineer presents to join.</summary>
    [JsonPropertyName("code")]
    public string Value { get; init; } = "";

    /// <summary>User id of the driver who created the code.</summary>
    [JsonPropertyName("driverId")]
    public string DriverId { get; init; } = "";

    /// <summary>Optional — links to a telemetry session record.</summary>
    [JsonPropertyName("sessionId")]
    public string? SessionId { get; init; }

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }

    [JsonPropertyName("expiresAt")]
    public DateTimeOffset ExpiresAt { get; init; }

    /// <summary>True once the driver's desktop app has connected on this code.</summary>
    [JsonPropertyName("driverJoined")]
    public bool DriverJoined { get; init; }
}
