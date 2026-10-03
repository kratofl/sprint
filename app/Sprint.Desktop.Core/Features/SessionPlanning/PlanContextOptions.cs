namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The game/car/track values the creation sheet offers, drawn from what Sprint has actually
/// recorded plus whatever the sim is reporting right now.
/// <para>
/// This is not only convenience. The lap-history corpus is keyed on
/// <c>game + trackCourse + carModel</c>, so a typed "Spa Francorchamps" beside a recorded
/// "Spa-Francorchamps" becomes a second bucket that never joins the first, and every target
/// and fuel figure drawn from it silently uses a fraction of the laps. Offering the recorded
/// spelling is what removes that failure mode.
/// </para>
/// <para>
/// The fields stay editable regardless: planning for a car or track that has never been
/// driven is normal, and a closed list would make the common "new car this week" case
/// impossible.
/// </para>
/// </summary>
public sealed record PlanContextOptions(
    IReadOnlyList<string> Games,
    IReadOnlyList<string> Tracks,
    IReadOnlyList<string> Cars)
{
    public static PlanContextOptions Empty { get; } = new([], [], []);

    /// <summary>
    /// Reads the distinct contexts out of the corpus, adding the live context so the session
    /// the driver is sitting in is offered before it has produced a single recorded lap.
    /// </summary>
    public static PlanContextOptions From(ILapHistoryStore store, PlanContext live)
    {
        ArgumentNullException.ThrowIfNull(store);
        ArgumentNullException.ThrowIfNull(live);

        // Contexts only: the sheet needs distinct names, not every lap's reference curve.
        var contexts = store.LoadContexts()
            .Select(context => (context.Game, context.TrackCourse, context.CarModel))
            .Append((live.Game, live.Track, live.Car))
            .Where(context => context != (null, null, null))
            .ToList();

        return new PlanContextOptions(
            Distinct(contexts.Select(context => context.Item1)),
            Distinct(contexts.Select(context => context.Item2)),
            Distinct(contexts.Select(context => context.Item3)))
        {
            _contexts = contexts,
        };
    }

    private IReadOnlyList<(string Game, string Track, string Car)> _contexts { get; init; } = [];

    /// <summary>
    /// The same options narrowed to one game, so another sim's cars are not offered for a
    /// context they can never belong to. A game with no recorded laps yet narrows to nothing,
    /// so it falls back to everything rather than presenting an empty list as "no choices".
    /// </summary>
    public PlanContextOptions For(string game)
    {
        if (string.IsNullOrWhiteSpace(game))
        {
            return this;
        }

        var matching = _contexts
            .Where(context => string.Equals(context.Game, game, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return matching.Count == 0
            ? this
            : new PlanContextOptions(
                Games,
                Distinct(matching.Select(context => context.Track)),
                Distinct(matching.Select(context => context.Car)))
            {
                _contexts = _contexts,
            };
    }

    private static IReadOnlyList<string> Distinct(IEnumerable<string?> values) =>
        [.. values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)];
}
