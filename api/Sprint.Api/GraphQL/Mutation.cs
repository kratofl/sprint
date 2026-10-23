using System.Security.Claims;
using HotChocolate;
using HotChocolate.Authorization;
using Sprint.Api.Auth;
using Sprint.Api.Auth.Discord;
using Sprint.Api.Services;
using Sprint.Contracts;

namespace Sprint.Api.GraphQL;

public sealed class Mutation
{
    // ── Auth (anonymous) ────────────────────────────────────────────────────
    public Task<AuthResponse> Register(AuthRequest input, [Service] UserService users, CancellationToken ct) =>
        users.RegisterAsync(input, ct);

    public Task<AuthResponse> Login(AuthRequest input, [Service] UserService users, CancellationToken ct) =>
        users.LoginAsync(input, ct);

    /// <summary>Trades the single-use ticket a Discord sign-in ended with for a JWT. Anonymous.</summary>
    public Task<AuthResponse> RedeemSignInTicket(string ticket, [Service] DiscordSignIn discord, CancellationToken ct) =>
        discord.RedeemAsync(ticket, ct);

    // ── Shared laps (#197) ─────────────────────────────────────────────────────
    /// <summary>Mints an unguessable code for one lap. Only laps shared here ever leave a machine.</summary>
    [Authorize]
    public Task<SharedLapSummary> ShareLap(ShareLapInput input, ClaimsPrincipal user, [Service] LapShareService laps, CancellationToken ct) =>
        laps.ShareAsync(user.RequireUserId(), input, ct);

    /// <summary>Withdraws a code. The lap stays listed to its owner, marked revoked.</summary>
    [Authorize]
    public Task<SharedLapSummary> RevokeSharedLap(string code, ClaimsPrincipal user, [Service] LapShareService laps, CancellationToken ct) =>
        laps.RevokeAsync(user.RequireUserId(), code, ct);

    /// <summary>Sets the name other drivers see on a shared lap.</summary>
    [Authorize]
    public Task<UserProfile> SetDisplayName(string displayName, ClaimsPrincipal user, [Service] UserService users, CancellationToken ct) =>
        users.SetDisplayNameAsync(user.RequireUserId(), displayName, ct);

    /// <summary>Replaces the signed-in user's password after checking the current one.</summary>
    [Authorize]
    public Task<bool> ChangePassword(string currentPassword, string newPassword, ClaimsPrincipal user, [Service] UserService users, CancellationToken ct) =>
        users.ChangePasswordAsync(user.RequireUserId(), currentPassword, newPassword, ct);

    /// <summary>Admin only: the server's name and whether strangers may register.</summary>
    [Authorize]
    public Task<ServerSettingsDto> UpdateServerSettings(UpdateServerSettingsInput input, ClaimsPrincipal user, [Service] ServerSettingsService settings, CancellationToken ct) =>
        settings.UpdateAsync(user.RequireUserId(), input, ct);

    // ── Catalog ────────────────────────────────────────────────────────────────
    [Authorize]
    public Task<SessionSummary> CreateSession(CreateSessionInput input, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.CreateSessionAsync(user.RequireUserId(), input, ct);

    /// <summary>Uploads a session from the desktop, or updates one it uploaded before.</summary>
    [Authorize]
    public Task<SessionSummary> SaveSession(SaveSessionInput input, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.SaveSessionAsync(user.RequireUserId(), input, ct);

    [Authorize]
    public Task<SetupSummary> SaveSetup(SaveSetupInput input, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.SaveSetupAsync(user.RequireUserId(), input, ct);

    [Authorize]
    public Task<LayoutSummary> SaveLayout(SaveLayoutInput input, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.SaveLayoutAsync(user.RequireUserId(), input, ct);

    // ── Race engineers ─────────────────────────────────────────────────────────
    /// <summary>A single-use link (7 days) that makes whoever opens it the caller's race engineer.</summary>
    [Authorize]
    public Task<EngineerInviteDto> CreateEngineerInvite(ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.CreateInviteAsync(user.RequireUserId(), ct);

    /// <summary>Withdraws one of the caller's unused invite links.</summary>
    [Authorize]
    public Task<bool> RevokeEngineerInvite(string token, ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.RevokeInviteAsync(user.RequireUserId(), token, ct);

    /// <summary>Makes the caller the race engineer of the link's driver.</summary>
    [Authorize]
    public Task<EngineerLinkDto> AcceptEngineerInvite(string token, ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.AcceptInviteAsync(user.RequireUserId(), token, ct);

    /// <summary>The caller (a driver) drops one of their engineers. Live streams close at once.</summary>
    [Authorize]
    public Task<bool> RemoveEngineer(string engineerId, ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.RemoveEngineerAsync(user.RequireUserId(), engineerId, ct);

    /// <summary>The caller (an engineer) stops engineering for a driver.</summary>
    [Authorize]
    public Task<bool> LeaveDriver(string driverId, ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.LeaveDriverAsync(user.RequireUserId(), driverId, ct);

    /// <summary>Hides one of the caller's sessions from one of their engineers, live stream included, at once.</summary>
    [Authorize]
    public Task<bool> ExcludeEngineerFromSession(string sessionId, string engineerId, ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.SetSessionAccessAsync(user.RequireUserId(), sessionId, engineerId, hasAccess: false, ct);

    /// <summary>Shows a session to an engineer again.</summary>
    [Authorize]
    public Task<bool> IncludeEngineerInSession(string sessionId, string engineerId, ClaimsPrincipal user, [Service] EngineerService engineers, CancellationToken ct) =>
        engineers.SetSessionAccessAsync(user.RequireUserId(), sessionId, engineerId, hasAccess: true, ct);
}
