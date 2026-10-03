using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// Turns a recorded lap's <see cref="LapReferenceCurve"/> into a chart series on a
/// <see cref="ChartDomainKind.TrackPosition"/> domain — the first real data this chart
/// stack has to show.
/// <para>
/// The adapter lives on the chart side of the seam on purpose: the corpus stores how a lap
/// was driven and must not grow a dependency on how anything draws it, while the chart
/// types stay primitive (x/y doubles) so a later metric needs no new plumbing.
/// </para>
/// </summary>
public static class LapReferenceCurveSeries
{
    /// <summary>
    /// Elapsed lap time against track position. A curve with nothing usable in it yields an
    /// empty series rather than a placeholder point, which lets the chart state what is
    /// missing instead of plotting a lap nobody drove.
    /// </summary>
    public static ChartSeries Create(LapReferenceCurve curve, string name)
    {
        ArgumentNullException.ThrowIfNull(curve);

        if (curve.PositionStep <= 0 || curve.TimesSeconds.Count == 0)
        {
            return new ChartSeries(name, []);
        }

        // The corpus stores times only: the position of index i is i * PositionStep, by
        // construction (LapHistoryModels).
        var samples = new ChartSample[curve.TimesSeconds.Count];
        for (var i = 0; i < samples.Length; i++)
        {
            samples[i] = new ChartSample(i * curve.PositionStep, curve.TimesSeconds[i]);
        }

        return new ChartSeries(name, samples);
    }
}
