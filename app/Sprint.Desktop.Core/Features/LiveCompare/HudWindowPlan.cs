using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// One window in the Live Compare overlay set.
/// </summary>
/// <param name="Id">
/// Stable across builds and independent of position in the set — it is half of the layout
/// key, so a driver who reorders or removes a panel does not lose where the others sat.
/// </param>
/// <param name="Title">What this window is, for the taskbar and the accessibility name.</param>
/// <param name="Panel">The chart drawn in it, or null for the delta window.</param>
public sealed record HudWindowSpec(
    string Id,
    string Title,
    LapChartPanelSpec? Panel,
    int DefaultWidth,
    int DefaultHeight,
    int MinWidth,
    int MinHeight);

/// <summary>
/// Which overlay windows the Live Compare HUD opens, and how big each one starts.
/// <para>
/// The HUD was one window holding a stack of charts. It is now one small window per chart
/// (driver feedback 2026-08-07): the point of an overlay is that the driver puts each reading
/// where their eyes already are, and a single stack forces every panel to share one position,
/// one size and one aspect ratio. Splitting them costs a manager and a per-window layout key,
/// and buys placement that a stack cannot express at any size.
/// </para>
/// <para>Avalonia-free, so the composition rules are unit tests rather than a screenshot.</para>
/// </summary>
public static class HudWindowPlan
{
    /// <summary>The delta window's id. Not a panel id — no chart catalogue entry backs it.</summary>
    public const string DeltaWindowId = "delta";

    /// <summary>
    /// A chart window's first size. Wide and short: the x-axis is a rolling stretch of track,
    /// so width is resolution along the thing being read, while a pedal trace spends its height
    /// on a 0–100 range that needs far less of it.
    /// </summary>
    private const int ChartWidth = 380;
    private const int ChartHeight = 160;

    /// <summary>
    /// Below this a chart stops being drawn honestly — <c>ChartStackLayout</c> reports no room
    /// once padding, the title row and the axis band have taken the surface.
    /// </summary>
    private const int ChartMinWidth = 240;
    private const int ChartMinHeight = 118;

    /// <summary>The delta window holds two short lines of text and nothing else.</summary>
    private const int DeltaWidth = 240;
    private const int DeltaHeight = 92;
    private const int DeltaMinWidth = 170;
    private const int DeltaMinHeight = 72;

    /// <summary>
    /// The set to open, in the order it is stacked down the screen on a first run.
    /// <para>
    /// The delta comes first because it is the smallest and the most glanced at, so it belongs
    /// at the top of the column where it costs the least track view. The charts follow in the
    /// driver's configured order.
    /// </para>
    /// </summary>
    public static IReadOnlyList<HudWindowSpec> Build(LiveCompareSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var specs = new List<HudWindowSpec>();
        if (settings.ShowDelta)
        {
            specs.Add(new HudWindowSpec(
                DeltaWindowId,
                "Delta",
                Panel: null,
                DeltaWidth,
                DeltaHeight,
                DeltaMinWidth,
                DeltaMinHeight));
        }

        foreach (var panel in LapChartPanels.Resolve(settings.PanelIds, LapChartPanels.HudDefaults))
        {
            specs.Add(new HudWindowSpec(
                panel.Id,
                panel.Title,
                panel,
                ChartWidth,
                ChartHeight,
                ChartMinWidth,
                ChartMinHeight));
        }

        return specs;
    }

    /// <summary>The chart panels in <paramref name="specs"/>, in window order.</summary>
    public static IReadOnlyList<LapChartPanelSpec> Panels(IReadOnlyList<HudWindowSpec> specs)
    {
        ArgumentNullException.ThrowIfNull(specs);
        return [.. specs.Select(spec => spec.Panel).OfType<LapChartPanelSpec>()];
    }
}
