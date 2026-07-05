using HotChocolate;
using HotChocolate.Execution;
using HotChocolate.Subscriptions;
using HotChocolate.Types;
using Sprint.Api.Auth;
using Sprint.Api.Services;

namespace Sprint.Api.GraphQL;

/// <summary>
/// The engineer relay, as GraphQL subscriptions. Faithful to the Go WebSocket relay:
/// the subscriber presents a JWT (as an argument, like the Go query-param token) plus
/// a valid invite code; the driver stream additionally requires the caller to be the
/// invite's driver. Replaces <c>relay/hub.go</c>.
/// </summary>
public sealed class Subscription
{
    /// <summary>Engineer stream: driver-published events for a session. Requires a valid token + invite code.</summary>
    [Subscribe(With = nameof(SubscribeToEvents))]
    public EngineerEventMessage EngineerEvents(
        string token,
        string code,
        [EventMessage] EngineerEventMessage message) => message;

    public async ValueTask<ISourceStream<EngineerEventMessage>> SubscribeToEvents(
        string token,
        string code,
        [Service] JwtTokenService tokens,
        [Service] InviteService invites,
        [Service] ITopicEventReceiver receiver,
        CancellationToken ct)
    {
        tokens.ValidateAndGetUserId(token);
        await invites.ValidateAsync(code, ct);
        return await receiver.SubscribeAsync<EngineerEventMessage>(RelayTopics.Events(code), ct);
    }

    /// <summary>Driver stream: engineer commands for a session. Only the invite's driver may subscribe.</summary>
    [Subscribe(With = nameof(SubscribeToCommands))]
    public EngineerCommandMessage EngineerCommands(
        string token,
        string code,
        [EventMessage] EngineerCommandMessage message) => message;

    public async ValueTask<ISourceStream<EngineerCommandMessage>> SubscribeToCommands(
        string token,
        string code,
        [Service] JwtTokenService tokens,
        [Service] InviteService invites,
        [Service] ITopicEventReceiver receiver,
        CancellationToken ct)
    {
        var userId = tokens.ValidateAndGetUserId(token);
        var invite = await invites.ValidateAsync(code, ct);
        if (invite.DriverId != userId)
            throw new GraphQLException("Not the driver for this invite.");
        return await receiver.SubscribeAsync<EngineerCommandMessage>(RelayTopics.Commands(code), ct);
    }
}
