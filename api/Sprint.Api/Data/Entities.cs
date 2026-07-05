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
    public string PasswordHash { get; set; } = "";
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
