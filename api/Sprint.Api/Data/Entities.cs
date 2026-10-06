using System.ComponentModel.DataAnnotations;

namespace Sprint.Api.Data;

// Relational entities persisted in Postgres. These replace the Go in-memory maps
// (users, invite codes) and implement the previously-stubbed session/setup/layout
// persistence. Free-form preset payloads are stored as opaque JSON text columns so
// preset richness round-trips losslessly.

public sealed class UserEntity
{
    [Key]
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";

    /// <summary>
    /// What other drivers see. Attributing a shared lap to an email address is both wrong and
    /// a disclosure nobody asked for, so sharing (#197) gave the user a name of their own.
    /// Empty until they set one; readers fall back to something neutral rather than the email.
    /// </summary>
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";

    /// <summary>May change the server settings. The first account on a server is the admin.</summary>
    public bool IsAdmin { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>The one row of server-wide settings, keyed <see cref="SingletonId"/>. Absent until an admin first saves.</summary>
public sealed class ServerSettingsEntity
{
    public const string SingletonId = "server";

    [Key]
    public string Id { get; set; } = SingletonId;
    public string InstanceName { get; set; } = "Sprint";
    public bool AllowRegistration { get; set; } = true;
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>
/// A lap somebody chose to share (#197).
/// <para>
/// Its own entity, not an <see cref="InviteCodeEntity"/>: an engineer invite is bound to a
/// running session and expires with it, while a lap code must outlive every session and be
/// revocable on its own.
/// </para>
/// <para>
/// The trace is an opaque immutable blob, fetched whole and never queried by field — which is
/// why this is a Postgres row and not an InfluxDB series. Our x-axis is track position, not
/// time, and Influx would have to fake a time axis for something that is neither streamed nor
/// range-queried.
/// </para>
/// </summary>
public sealed class LapTraceEntity
{
    [Key]
    public string Id { get; set; } = "";
    public string OwnerId { get; set; } = "";

    /// <summary>The unguessable code. Whoever holds it can pull the lap.</summary>
    public string ShareCode { get; set; } = "";
    public string Game { get; set; } = "";
    public string TrackCourse { get; set; } = "";
    public string CarModel { get; set; } = "";
    public int LapNumber { get; set; }
    public double LapTimeSeconds { get; set; }
    public DateTimeOffset? DrivenAt { get; set; }

    /// <summary>The <c>.sprintlap</c> payload, byte for byte the same as the exported file.</summary>
    public byte[] Payload { get; set; } = [];

    /// <summary>
    /// Revoked rather than deleted, so a fetch can say "revoked" instead of "unknown". Those
    /// are different facts and the person holding the code deserves the true one.
    /// </summary>
    public bool Revoked { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class InviteCodeEntity
{
    [Key]
    public string Value { get; set; } = "";
    public string DriverId { get; set; } = "";
    public string? SessionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public bool DriverJoined { get; set; }
}

public sealed class SessionEntity
{
    [Key]
    public string Id { get; set; } = "";
    public string OwnerId { get; set; } = "";
    public string Game { get; set; } = "";
    public string Track { get; set; } = "";
    public string Car { get; set; } = "";
    public string SessionType { get; set; } = "unknown";
    public DateTimeOffset? StartedAt { get; set; }
    public string Data { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class SetupEntity
{
    [Key]
    public string Id { get; set; } = "";
    public string OwnerId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Game { get; set; } = "";
    public string Car { get; set; } = "";
    public string Track { get; set; } = "";
    public string Data { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class LayoutEntity
{
    [Key]
    public string Id { get; set; } = "";
    public string OwnerId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Data { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
