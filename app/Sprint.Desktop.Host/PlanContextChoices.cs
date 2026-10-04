using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Host;

/// <summary>The tracks and cars recorded for one game.</summary>
public sealed record PlanGameChoices(string Game, IReadOnlyList<string> Tracks, IReadOnlyList<string> Cars);

/// <summary>
/// What the New plan dialog starts from and offers (<c>GET /api/planner/context</c>): the
/// prefilled game/car/track and the recorded spellings to pick from, so a plan keys onto the
/// lap-history bucket the corpus already holds (see <see cref="PlanContextOptions"/>).
/// <para>
/// <see cref="PlanContextOptions.For"/> is evaluated here for every recorded game rather than
/// re-implemented in the renderer, which then only has to pick the entry for the typed game and
/// fall back to the unnarrowed lists when there is none — the same fallback <c>For</c> applies.
/// </para>
/// </summary>
public sealed record PlanContextChoices(
    PlanContext Prefill,
    IReadOnlyList<string> Games,
    IReadOnlyList<string> Tracks,
    IReadOnlyList<string> Cars,
    IReadOnlyList<PlanGameChoices> ByGame)
{
    public static PlanContextChoices From(PlanContext prefill, PlanContextOptions options)
    {
        ArgumentNullException.ThrowIfNull(prefill);
        ArgumentNullException.ThrowIfNull(options);

        return new PlanContextChoices(
            prefill,
            options.Games,
            options.Tracks,
            options.Cars,
            [.. options.Games.Select(game =>
            {
                PlanContextOptions narrowed = options.For(game);
                return new PlanGameChoices(game, narrowed.Tracks, narrowed.Cars);
            })]);
    }
}
