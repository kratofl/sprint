using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Keeps the remembered game/car/track a new plan is prefilled from. Separated from the
/// shell so the rule — which frames are allowed to change what — is a unit test rather
/// than something only observable by driving the whole window.
/// </summary>
public static class PlanContextCapture
{
    /// <summary>
    /// Folds a live session into <paramref name="remembered"/> and reports whether anything
    /// changed (the caller persists only on a change).
    /// <para>
    /// Every field is only overwritten by a non-empty value, and nothing here consults
    /// <see cref="SessionInfo.InCar"/>: the lobby is exactly when a plan gets created, and a
    /// pre-cockpit frame that reports a track but no car must not erase a known car.
    /// </para>
    /// </summary>
    public static bool Remember(LastSeenContext remembered, SessionInfo session)
    {
        ArgumentNullException.ThrowIfNull(remembered);
        ArgumentNullException.ThrowIfNull(session);

        bool changed = false;
        changed |= Adopt(session.Game, remembered.Game, value => remembered.Game = value);
        // The car's name, not the game's entry name: a plan is matched to history by that name.
        changed |= Adopt(CarNames.Of(session), remembered.Car, value => remembered.Car = value);
        changed |= Adopt(session.Track, remembered.Track, value => remembered.Track = value);
        return changed;
    }

    private static bool Adopt(string reported, string current, Action<string> assign)
    {
        if (string.IsNullOrWhiteSpace(reported) || reported == current)
        {
            return false;
        }

        assign(reported);
        return true;
    }
}
