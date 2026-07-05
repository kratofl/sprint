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

    // ── Catalog ────────────────────────────────────────────────────────────────
    [Authorize]
    public Task<SessionSummary> CreateSession(CreateSessionInput input, ClaimsPrincipal user, [Service] CatalogService catalog, CancellationToken ct) =>
        catalog.CreateSessionAsync(user.RequireUserId(), input, ct);

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
