using System.Security.Claims;
using System.Text.Json;
using HotChocolate;
using HotChocolate.Authorization;
using HotChocolate.Subscriptions;
using Sprint.Api.Auth;
using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Sprint.Contracts;
using Sprint.Desktop.Api.Engineer;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Api.GraphQL;

public sealed class Mutation
{
    // ── Auth (anonymous) ────────────────────────────────────────────────────
    public Task<AuthResponse> Register(AuthRequest input, [Service] UserService users, CancellationToken ct) =>
        users.RegisterAsync(input, ct);

    public Task<AuthResponse> Login(AuthRequest input, [Service] UserService users, CancellationToken ct) =>
        users.LoginAsync(input, ct);

    // ── Invite codes ─────────────────────────────────────────────────────────
    [Authorize]
    public Task<InviteCodeDto> CreateInviteCode(string? sessionId, ClaimsPrincipal user, [Service] InviteService invites, CancellationToken ct) =>
        invites.CreateAsync(user.RequireUserId(), sessionId, ct);

    /// <summary>Marks the driver as connected on a code (one-time; rejects a second driver — anti-hijack).</summary>
    [Authorize]
    public async Task<bool> JoinAsDriver(string code, ClaimsPrincipal user, [Service] InviteService invites, CancellationToken ct)
    {
        var invite = await invites.ValidateAsync(code, ct);
        if (invite.DriverId != user.RequireUserId())
            throw new GraphQLException("Not the driver for this invite.");
        await invites.MarkDriverJoinedAsync(code, ct);
        return true;
    }

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

    // ── Engineer relay ─────────────────────────────────────────────────────────
    /// <summary>
    /// Driver → engineers. Only the invite's driver may publish. <c>telemetry_frame</c>
    /// events are also persisted to the time-series store.
    /// </summary>
    [Authorize]
    public async Task<bool> PublishEngineerEvent(
        string code,
        EngineerEventMessage message,
        ClaimsPrincipal user,
        [Service] InviteService invites,
        [Service] ITelemetryStore telemetry,
        [Service] ITopicEventSender sender,
        CancellationToken ct)
    {
        var invite = await invites.ValidateAsync(code, ct);
        if (invite.DriverId != user.RequireUserId())
            throw new GraphQLException("Not the driver for this invite.");

        if (message.Type == EngineerEventType.TelemetryFrame && message.Payload is { Length: > 0 } json)
        {
            var frame = TryDeserialize<TelemetryFrame>(json);
            if (frame is not null)
                await telemetry.WriteFrameAsync(code, invite.DriverId, frame, ct);
        }

        await sender.SendAsync(RelayTopics.Events(code), message, ct);
        return true;
    }

    /// <summary>Engineer → driver. Any authenticated holder of a valid code may send a command.</summary>
    [Authorize]
    public async Task<bool> SendEngineerCommand(
        string code,
        EngineerCommandMessage message,
        [Service] InviteService invites,
        [Service] ITopicEventSender sender,
        CancellationToken ct)
    {
        await invites.ValidateAsync(code, ct);
        await sender.SendAsync(RelayTopics.Commands(code), message, ct);
        return true;
    }

    private static T? TryDeserialize<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
}
