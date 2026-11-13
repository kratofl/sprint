using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What Sprint's lap history says about racing a plan's car at its track (#50): the figures a
/// race fuel estimate leans on, and what tells Quick mode it need not ask for them. Asked often
/// and from several threads, so an implementation answers a repeat ask cheaply.
/// </summary>
public interface IFuelHistorySource
{
    /// <summary>
    /// The race figures for <paramref name="context"/>; <see cref="FuelHistoryFigures.None"/> without
    /// history. May read the whole corpus and wait on the store, so never from the telemetry loop.
    /// </summary>
    FuelHistoryFigures ForRace(PlanContext context);

    /// <summary>
    /// What the last <see cref="ForRace"/> for <paramref name="context"/> worked out, or null when
    /// none has yet. Never reads the corpus or waits on the store: this is the telemetry loop's read.
    /// The figures may be one corpus write behind until the next <see cref="ForRace"/>.
    /// </summary>
    FuelHistoryFigures? Cached(PlanContext context);
}

/// <summary>No history for any context, so every estimate rests on the plan's own values.</summary>
public sealed class NoFuelHistorySource : IFuelHistorySource
{
    public static NoFuelHistorySource Instance { get; } = new();

    public FuelHistoryFigures ForRace(PlanContext context) => FuelHistoryFigures.None;

    public FuelHistoryFigures? Cached(PlanContext context) => FuelHistoryFigures.None;
}

/// <summary>
/// The shipped source: the lap-history corpus, narrowed by the driver's
/// <see cref="SessionPlannerSettings.FuelHistorySource"/> — every valid lap of the context, or
/// only its race laps. The setting is read on each call, so a change applies at once.
/// <para>
/// Asked on every state poll for every plan and about once a second by the live link's worker,
/// so the figures are kept per context and narrowing until the corpus changes. "Changes" means
/// <see cref="ILapHistoryStore.LoadAll"/> hands back a different list: over the host's
/// <see cref="CachingLapHistoryStore"/> that is exactly a write or an import, and a repeat ask
/// costs a dictionary lookup. Over an uncached store every ask is a new list, so nothing goes stale.
/// Safe from any thread: the cache is only touched under its lock, and the figures are worked out
/// outside it from the one list they are filed against.
/// </para>
/// <para>
/// A write does not drop what was worked out before it: <see cref="Cached"/> keeps answering
/// those figures, without reading, until the next <see cref="ForRace"/> for the context replaces
/// them. The state poll asks that for every plan, so the active plan's figures stay warm.
/// </para>
/// </summary>
public sealed class LapHistoryFuelSource : IFuelHistorySource
{
    private readonly ILapHistoryStore _store;
    private readonly Func<FuelHistorySource> _setting;
    private readonly Lock _gate = new();

    // The figures last worked out per context and narrowing, with the corpus generation they came
    // from: a repeat ask is answered only from the current one, Cached from any.
    private readonly Dictionary<(PlanContext Context, HistorySessionKind? OnlyKind), (FuelHistoryFigures Figures, int Generation)> _figures = [];
    private IReadOnlyList<LapHistorySession>? _corpus;
    private int _generation;

    public LapHistoryFuelSource(ILapHistoryStore store, Func<FuelHistorySource> setting)
    {
        this._store = store ?? throw new ArgumentNullException(nameof(store));
        this._setting = setting ?? throw new ArgumentNullException(nameof(setting));
    }

    public FuelHistoryFigures ForRace(PlanContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        (PlanContext Context, HistorySessionKind? OnlyKind) key = this.KeyFor(context);
        IReadOnlyList<LapHistorySession> corpus = this._store.LoadAll();
        int generation;
        lock (this._gate)
        {
            if (!ReferenceEquals(corpus, this._corpus))
            {
                this._corpus = corpus;
                this._generation++;
            }
            else if (this._figures.TryGetValue(key, out (FuelHistoryFigures Figures, int Generation) filed) && filed.Generation == this._generation)
            {
                return filed.Figures;
            }

            generation = this._generation;
        }

        FuelHistoryFigures figures = FuelHistoryFigures.From(corpus, context, key.OnlyKind);
        lock (this._gate)
        {
            // Filed only against the list they came from: a write meanwhile has moved the cache on.
            if (generation == this._generation)
            {
                this._figures[key] = (figures, generation);
            }
        }

        return figures;
    }

    public FuelHistoryFigures? Cached(PlanContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        (PlanContext Context, HistorySessionKind? OnlyKind) key = this.KeyFor(context);
        lock (this._gate)
        {
            return this._figures.TryGetValue(key, out (FuelHistoryFigures Figures, int Generation) filed) ? filed.Figures : null;
        }
    }

    // The setting is read on each ask, so a change applies at once.
    private (PlanContext Context, HistorySessionKind? OnlyKind) KeyFor(PlanContext context) =>
        (context, this._setting() == FuelHistorySource.MatchingSessionType ? HistorySessionKind.Race : null);
}
