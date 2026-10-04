using Sprint.Desktop.Api.Games;
using Sprint.Games.LeMansUltimate;

namespace Sprint.Games;

/// <summary>
/// The registry of game providers: the one place the desktop learns which games exist.
/// Registration is the only game knowledge outside a provider — everything else (telemetry,
/// results, setups, schedule) is reached through <see cref="IGameProvider"/>, so adding a
/// game means adding a class here and nothing else changes.
/// </summary>
public static class GameProviders
{
    /// <summary>
    /// Every registered provider, real games before the dev simulation so a consumer that
    /// wants "a real game" can take the first one and never start on synthetic data.
    /// </summary>
    public static IReadOnlyList<IGameProvider> All { get; } =
    [
        new LeMansUltimateGameProvider(),
        new DemoGameProvider()
    ];

    /// <summary>
    /// The game the app starts on: the first real game, never the dev simulation, so startup
    /// never paints synthetic live data as if a sim were connected. Demo telemetry stays
    /// reachable only through explicit test/dev wiring.
    /// </summary>
    public static IGameProvider Default { get; } =
        All.First(provider => provider is not DemoGameProvider);

    /// <summary>
    /// The provider for a game id, or null when no game with that id is registered. Ids
    /// arrive from persisted settings and saved plans, so casing is not trusted.
    /// </summary>
    public static IGameProvider? Find(string gameId)
    {
        return All.FirstOrDefault(provider =>
            provider.Descriptor.Id.Equals(gameId, StringComparison.OrdinalIgnoreCase));
    }
}
