using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;
using Sprint.Contracts;

namespace Sprint.Api.Services;

/// <summary>
/// Owner-scoped persistence for sessions, setups, and dash layouts — the real
/// implementation behind the Go handlers that returned <c>"stub"</c>. Every query
/// and mutation is scoped by the authenticated user's id.
/// </summary>
public sealed class CatalogService(IDbContextFactory<SprintDbContext> dbFactory)
{
    // ── Sessions ────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<SessionSummary>> ListSessionsAsync(string ownerId, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var rows = await db.Sessions.Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.CreatedAt).ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<SessionSummary?> GetSessionAsync(string ownerId, string id, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var row = await db.Sessions.FindAsync([id], ct);
        return row is null || row.OwnerId != ownerId ? null : ToDto(row);
    }

    public async Task<SessionSummary> CreateSessionAsync(string ownerId, CreateSessionInput input, CancellationToken ct = default)
    {
        var row = new SessionEntity
        {
            Id = Ids.New(),
            OwnerId = ownerId,
            Game = input.Game,
            Track = input.Track,
            Car = input.Car,
            SessionType = string.IsNullOrEmpty(input.SessionType) ? "unknown" : input.SessionType,
            CreatedAt = DateTimeOffset.UtcNow
        };
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        db.Sessions.Add(row);
        await db.SaveChangesAsync(ct);
        return ToDto(row);
    }

    // ── Setups ──────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<SetupSummary>> ListSetupsAsync(string ownerId, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var rows = await db.Setups.Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.UpdatedAt).ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<SetupSummary?> GetSetupAsync(string ownerId, string id, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var row = await db.Setups.FindAsync([id], ct);
        return row is null || row.OwnerId != ownerId ? null : ToDto(row);
    }

    public async Task<SetupSummary> SaveSetupAsync(string ownerId, SaveSetupInput input, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var now = DateTimeOffset.UtcNow;
        SetupEntity row;
        if (!string.IsNullOrEmpty(input.Id) && await db.Setups.FindAsync([input.Id], ct) is { } existing)
        {
            if (existing.OwnerId != ownerId)
                throw new GraphQLException("Setup not found.");
            row = existing;
        }
        else
        {
            row = new SetupEntity { Id = Ids.New(), OwnerId = ownerId, CreatedAt = now };
            db.Setups.Add(row);
        }

        row.Name = input.Name;
        row.Game = input.Game;
        row.Car = input.Car;
        row.Track = input.Track;
        row.Data = input.Data;
        row.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return ToDto(row);
    }

    // ── Layouts ─────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<LayoutSummary>> ListLayoutsAsync(string ownerId, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var rows = await db.Layouts.Where(l => l.OwnerId == ownerId)
            .OrderByDescending(l => l.UpdatedAt).ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<LayoutSummary?> GetLayoutAsync(string ownerId, string id, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var row = await db.Layouts.FindAsync([id], ct);
        return row is null || row.OwnerId != ownerId ? null : ToDto(row);
    }

    public async Task<LayoutSummary> SaveLayoutAsync(string ownerId, SaveLayoutInput input, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var now = DateTimeOffset.UtcNow;
        LayoutEntity row;
        if (!string.IsNullOrEmpty(input.Id) && await db.Layouts.FindAsync([input.Id], ct) is { } existing)
        {
            if (existing.OwnerId != ownerId)
                throw new GraphQLException("Layout not found.");
            row = existing;
        }
        else
        {
            row = new LayoutEntity { Id = Ids.New(), OwnerId = ownerId, CreatedAt = now };
            db.Layouts.Add(row);
        }

        row.Name = input.Name;
        row.Data = input.Data;
        row.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return ToDto(row);
    }

    // ── Mapping ─────────────────────────────────────────────────────────────
    private static SessionSummary ToDto(SessionEntity e) => new()
    {
        Id = e.Id, OwnerId = e.OwnerId, Game = e.Game, Track = e.Track,
        Car = e.Car, SessionType = e.SessionType, CreatedAt = e.CreatedAt
    };

    private static SetupSummary ToDto(SetupEntity e) => new()
    {
        Id = e.Id, OwnerId = e.OwnerId, Name = e.Name, Game = e.Game, Car = e.Car,
        Track = e.Track, Data = e.Data, CreatedAt = e.CreatedAt, UpdatedAt = e.UpdatedAt
    };

    private static LayoutSummary ToDto(LayoutEntity e) => new()
    {
        Id = e.Id, OwnerId = e.OwnerId, Name = e.Name, Data = e.Data,
        CreatedAt = e.CreatedAt, UpdatedAt = e.UpdatedAt
    };
}
