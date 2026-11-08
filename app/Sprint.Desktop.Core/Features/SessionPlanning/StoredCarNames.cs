using Sprint.Desktop.Api.Games;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Brings history filed before <see cref="CarNames"/> under it. Sessions back then stored
/// LMU's livery as the car (recorded laps, and friends' laps from an older Sprint) or the
/// archive's bare model (imported laps); this renames them once and keeps both details in
/// <see cref="LapHistoryContext.CarType"/> and <see cref="LapHistoryContext.Livery"/>.
/// <para>
/// A one-time rewrite rather than a rename on every load: a livery is named through the
/// game's results archive, which takes parsing every result file, and a load-time rename would
/// pay that on every start (and in both <see cref="ILapHistoryStore"/> read paths). Once a
/// context states a model or a livery it is never looked at again, matched or not, so the
/// pass is idempotent and costs nothing after the first run.
/// </para>
/// </summary>
public sealed class StoredCarNames
{
    private readonly Lazy<IReadOnlyDictionary<string, ResultsCar>> _liveries;

    /// <param name="liveries">
    /// Every livery the game's results archive names. Asked at most once, and only when a
    /// stored livery needs naming.
    /// </param>
    public StoredCarNames(Func<IReadOnlyList<ResultsCar>> liveries)
    {
        ArgumentNullException.ThrowIfNull(liveries);
        this._liveries = new Lazy<IReadOnlyDictionary<string, ResultsCar>>(() => liveries()
            .GroupBy(car => car.Livery, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal));
    }

    /// <summary>Renames every stored session that predates the rule. Returns how many it rewrote.</summary>
    public int RenameAll(ILapHistoryStore store)
    {
        ArgumentNullException.ThrowIfNull(store);

        int renamed = 0;
        foreach (LapHistorySession session in store.LoadAll())
        {
            if (this.Rename(session.Context, session.Origin))
            {
                store.Save(session);
                renamed++;
            }
        }

        return renamed;
    }

    /// <summary>
    /// Names one context in place, when it predates the rule. Returns whether it changed. A car
    /// that cannot be named keeps its old name; it is still marked as looked at, so it is not
    /// looked up again on every start.
    /// </summary>
    public bool Rename(LapHistoryContext context, LapHistoryOrigin origin)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (context.CarType is not null || context.Livery is not null || string.IsNullOrWhiteSpace(context.CarModel))
        {
            return false;
        }

        string stored = context.CarModel;
        if (origin == LapHistoryOrigin.Imported)
        {
            // The archive's car model, which is what an imported session filed.
            context.CarType = stored;
            context.CarModel = CarNames.Name(context.CarClass, null, stored) ?? stored;
            return true;
        }

        // A class the rule does not know may be another game's, whose car name is not a livery
        // at all; leave it exactly as it was.
        if (CarNames.ClassOf(context.CarClass) is null)
        {
            return false;
        }

        ResultsCar? car = this._liveries.Value.GetValueOrDefault(stored);
        context.Livery = stored;
        context.CarType = car?.CarType;
        context.CarModel = CarNames.Name(context.CarClass, car?.Championship, car?.CarType) ?? stored;
        return true;
    }
}
