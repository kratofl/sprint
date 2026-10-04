namespace Sprint.Desktop.Api.Games;

/// <summary>
/// One event a game has scheduled: what to plan for, where, and when it starts.
/// </summary>
/// <param name="Id">Opaque identity from the schedule, so the same event seen twice is one event.</param>
public sealed record ScheduledEvent(
    string Id,
    string Name,
    string TrackCourse,
    DateTimeOffset StartsAtUtc)
{
    /// <summary>The class the event is run in, when the schedule states it.</summary>
    public string? CarClass { get; init; }
}

/// <summary>
/// Reads a game's scheduled events, mapped onto Sprint records. No game implements this yet:
/// one publishes a schedule Sprint can read directly, another only exposes it to its own
/// in-game UI and would have to reconstruct it, and a third has no schedule at all — which is
/// precisely why this is an optional capability a provider is allowed to answer with null.
/// </summary>
/// <remarks>
/// Asynchronous because a schedule is a remote or service-backed read, unlike the local-file
/// capabilities: making it synchronous would force every implementation to block a caller on
/// the network.
/// </remarks>
public interface IScheduleSource
{
    /// <summary>
    /// Events starting from now, earliest first. Empty when the schedule is reachable but has
    /// nothing upcoming, which is not an error.
    /// </summary>
    Task<IReadOnlyList<ScheduledEvent>> GetUpcomingAsync(CancellationToken cancellationToken = default);
}
