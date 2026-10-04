using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// One channel of a lap trace as a chart wants it: what to call it, and how to turn the
/// stored value into the number a driver reads.
/// </summary>
/// <param name="Id">The stored channel name, from <see cref="LapTraceChannels"/>.</param>
/// <param name="DisplayName">The series name in the readout.</param>
/// <param name="Scale">
/// Multiplier from stored units to displayed units. Pedals and steering are stored 0–1 and
/// −1–1 because that is what the game reports; a driver reads them as percentages.
/// </param>
public sealed record LapChartChannel(
    string Id,
    string DisplayName,
    double Scale = 1.0,
    ChartInterpolation Interpolation = ChartInterpolation.Linear);

/// <summary>One chart in a lap comparison: a title, a unit, and the channels drawn in it.</summary>
/// <param name="FillFirst">
/// Whether the first channel is drawn as a filled area. This is how a two-channel panel stays
/// readable without spending colour on it: series colour must keep meaning <em>whose lap it
/// is</em> — ember for you, blue for the target (spec §2.3) — so throttle and brake are told
/// apart by shape instead.
/// </param>
public sealed record LapChartPanelSpec(
    string Id,
    string Title,
    string? Unit,
    IReadOnlyList<LapChartChannel> Channels,
    bool FillFirst = false);

/// <summary>
/// The panels a lap trace can be drawn as. A catalogue rather than a fixed stack, because both
/// hosts let the driver choose: the HUD ships two panels and the Analysis view offers all of
/// them (spec §2.3, §5 leaves steering and gear deliberately open as defaults).
/// </summary>
public static class LapChartPanels
{
    public static LapChartPanelSpec Speed { get; } = new(
        "speed",
        "Speed",
        "km/h",
        [new LapChartChannel(LapTraceChannels.SpeedKph, "Speed")]);

    /// <summary>
    /// Throttle on its own.
    /// <para>
    /// No fill, unlike <see cref="Pedals"/>. In this panel the two series are the same channel
    /// on two different laps, so a fill would wash your lap and the target's over each other
    /// into one block and stop meaning magnitude. Two crisp lines, ember and blue, is the
    /// reading — which is the same rule spec §2.3 states from the other direction.
    /// </para>
    /// </summary>
    public static LapChartPanelSpec Throttle { get; } = new(
        "throttle",
        "Throttle",
        "%",
        [new LapChartChannel(LapTraceChannels.Throttle, "Throttle", 100)]);

    /// <summary>Brake on its own. Unfilled for the same reason as <see cref="Throttle"/>.</summary>
    public static LapChartPanelSpec Brake { get; } = new(
        "brake",
        "Brake",
        "%",
        [new LapChartChannel(LapTraceChannels.Brake, "Brake", 100)]);

    /// <summary>
    /// Brake is listed first, so <see cref="LapChartPanelSpec.FillFirst"/> fills the braking
    /// trace. The braking shape is the thing a driver is trying to match against a reference;
    /// throttle stays a crisp line on top of it.
    /// </summary>
    public static LapChartPanelSpec Pedals { get; } = new(
        "pedals",
        "Throttle & brake",
        "%",
        [
            new LapChartChannel(LapTraceChannels.Brake, "Brake", 100),
            new LapChartChannel(LapTraceChannels.Throttle, "Throttle", 100),
        ],
        FillFirst: true);

    public static LapChartPanelSpec Steering { get; } = new(
        "steering",
        "Steering",
        "%",
        [new LapChartChannel(LapTraceChannels.Steering, "Steering", 100)]);

    /// <summary>
    /// Stepped: a gear is a discrete selection, and a straight line between third and fourth
    /// would draw ratios the car does not have.
    /// </summary>
    public static LapChartPanelSpec Gear { get; } = new(
        "gear",
        "Gear",
        null,
        [new LapChartChannel(LapTraceChannels.Gear, "Gear", 1, ChartInterpolation.Stepped)]);

    public static IReadOnlyList<LapChartPanelSpec> All { get; } =
        [Speed, Throttle, Brake, Pedals, Steering, Gear];

    /// <summary>
    /// What the HUD shows until the driver says otherwise: throttle, brake, speed — one panel
    /// each, because the HUD now gives every panel its own window (see
    /// <c>Features/LiveCompare/HudWindowPlan.cs</c>).
    /// <para>
    /// Throttle and brake are split rather than combined here: in separate windows the driver
    /// places each pedal trace where they want it, which is the whole reason for the split, and
    /// the combined <see cref="Pedals"/> panel earns its shared axis only where the two are
    /// stacked in one frame — the Analysis view. Driver feedback 2026-08-07.
    /// </para>
    /// </summary>
    public static IReadOnlyList<LapChartPanelSpec> HudDefaults { get; } = [Throttle, Brake, Speed];

    /// <summary>What the Analysis view opens with. Wider: there is room, and no corner to take.</summary>
    public static IReadOnlyList<LapChartPanelSpec> AnalysisDefaults { get; } = [Speed, Pedals, Steering];

    public static LapChartPanelSpec? ById(string? id) =>
        All.FirstOrDefault(panel => string.Equals(panel.Id, id, StringComparison.Ordinal));

    /// <summary>
    /// The panels named by <paramref name="ids"/>, falling back to <paramref name="fallback"/>
    /// when the setting names nothing this build knows. A stored panel set from a later version
    /// must not leave the driver with an empty HUD.
    /// </summary>
    public static IReadOnlyList<LapChartPanelSpec> Resolve(
        IEnumerable<string>? ids,
        IReadOnlyList<LapChartPanelSpec> fallback)
    {
        var resolved = (ids ?? []).Select(ById).OfType<LapChartPanelSpec>().ToList();
        return resolved.Count > 0 ? resolved : fallback;
    }
}
