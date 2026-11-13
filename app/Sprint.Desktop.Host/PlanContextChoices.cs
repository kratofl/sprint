using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Host;

/// <summary>The tracks and cars recorded for one game.</summary>
public sealed record PlanGameChoices(string Game, IReadOnlyList<string> Tracks, IReadOnlyList<string> Cars);

/// <summary>
/// What the plan dialogs start from and offers (<c>GET /api/planner/context</c>): the
/// prefilled game/car/track and the recorded spellings to pick from, so a plan keys onto the
/// lap-history bucket the corpus already holds (see <see cref="PlanContextOptions"/>).
/// <para>
/// <see cref="PlanContextOptions.For"/> is evaluated here for every recorded game rather than
/// re-implemented in the renderer, which then only has to pick the entry for the typed game and
/// fall back to the unnarrowed lists when there is none — the same fallback <c>For</c> applies.
/// </para>
/// <para>
/// <see cref="Detection"/> is what Quick plan shows read-only and what it still has to ask for
/// (<see cref="SessionPlannerController.Detect"/>), taken when the dialog opens.
/// </para>
/// </summary>
public sealed record PlanContextChoices(
    PlanContext Prefill,
    IReadOnlyList<string> Games,
    IReadOnlyList<string> Tracks,
    IReadOnlyList<string> Cars,
    IReadOnlyList<PlanGameChoices> ByGame,
    PlanDetection Detection)
{
    public static PlanContextChoices From(PlanContext prefill, PlanContextOptions options, PlanDetection detection)
    {
        ArgumentNullException.ThrowIfNull(prefill);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(detection);

        return new PlanContextChoices(
            prefill,
            options.Games,
            options.Tracks,
            options.Cars,
            [.. options.Games.Select(game =>
            {
                PlanContextOptions narrowed = options.For(game);
                return new PlanGameChoices(game, narrowed.Tracks, narrowed.Cars);
            })],
            detection);
    }
}
