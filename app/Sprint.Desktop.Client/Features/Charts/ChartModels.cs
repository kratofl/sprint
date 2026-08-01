namespace Sprint.Desktop.Features.Charts;

// The chart stack (#187). One stack renders several charts over ONE shared X-domain, so a
// single cursor reads every metric at the same coordinate. Which metrics belong in which
// stack, and where a stack is hosted, is deliberately not decided here — this file only
// describes the shape a caller fills in.

/// <summary>One sample of a series: a domain coordinate and the value measured there.</summary>
public readonly record struct ChartSample(double X, double Y);

/// <summary>
/// How a series behaves between two samples. Chosen from what the data <em>is</em>, never
/// from visual taste (ADR 0024): a continuously measured channel really did pass through
/// the values in between, a per-lap or per-state figure did not.
/// </summary>
public enum ChartInterpolation
{
    /// <summary>Continuous telemetry: straight line between samples.</summary>
    Linear,

    /// <summary>A discrete figure: holds the last sample's value until the next one.</summary>
    Stepped,
}

/// <summary>
/// What a series is in the chart's story, which is what picks its colour: ember for the
/// current or selected series, blue for an explicit comparison (ADR 0024).
/// </summary>
public enum ChartSeriesRole
{
    Current,
    Comparison,
}

/// <summary>
/// One metric plotted over the stack's domain. <see cref="Samples"/> must ascend in
/// <see cref="ChartSample.X"/>; the lookup walks them in order.
/// </summary>
public sealed record ChartSeries(string Name, IReadOnlyList<ChartSample> Samples)
{
    public ChartInterpolation Interpolation { get; init; } = ChartInterpolation.Linear;

    public ChartSeriesRole Role { get; init; } = ChartSeriesRole.Current;

    /// <summary>
    /// Whether to wash the area under the line in the series colour. Opt-in, because the
    /// fill only earns its ink where magnitude is the reading (ADR 0024) — it never replaces
    /// the crisp solid stroke.
    /// </summary>
    public bool FillArea { get; init; }
}

/// <summary>Whether a chart has enough to draw, and what to say when it does not.</summary>
public enum ChartPanelState
{
    /// <summary>At least one series can be drawn as a line.</summary>
    Ready,

    /// <summary>Samples exist, but no series has the two a line needs.</summary>
    InsufficientData,

    /// <summary>Nothing was recorded for this metric.</summary>
    Empty,
}

/// <summary>One chart in the stack: a titled plot of one or more series.</summary>
public sealed record ChartPanel(string Title, IReadOnlyList<ChartSeries> Series)
{
    /// <summary>The unit shown beside a value in the readout ("km/h", "L"). Null when the value is unitless.</summary>
    public string? Unit { get; init; }

    /// <summary>
    /// What this chart can honestly show. A caller renders the two thin states as a stated
    /// message; an axis pair drawn around nothing reads as "zero", which is a different
    /// claim from "nothing was recorded".
    /// </summary>
    public ChartPanelState State
    {
        get
        {
            if (Series.All(series => series.Samples.Count == 0))
            {
                return ChartPanelState.Empty;
            }

            return Series.Any(series => series.Samples.Count > 1)
                ? ChartPanelState.Ready
                : ChartPanelState.InsufficientData;
        }
    }
}

/// <summary>
/// A vertical stack of charts sharing <see cref="Domain"/>. One stack, one domain: the
/// shared crosshair only means anything while every chart maps the same X to the same
/// place in the world.
/// </summary>
public sealed record ChartStack(ChartDomain Domain, IReadOnlyList<ChartPanel> Charts)
{
    /// <summary>
    /// True when no chart in the stack has anything to show, so a host can state that once
    /// for the whole stack rather than repeat it down every chart.
    /// </summary>
    public bool IsEmpty => Charts.Count == 0 || Charts.All(chart => chart.State == ChartPanelState.Empty);
}
