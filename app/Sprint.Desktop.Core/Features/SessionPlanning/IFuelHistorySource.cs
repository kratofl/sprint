using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What Sprint's lap history says about racing a plan's car at its track (#50): the figures a
/// race fuel estimate leans on, and what tells Quick mode it need not ask for them.
/// </summary>
public interface IFuelHistorySource
{
    /// <summary>The race figures for <paramref name="context"/>; <see cref="FuelHistoryFigures.None"/> without history.</summary>
    FuelHistoryFigures ForRace(PlanContext context);
}

/// <summary>No history for any context, so every estimate rests on the plan's own values.</summary>
public sealed class NoFuelHistorySource : IFuelHistorySource
{
    public static NoFuelHistorySource Instance { get; } = new();

    public FuelHistoryFigures ForRace(PlanContext context) => FuelHistoryFigures.None;
}

/// <summary>
/// The shipped source: the lap-history corpus, narrowed by the driver's
/// <see cref="SessionPlannerSettings.FuelHistorySource"/> — every valid lap of the context, or
/// only its race laps. The setting is read on each call, so a change applies at once.
/// </summary>
public sealed class LapHistoryFuelSource : IFuelHistorySource
{
    private readonly ILapHistoryStore _store;
    private readonly Func<FuelHistorySource> _setting;

    public LapHistoryFuelSource(ILapHistoryStore store, Func<FuelHistorySource> setting)
    {
        this._store = store ?? throw new ArgumentNullException(nameof(store));
        this._setting = setting ?? throw new ArgumentNullException(nameof(setting));
    }

    public FuelHistoryFigures ForRace(PlanContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        HistorySessionKind? onlyKind = this._setting() == FuelHistorySource.MatchingSessionType
            ? HistorySessionKind.Race
            : null;
        return FuelHistoryFigures.From(this._store.LoadAll(), context, onlyKind);
    }
}
