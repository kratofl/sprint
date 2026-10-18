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
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        List<SessionEntity> rows = await db.Sessions.Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.CreatedAt).ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<SessionSummary?> GetSessionAsync(string ownerId, string id, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        SessionEntity? row = await db.Sessions.FindAsync([id], ct);
        return row is null || row.OwnerId != ownerId ? null : ToDto(row);
    }

    public async Task<SessionSummary> CreateSessionAsync(string ownerId, CreateSessionInput input, CancellationToken ct = default)
    {
        string id = Ids.New();
        SessionEntity row = new()
        {
            Id = id,
            OwnerId = ownerId,
            SessionKey = id,
            Game = input.Game,
            Track = input.Track,
            Car = input.Car,
            SessionType = string.IsNullOrEmpty(input.SessionType) ? "unknown" : input.SessionType,
            CreatedAt = DateTimeOffset.UtcNow
        };
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        db.Sessions.Add(row);
        await db.SaveChangesAsync(ct);
        return ToDto(row);
    }

    /// <summary>
    /// Creates or updates an uploaded session: by id when the desktop knows it, else by session
    /// key (live telemetry may have created the row first), else new. An id that belongs to
    /// another owner reads as not found. A session's key never changes once set.
    /// </summary>
    public async Task<SessionSummary> SaveSessionAsync(string ownerId, SaveSessionInput input, CancellationToken ct = default)
    {
        string key = SessionKeys.Clean(input.SessionKey) ?? SessionKeys.FromPayload(input.Data) ?? "";
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        SessionEntity? row = null;
        if (!string.IsNullOrEmpty(input.Id) && await db.Sessions.FindAsync([input.Id], ct) is { } existing)
        {
            if (existing.OwnerId != ownerId)
                throw new GraphQLException("Session not found.");
            row = existing;
        }
        else if (key.Length > 0)
        {
            row = await db.Sessions.FirstOrDefaultAsync(s => s.OwnerId == ownerId && s.SessionKey == key, ct);
        }

        if (row is null)
        {
            string id = Ids.New();
            row = new SessionEntity { Id = id, OwnerId = ownerId, SessionKey = key.Length > 0 ? key : id, CreatedAt = DateTimeOffset.UtcNow };
            db.Sessions.Add(row);
        }

        row.Game = input.Game;
        row.Track = input.Track;
        row.Car = input.Car;
        row.SessionType = string.IsNullOrEmpty(input.SessionType) ? "unknown" : input.SessionType;
        row.StartedAt = input.StartedAt;
        row.Data = string.IsNullOrEmpty(input.Data) ? "{}" : input.Data;
        await db.SaveChangesAsync(ct);
        return ToDto(row);
    }

    /// <summary>
    /// The session a live stream belongs to, created on its first start so the session is listed
    /// (and its telemetry reachable) before the desktop's next sync uploads its laps.
    /// </summary>
    public async Task<SessionSummary> EnsureLiveSessionAsync(string ownerId, LiveStartMessage start, DateTimeOffset startedAt, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        if (await db.Sessions.FirstOrDefaultAsync(s => s.OwnerId == ownerId && s.SessionKey == start.SessionKey, ct) is { } existing)
            return ToDto(existing);

        SessionEntity row = new()
        {
            Id = Ids.New(),
            OwnerId = ownerId,
            SessionKey = start.SessionKey,
            Game = start.Game,
            Track = start.Track,
            Car = start.Car,
            SessionType = string.IsNullOrEmpty(start.SessionType) ? "unknown" : start.SessionType,
            StartedAt = startedAt,
            CreatedAt = startedAt,
        };
        db.Sessions.Add(row);
        try
        {
            await db.SaveChangesAsync(ct);
            return ToDto(row);
        }
        catch (DbUpdateException)
        {
            // A sync upload created the same (owner, key) a moment ago; the unique index caught it.
            await using SprintDbContext retry = await dbFactory.CreateDbContextAsync(ct);
            return ToDto(await retry.Sessions.FirstAsync(s => s.OwnerId == ownerId && s.SessionKey == start.SessionKey, ct));
        }
    }

    // ── Setups ──────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<SetupSummary>> ListSetupsAsync(string ownerId, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        List<SetupEntity> rows = await db.Setups.Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.UpdatedAt).ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<SetupSummary?> GetSetupAsync(string ownerId, string id, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        SetupEntity? row = await db.Setups.FindAsync([id], ct);
        return row is null || row.OwnerId != ownerId ? null : ToDto(row);
    }

    public async Task<SetupSummary> SaveSetupAsync(string ownerId, SaveSetupInput input, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        DateTimeOffset now = DateTimeOffset.UtcNow;
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
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        List<LayoutEntity> rows = await db.Layouts.Where(l => l.OwnerId == ownerId)
            .OrderByDescending(l => l.UpdatedAt).ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<LayoutSummary?> GetLayoutAsync(string ownerId, string id, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        LayoutEntity? row = await db.Layouts.FindAsync([id], ct);
        return row is null || row.OwnerId != ownerId ? null : ToDto(row);
    }

    public async Task<LayoutSummary> SaveLayoutAsync(string ownerId, SaveLayoutInput input, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        DateTimeOffset now = DateTimeOffset.UtcNow;
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
        Id = e.Id,
        OwnerId = e.OwnerId,
        SessionKey = e.SessionKey,
        Game = e.Game,
        Track = e.Track,
        Car = e.Car,
        SessionType = e.SessionType,
        StartedAt = e.StartedAt,
        Data = e.Data,
        CreatedAt = e.CreatedAt
    };

    private static SetupSummary ToDto(SetupEntity e) => new()
    {
        Id = e.Id,
        OwnerId = e.OwnerId,
        Name = e.Name,
        Game = e.Game,
        Car = e.Car,
        Track = e.Track,
        Data = e.Data,
        CreatedAt = e.CreatedAt,
        UpdatedAt = e.UpdatedAt
    };

    private static LayoutSummary ToDto(LayoutEntity e) => new()
    {
        Id = e.Id,
        OwnerId = e.OwnerId,
        Name = e.Name,
        Data = e.Data,
        CreatedAt = e.CreatedAt,
        UpdatedAt = e.UpdatedAt
    };
}
