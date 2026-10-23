using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;
using Sprint.Api.Live;
using Sprint.Contracts;

namespace Sprint.Api.Services;

/// <summary>How joining a live stream went: watching, nothing live under that key, or not allowed to watch it.</summary>
public abstract record LiveWatch;

public sealed record Watching(LiveSubscription Subscription) : LiveWatch;

public sealed record NotLive : LiveWatch;

public sealed record NotAllowed : LiveWatch;

/// <summary>
/// Race engineers: invite links, driver–engineer links, per-session exclusions, and what each
/// account may therefore see. Every change that takes access away also takes the engineer off
/// the affected live streams at once (<see cref="LiveHub.Revoke"/>), after the database knows.
/// </summary>
public sealed class EngineerService(IDbContextFactory<SprintDbContext> dbFactory, PublicUrls urls, LiveHub hub, TimeProvider time)
{
    public static readonly TimeSpan InviteTtl = TimeSpan.FromDays(7);
    private const string FallbackName = "Sprint user";

    // ── Invites ────────────────────────────────────────────────────────────────
    public async Task<EngineerInviteDto> CreateInviteAsync(string driverId, CancellationToken ct = default)
    {
        DateTimeOffset now = time.GetUtcNow();
        EngineerInviteEntity invite = new() { Token = Ids.New(), DriverId = driverId, CreatedAt = now, ExpiresAt = now.Add(InviteTtl) };
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        db.EngineerInvites.Add(invite);
        await db.SaveChangesAsync(ct);
        return this.ToDto(invite, now);
    }

    /// <summary>The driver's links nobody has used yet and that still work, newest first.</summary>
    public async Task<IReadOnlyList<EngineerInviteDto>> OpenInvitesAsync(string driverId, CancellationToken ct = default)
    {
        DateTimeOffset now = time.GetUtcNow();
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        List<EngineerInviteEntity> rows = await db.EngineerInvites
            .Where(i => i.DriverId == driverId && i.UsedAt == null && i.RevokedAt == null)
            .ToListAsync(ct);
        return [.. rows.Where(i => i.ExpiresAt > now).OrderByDescending(i => i.CreatedAt).Select(i => this.ToDto(i, now))];
    }

    /// <summary>Withdraws an unused link. Only its driver can; a used link has nothing left to revoke.</summary>
    public async Task<bool> RevokeInviteAsync(string driverId, string token, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        EngineerInviteEntity? invite = await db.EngineerInvites.FindAsync([token], ct);
        if (invite is null || invite.DriverId != driverId)
            throw new GraphQLException("Invite link not found.");
        if (invite.UsedAt is not null)
            throw new GraphQLException("This invite link was already used. Remove the engineer instead.");
        invite.RevokedAt ??= time.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>What the link says before anyone accepts it. Anonymous: the page shows who invited you before you sign in.</summary>
    public async Task<EngineerInvitePreview> PreviewAsync(string token, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        EngineerInviteEntity? invite = await db.EngineerInvites.FindAsync([token], ct);
        if (invite is null)
            return new EngineerInvitePreview { Status = EngineerInviteStatus.NotFound };
        UserEntity? driver = await db.Users.FindAsync([invite.DriverId], ct);
        return new EngineerInvitePreview
        {
            Status = driver is null ? EngineerInviteStatus.NotFound : StatusOf(invite, time.GetUtcNow()),
            Driver = driver is null ? null : Summary(driver),
            ExpiresAt = invite.ExpiresAt,
        };
    }

    /// <summary>
    /// Makes the caller the link's driver's engineer and uses the link up. Accepting a link of a
    /// driver one already engineers for changes nothing and leaves the link for somebody else.
    /// </summary>
    public async Task<EngineerLinkDto> AcceptInviteAsync(string engineerId, string token, CancellationToken ct = default)
    {
        DateTimeOffset now = time.GetUtcNow();
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        EngineerInviteEntity? invite = await db.EngineerInvites.FindAsync([token], ct);
        EngineerInviteStatus status = invite is null ? EngineerInviteStatus.NotFound : StatusOf(invite, now);
        if (invite is null || status != EngineerInviteStatus.Valid)
        {
            throw new GraphQLException(status switch
            {
                EngineerInviteStatus.Expired => "This invite link has expired. Ask the driver for a new one.",
                EngineerInviteStatus.Used => "This invite link was already used.",
                EngineerInviteStatus.Revoked => "The driver withdrew this invite link.",
                _ => "This invite link does not exist.",
            });
        }

        if (invite.DriverId == engineerId)
            throw new GraphQLException("You cannot be your own race engineer.");

        UserEntity driver = await db.Users.FindAsync([invite.DriverId], ct)
            ?? throw new GraphQLException("This invite link does not exist.");
        UserEntity engineer = await db.Users.FindAsync([engineerId], ct)
            ?? throw new GraphQLException("That account no longer exists.");

        EngineerLinkEntity? link = await db.EngineerLinks.FindAsync([invite.DriverId, engineerId], ct);
        if (link is null)
        {
            link = new EngineerLinkEntity { DriverId = invite.DriverId, EngineerId = engineerId, CreatedAt = now };
            db.EngineerLinks.Add(link);
            invite.UsedAt = now;
            invite.UsedById = engineerId;
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex)
            {
                // Two accepts raced. When one of them was this same account (a double submit), the
                // link exists now and this accept succeeds like any repeat; otherwise somebody else
                // used the link first (UsedAt is a concurrency token).
                link = await this.FindLinkAsync(invite.DriverId, engineerId, ct);
                if (link is null && ex is DbUpdateConcurrencyException)
                    throw new GraphQLException("This invite link was already used.");
                if (link is null)
                    throw;
            }
        }

        return new EngineerLinkDto { Driver = Summary(driver), Engineer = Summary(engineer), CreatedAt = link.CreatedAt };
    }

    // ── Links ──────────────────────────────────────────────────────────────────
    /// <summary>The caller's engineers.</summary>
    public Task<IReadOnlyList<EngineerLinkDto>> EngineersOfAsync(string driverId, CancellationToken ct = default) =>
        this.LinksAsync(l => l.DriverId == driverId, ct);

    /// <summary>The drivers the caller engineers for.</summary>
    public Task<IReadOnlyList<EngineerLinkDto>> DriversOfAsync(string engineerId, CancellationToken ct = default) =>
        this.LinksAsync(l => l.EngineerId == engineerId, ct);

    /// <summary>The driver drops an engineer. They lose every session, live ones included, now.</summary>
    public Task<bool> RemoveEngineerAsync(string driverId, string engineerId, CancellationToken ct = default) =>
        this.UnlinkAsync(driverId, engineerId, "The driver removed you as their engineer.", ct);

    /// <summary>The engineer stops engineering for a driver.</summary>
    public Task<bool> LeaveDriverAsync(string engineerId, string driverId, CancellationToken ct = default) =>
        this.UnlinkAsync(driverId, engineerId, "You stopped engineering for this driver.", ct);

    // ── Per-session access ─────────────────────────────────────────────────────
    /// <summary>
    /// Hides one of the driver's sessions from one of their engineers, or shows it again. Hiding a
    /// live session closes that engineer's stream of it at once.
    /// </summary>
    public async Task<bool> SetSessionAccessAsync(string driverId, string sessionId, string engineerId, bool hasAccess, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        SessionEntity? session = await db.Sessions.FindAsync([sessionId], ct);
        if (session is null || session.OwnerId != driverId)
            throw new GraphQLException("Session not found.");
        if (await db.EngineerLinks.FindAsync([driverId, engineerId], ct) is null)
            throw new GraphQLException("That account is not your engineer.");

        SessionEngineerExclusionEntity? exclusion = await db.SessionEngineerExclusions.FindAsync([driverId, session.SessionKey, engineerId], ct);
        if (hasAccess && exclusion is not null)
            db.SessionEngineerExclusions.Remove(exclusion);
        else if (!hasAccess && exclusion is null)
            db.SessionEngineerExclusions.Add(new SessionEngineerExclusionEntity { DriverId = driverId, SessionKey = session.SessionKey, EngineerId = engineerId, CreatedAt = time.GetUtcNow() });
        await db.SaveChangesAsync(ct);

        if (!hasAccess)
            hub.Revoke(driverId, engineerId, session.SessionKey, "The driver removed you from this session.");
        return true;
    }

    // ── What a viewer sees ─────────────────────────────────────────────────────
    /// <summary>The facts <see cref="ViewerGrants.CanView"/> decides on, for one viewer.</summary>
    public async Task<ViewerGrants> GrantsForAsync(string viewerId, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        List<string> drivers = await db.EngineerLinks.Where(l => l.EngineerId == viewerId).Select(l => l.DriverId).ToListAsync(ct);
        List<SessionEngineerExclusionEntity> excluded = await db.SessionEngineerExclusions.Where(x => x.EngineerId == viewerId).ToListAsync(ct);
        return new ViewerGrants(viewerId, drivers.ToHashSet(StringComparer.Ordinal), excluded.Select(x => (x.DriverId, x.SessionKey)).ToHashSet());
    }

    /// <summary>The caller's own sessions and those of drivers they engineer for, minus exclusions, newest first.</summary>
    public async Task<IReadOnlyList<VisibleSession>> VisibleSessionsAsync(string viewerId, CancellationToken ct = default)
    {
        ViewerGrants grants = await this.GrantsForAsync(viewerId, ct);
        List<string> drivers = [.. grants.Drivers];
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        List<SessionEntity> rows = await db.Sessions
            .Where(s => s.OwnerId == viewerId || drivers.Contains(s.OwnerId))
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(ct);
        return await this.ToVisibleAsync(db, viewerId, [.. rows.Where(s => grants.CanView(s.OwnerId, s.SessionKey))], ct);
    }

    /// <summary>One session by server id, or null when it does not exist or the caller may not see it.</summary>
    public async Task<VisibleSession?> VisibleSessionAsync(string viewerId, string sessionId, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        SessionEntity? row = await db.Sessions.FindAsync([sessionId], ct);
        if (row is null || !(await this.GrantsForAsync(viewerId, ct)).CanView(row.OwnerId, row.SessionKey))
            return null;
        return (await this.ToVisibleAsync(db, viewerId, [row], ct))[0];
    }

    /// <summary>Whether <paramref name="viewerId"/> may see <paramref name="driverId"/>'s session <paramref name="sessionKey"/>.</summary>
    public async Task<bool> CanViewAsync(string viewerId, string driverId, string sessionKey, CancellationToken ct = default) =>
        (await this.GrantsForAsync(viewerId, ct)).CanView(driverId, sessionKey);

    /// <summary>The sessions streaming right now that the caller may watch.</summary>
    public async Task<IReadOnlyList<LiveSessionDto>> LiveSessionsAsync(string viewerId, CancellationToken ct = default)
    {
        ViewerGrants grants = await this.GrantsForAsync(viewerId, ct);
        return [.. hub.All().Where(live => grants.CanView(live.DriverId, live.Session.SessionKey)).Select(live => live.Session)];
    }

    /// <summary>
    /// Joins the live session <paramref name="sessionKey"/> the viewer may watch: their own, else
    /// one of a driver they engineer for. Keys are only unique per driver, so another account
    /// streaming under a copied key is simply not the one picked.
    /// </summary>
    public async Task<LiveWatch> WatchAsync(string viewerId, string sessionKey, CancellationToken ct = default)
    {
        IReadOnlyList<LiveSessionView> live = hub.WithKey(sessionKey);
        if (live.Count == 0)
            return new NotLive();
        ViewerGrants grants = await this.GrantsForAsync(viewerId, ct);
        LiveSessionView? target = live
            .Where(l => grants.CanView(l.DriverId, sessionKey))
            .OrderByDescending(l => l.DriverId == viewerId)
            .FirstOrDefault();
        if (target is null)
            return new NotAllowed();

        // Join, then check again: a revoke between the check above and the join would miss this subscription.
        LiveSubscription? subscription = hub.Subscribe(target.DriverId, sessionKey, viewerId);
        if (subscription is null)
            return new NotLive();
        if (!await this.CanViewAsync(viewerId, target.DriverId, sessionKey, ct))
        {
            subscription.Dispose();
            return new NotAllowed();
        }

        return new Watching(subscription);
    }

    /// <summary>The public face of an account: never its email.</summary>
    public static AccountSummary Summary(UserEntity user) => new()
    {
        Id = user.Id,
        DisplayName = user.DisplayName.Length > 0 ? user.DisplayName : FallbackName,
        AvatarUrl = user.AvatarUrl,
    };

    /// <summary>Where a link stands at <paramref name="now"/>. Revoked beats used beats expired.</summary>
    public static EngineerInviteStatus StatusOf(EngineerInviteEntity invite, DateTimeOffset now) =>
        invite.RevokedAt is not null ? EngineerInviteStatus.Revoked
        : invite.UsedAt is not null ? EngineerInviteStatus.Used
        : invite.ExpiresAt <= now ? EngineerInviteStatus.Expired
        : EngineerInviteStatus.Valid;

    /// <summary>The link as stored now, read in a fresh context: the caller's may hold a failed save.</summary>
    private async Task<EngineerLinkEntity?> FindLinkAsync(string driverId, string engineerId, CancellationToken ct)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        return await db.EngineerLinks.FindAsync([driverId, engineerId], ct);
    }

    private async Task<bool> UnlinkAsync(string driverId, string engineerId, string reason, CancellationToken ct)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        EngineerLinkEntity link = await db.EngineerLinks.FindAsync([driverId, engineerId], ct)
            ?? throw new GraphQLException("There is no such driver–engineer pair.");
        db.EngineerLinks.Remove(link);
        await db.SaveChangesAsync(ct);
        hub.Revoke(driverId, engineerId, null, reason);
        return true;
    }

    private async Task<IReadOnlyList<EngineerLinkDto>> LinksAsync(System.Linq.Expressions.Expression<Func<EngineerLinkEntity, bool>> where, CancellationToken ct)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        List<EngineerLinkEntity> links = await db.EngineerLinks.Where(where).OrderBy(l => l.CreatedAt).ToListAsync(ct);
        Dictionary<string, AccountSummary> people = await PeopleAsync(db, links.SelectMany(l => new[] { l.DriverId, l.EngineerId }), ct);
        return [.. links
            .Where(l => people.ContainsKey(l.DriverId) && people.ContainsKey(l.EngineerId))
            .Select(l => new EngineerLinkDto { Driver = people[l.DriverId], Engineer = people[l.EngineerId], CreatedAt = l.CreatedAt })];
    }

    private async Task<IReadOnlyList<VisibleSession>> ToVisibleAsync(SprintDbContext db, string viewerId, List<SessionEntity> rows, CancellationToken ct)
    {
        // The engineer-access column is only for the viewer's own sessions.
        List<string> myEngineers = await db.EngineerLinks.Where(l => l.DriverId == viewerId).Select(l => l.EngineerId).ToListAsync(ct);
        HashSet<(string SessionKey, string EngineerId)> myExclusions = myEngineers.Count == 0
            ? []
            : (await db.SessionEngineerExclusions.Where(x => x.DriverId == viewerId).ToListAsync(ct)).Select(x => (x.SessionKey, x.EngineerId)).ToHashSet();
        Dictionary<string, AccountSummary> people = await PeopleAsync(db, rows.Select(r => r.OwnerId).Concat(myEngineers), ct);

        return [.. rows.Select(row => new VisibleSession
        {
            Id = row.Id,
            SessionKey = row.SessionKey,
            Driver = people.GetValueOrDefault(row.OwnerId) ?? new AccountSummary { Id = row.OwnerId, DisplayName = FallbackName },
            IsMine = row.OwnerId == viewerId,
            IsLive = hub.IsLive(row.OwnerId, row.SessionKey),
            Game = row.Game,
            Track = row.Track,
            Car = row.Car,
            SessionType = row.SessionType,
            StartedAt = row.StartedAt,
            CreatedAt = row.CreatedAt,
            Data = row.Data,
            EngineerAccess = row.OwnerId != viewerId
                ? []
                : [.. myEngineers.Where(people.ContainsKey).Select(id => new SessionEngineerAccess
                {
                    Engineer = people[id],
                    HasAccess = !myExclusions.Contains((row.SessionKey, id)),
                })],
        })];
    }

    private static async Task<Dictionary<string, AccountSummary>> PeopleAsync(SprintDbContext db, IEnumerable<string> ids, CancellationToken ct)
    {
        List<string> wanted = [.. ids.Distinct()];
        List<UserEntity> users = await db.Users.Where(u => wanted.Contains(u.Id)).ToListAsync(ct);
        return users.ToDictionary(u => u.Id, Summary);
    }

    private EngineerInviteDto ToDto(EngineerInviteEntity invite, DateTimeOffset now) => new()
    {
        Token = invite.Token,
        Url = urls.WebLink($"/engineer/invite/{invite.Token}"),
        Status = StatusOf(invite, now),
        CreatedAt = invite.CreatedAt,
        ExpiresAt = invite.ExpiresAt,
    };
}
