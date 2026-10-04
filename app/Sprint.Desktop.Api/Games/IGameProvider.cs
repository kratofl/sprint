using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Api.Games;

/// <summary>
/// Everything Sprint can do with one game, declared by the game itself. Adding a game is
/// one class implementing whatever that game can actually do.
/// </summary>
/// <remarks>
/// <para><b>Null means "this game cannot".</b> Every capability beyond telemetry is optional
/// and null when the game has no such source at all. Discovery is therefore a null check,
/// and a surface gated on a capability hides itself — no import entry point for a game with
/// no results archive. That is what keeps the shared layer from assuming every game can do
/// everything.</para>
///
/// <para><b>Sprint records only.</b> Capabilities return the records in this namespace,
/// never game-native structures: parsed XML, setup files and service payloads stay behind
/// the provider, so planner and UI code speaks one vocabulary whatever the game is.</para>
/// </remarks>
public interface IGameProvider
{
    /// <summary>Identity and availability of the game this provider speaks for.</summary>
    GameDescriptor Descriptor { get; }

    /// <summary>
    /// Create a live telemetry adapter for the game. The caller owns and disposes the
    /// returned source, and each call hands out a fresh instance rather than sharing one,
    /// so a reconnect or a second consumer never inherits another reader's state.
    /// </summary>
    ITelemetrySource CreateTelemetrySource();

    /// <summary>
    /// Reads the sessions the game already archived, or null when the game archives nothing
    /// Sprint can read.
    /// </summary>
    IResultsImporter? Results { get; }

    /// <summary>
    /// Reads the setups the game stores, or null when the game exposes none.
    /// </summary>
    ISetupRepository? Setups { get; }

    /// <summary>
    /// Reads the game's scheduled events, or null when the game publishes no schedule Sprint
    /// can reach.
    /// </summary>
    IScheduleSource? Schedule { get; }
}
