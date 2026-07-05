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

    // ── Telemetry history ─────────────────────────────────────────────────────
    /// <summary>Recent stored telemetry samples for a relay channel. Requires a valid invite code.</summary>
    [Authorize]
    public async Task<IReadOnlyList<TelemetrySample>> RecentTelemetry(
        string code,
        int limit,
        [Service] InviteService invites,
        [Service] ITelemetryStore telemetry,
        CancellationToken ct)
    {
        await invites.ValidateAsync(code, ct);
        return await telemetry.GetRecentSamplesAsync(code, Math.Clamp(limit, 1, 5000), ct);
    }
}
