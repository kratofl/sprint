using System.Security.Claims;
using HotChocolate;
using HotChocolate.Authorization;
using Sprint.Api.Auth;
using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Sprint.Contracts;

namespace Sprint.Api.GraphQL;

public sealed class Query
{
    /// <summary>Liveness + running version. Anonymous.</summary>
    public HealthStatus Health([Service] ServerInfo info) =>
        new() { Status = "ok", Version = info.Version };

    /// <summary>The server's name and whether it takes new accounts. Anonymous: the sign-in page reads it.</summary>
    public Task<ServerSettingsDto> ServerSettings([Service] ServerSettingsService settings, CancellationToken ct) =>
        settings.GetAsync(ct);

    /// <summary>The authenticated user's profile.</summary>
    [Authorize]
    public Task<UserProfile?> Me(ClaimsPrincipal user, [Service] UserService users, CancellationToken ct) =>
        users.GetProfileAsync(user.RequireUserId(), ct);

    // ── Sessions ──────────────────────────────────────────────────────────────
    [Authorize]
    public Task<IReadOnlyList<SessionSummary>> Sessions(ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.ListSessionsAsync(user.RequireUserId(), ct);

    [Authorize]
    public Task<SessionSummary?> Session(string id, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.GetSessionAsync(user.RequireUserId(), id, ct);

    // ── Setups ────────────────────────────────────────────────────────────────
    [Authorize]
    public Task<IReadOnlyList<SetupSummary>> Setups(ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.ListSetupsAsync(user.RequireUserId(), ct);

    [Authorize]
    public Task<SetupSummary?> Setup(string id, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.GetSetupAsync(user.RequireUserId(), id, ct);

    // ── Layouts ───────────────────────────────────────────────────────────────
    [Authorize]
    public Task<IReadOnlyList<LayoutSummary>> Layouts(ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.ListLayoutsAsync(user.RequireUserId(), ct);

    [Authorize]
    public Task<LayoutSummary?> Layout(string id, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.GetLayoutAsync(user.RequireUserId(), id, ct);

    // ── Shared laps (#197) ────────────────────────────────────────────────────
    /// <summary>
    /// The lap behind a share code. Holding the code is the whole permission — there is no
    /// friend graph, by design — but the caller still has to be a signed-in Sprint user.
    /// </summary>
    [Authorize]
    public Task<SharedLapDto> SharedLap(string code, [Service] LapShareService laps, CancellationToken ct) =>
        laps.FetchAsync(code, ct);

    /// <summary>Every lap this driver has shared, including ones they have revoked.</summary>
    [Authorize]
    public Task<IReadOnlyList<SharedLapSummary>> MySharedLaps(ClaimsPrincipal user, [Service] LapShareService laps, CancellationToken ct) =>
        laps.ListMineAsync(user.RequireUserId(), ct);

    // ── Race engineers ────────────────────────────────────────────────────────
    /// <summary>What an invite link says. Anonymous, so the page can show who invited you before you sign in.</summary>
    public Task<EngineerInvitePreview> EngineerInvite(string token, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.PreviewAsync(token, ct);

    /// <summary>The caller's invite links that are still open (unused, unrevoked, unexpired).</summary>
    [Authorize]
    public Task<IReadOnlyList<EngineerInviteDto>> MyEngineerInvites(ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.OpenInvitesAsync(user.RequireUserId(), ct);

    /// <summary>The caller's race engineers.</summary>
    [Authorize]
    public Task<IReadOnlyList<EngineerLinkDto>> MyEngineers(ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.EngineersOfAsync(user.RequireUserId(), ct);

    /// <summary>The drivers the caller engineers for.</summary>
    [Authorize]
    public Task<IReadOnlyList<EngineerLinkDto>> MyDrivers(ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.DriversOfAsync(user.RequireUserId(), ct);

    /// <summary>The caller's sessions and those of drivers they engineer for (minus exclusions), newest first.</summary>
    [Authorize]
    public Task<IReadOnlyList<VisibleSession>> VisibleSessions(ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.VisibleSessionsAsync(user.RequireUserId(), ct);

    /// <summary>One visible session by its server id; null when it does not exist or is not the caller's to see.</summary>
    [Authorize]
    public Task<VisibleSession?> VisibleSession(string id, ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.VisibleSessionAsync(user.RequireUserId(), id, ct);

    /// <summary>Sessions streaming right now that the caller may watch.</summary>
    [Authorize]
    public Task<IReadOnlyList<LiveSessionDto>> LiveSessions(ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.LiveSessionsAsync(user.RequireUserId(), ct);

    /// <summary>
    /// A visible session's stored live telemetry, downsampled on the server to at most
    /// <paramref name="maxPoints"/> (clamped to 10..5000), and its laps. Empty when the session
    /// was never streamed or InfluxDB is not configured.
    /// </summary>
    [Authorize]
    public async Task<SessionTelemetry> SessionTelemetry(
        string sessionId,
        ClaimsPrincipal user,
        [Service] EngineerService engineers,
        [Service] ITelemetryStore telemetry,
        CancellationToken ct,
        int maxPoints = 600)
    {
        VisibleSession session = await engineers.VisibleSessionAsync(user.RequireUserId(), sessionId, ct)
            ?? throw new GraphQLException("Session not found.");
        // Live rows start at the stream's start; uploaded ones at the desktop's. Look a little before either.
        DateTimeOffset start = session.StartedAt is { } started && started < session.CreatedAt ? started : session.CreatedAt;
        DateTimeOffset from = start.AddHours(-1);
        IReadOnlyList<LiveSample> samples = await telemetry.ReadSamplesAsync(session.Driver.Id, session.SessionKey, from, Math.Clamp(maxPoints, 10, 5000), ct);
        IReadOnlyList<LiveLap> laps = await telemetry.ReadLapsAsync(session.Driver.Id, session.SessionKey, from, ct);
        return new SessionTelemetry { SessionId = session.Id, SessionKey = session.SessionKey, Samples = samples, Laps = laps };
    }
}
