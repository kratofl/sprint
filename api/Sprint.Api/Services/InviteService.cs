using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;
using Sprint.Contracts;

namespace Sprint.Api.Services;

/// <summary>
/// Time-limited engineer invite codes, backed by Postgres. Faithful port of the Go
/// <c>invite.Store</c>: 24h TTL, one-time driver join (anti-hijack), and a background
/// reaper (see <see cref="InviteReaper"/>).
/// </summary>
public sealed class InviteService(IDbContextFactory<SprintDbContext> dbFactory)
{
    public static readonly TimeSpan CodeTtl = TimeSpan.FromHours(24);

    /// <summary>Mints a new invite code for the given driver.</summary>
    public async Task<InviteCodeDto> CreateAsync(string driverId, string? sessionId, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var entity = new InviteCodeEntity
        {
            Value = Ids.New(),
            DriverId = driverId,
            SessionId = string.IsNullOrEmpty(sessionId) ? null : sessionId,
            CreatedAt = now,
            ExpiresAt = now.Add(CodeTtl),
            DriverJoined = false
        };

        await using var db = await dbFactory.CreateDbContextAsync(ct);
        db.InviteCodes.Add(entity);
        await db.SaveChangesAsync(ct);
        return ToDto(entity);
    }

    /// <summary>Returns the code if it exists and has not expired; throws otherwise.</summary>
    public async Task<InviteCodeDto> ValidateAsync(string value, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var code = await db.InviteCodes.FindAsync([value], ct)
                   ?? throw new GraphQLException("Invite code not found.");
        if (DateTimeOffset.UtcNow > code.ExpiresAt)
            throw new GraphQLException("Invite code expired.");
        return ToDto(code);
    }

    /// <summary>Records that the driver has connected. Throws if a driver already joined (prevents hijacking).</summary>
    public async Task MarkDriverJoinedAsync(string value, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var code = await db.InviteCodes.FindAsync([value], ct)
                   ?? throw new GraphQLException("Invite code not found.");
        if (code.DriverJoined)
            throw new GraphQLException("Driver already connected on this invite code.");
        code.DriverJoined = true;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Immediately invalidates a code.</summary>
    public async Task RevokeAsync(string value, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var code = await db.InviteCodes.FindAsync([value], ct);
        if (code is null) return;
        db.InviteCodes.Remove(code);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Deletes expired codes. Called periodically by <see cref="InviteReaper"/>.</summary>
    public async Task<int> ReapExpiredAsync(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var expired = await db.InviteCodes.Where(c => c.ExpiresAt < now).ToListAsync(ct);
        if (expired.Count == 0) return 0;
        db.InviteCodes.RemoveRange(expired);
        await db.SaveChangesAsync(ct);
        return expired.Count;
    }

    private static InviteCodeDto ToDto(InviteCodeEntity e) => new()
    {
        Value = e.Value,
        DriverId = e.DriverId,
        SessionId = e.SessionId,
        CreatedAt = e.CreatedAt,
        ExpiresAt = e.ExpiresAt,
        DriverJoined = e.DriverJoined
    };
}
