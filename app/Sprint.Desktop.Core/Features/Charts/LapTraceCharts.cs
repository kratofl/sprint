using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// One lap to draw, and how much of it is real yet.
/// </summary>
/// <param name="Trace">The lap's channels.</param>
/// <param name="TrackLengthMeters">
/// What the trace's positions mean in metres. Taken from the caller rather than the trace, so
/// a trace recorded before the game reported a length can still be drawn against the length
/// known now.
/// </param>
/// <param name="Label">Whose lap this is, for the readout — "You", "Target", a lap number.</param>
/// <param name="UpTo">
/// The furthest domain coordinate this lap has actually reached, or null for a whole lap.
/// <para>
/// This is the asymmetry spec §3 accepts rather than hides: your own line stops at the car,
/// because you cannot draw a future you have not driven, while the target extends ahead into
/// the window. Omitting the samples is the honest rendering — holding the last value would
/// draw a flat line into the corner you are about to take.
/// </para>
/// </param>
public readonly record struct LapTraceSeriesSource(
    LapChannelTrace Trace,
    double TrackLengthMeters,
    string Label,
    ChartSeriesRole Role,
    double? UpTo = null);

/// <summary>
/// Turns lap traces into a <see cref="ChartStack"/>. The one place that decides how a stored
/// lap becomes chart series, shared by the Live Compare HUD and the Analysis view so the two
/// cannot drift into drawing the same lap differently.
/// </summary>
public static class LapTraceCharts
{
    /// <summary>Points sampled across the domain. ~2 m over a Live Compare window.</summary>
    public const int DefaultSampleCount = 400;

    /// <summary>Points across a whole lap in the Analysis view, where the span is the track.</summary>
    public const int LapSampleCount = 1000;

    /// <summary>
    /// Builds the stack. Sources are drawn in order, so the caller's first source is the one a
    /// reader sees on top; role decides colour (ember for <see cref="ChartSeriesRole.Current"/>,
    /// blue for <see cref="ChartSeriesRole.Comparison"/>) and never which lap it is.
    /// </summary>
    public static ChartStack Build(
        IReadOnlyList<LapChartPanelSpec> panels,
        ChartDomain domain,
        IReadOnlyList<LapTraceSeriesSource> sources,
        int? sampleCount = null)
    {
        ArgumentNullException.ThrowIfNull(panels);
        ArgumentNullException.ThrowIfNull(domain);
        ArgumentNullException.ThrowIfNull(sources);

        var samples = sampleCount ?? (domain.Kind == ChartDomainKind.TrackDistance
            ? DefaultSampleCount
            : LapSampleCount);

        // Only name the lap in a series when there is more than one to tell apart. With a
        // single lap on screen "Speed · You" is noise; with two it is the whole point.
        var named = sources.Count > 1;

        return new ChartStack(
            domain,
            [.. panels.Select(panel => BuildPanel(panel, domain, sources, samples, named))]);
    }

    private static ChartPanel BuildPanel(
        LapChartPanelSpec panel,
        ChartDomain domain,
        IReadOnlyList<LapTraceSeriesSource> sources,
        int sampleCount,
        bool named)
    {
        var series = new List<ChartSeries>();
        foreach (var source in sources)
        {
            for (var i = 0; i < panel.Channels.Count; i++)
            {
                var channel = panel.Channels[i];

                // A trace that never carried this channel contributes no series at all, so a
                // panel whose channel is missing everywhere reports Empty rather than drawing
                // a flat zero line — "not recorded" and "zero" are different claims.
                if (!source.Trace.TryGetChannel(channel.Id, out _))
                {
                    continue;
                }

                series.Add(new ChartSeries(
                    named ? $"{channel.DisplayName} · {source.Label}" : channel.DisplayName,
                    Sample(source, channel, domain, sampleCount))
                {
                    Role = source.Role,
                    Interpolation = channel.Interpolation,
                    FillArea = panel.FillFirst && i == 0,
                });
            }
        }

        return new ChartPanel(panel.Title, series) { Unit = panel.Unit };
    }

    private static IReadOnlyList<ChartSample> Sample(
        LapTraceSeriesSource source,
        LapChartChannel channel,
        ChartDomain domain,
        int sampleCount)
    {
        var samples = new List<ChartSample>(sampleCount);
        var step = domain.Span / Math.Max(1, sampleCount - 1);

        for (var i = 0; i < sampleCount; i++)
        {
            var x = domain.Min + (i * step);
            if (source.UpTo is { } limit && x > limit)
            {
                break;
            }

            if (PositionAt(x, domain, source.TrackLengthMeters) is not { } position)
            {
                continue;
            }

            if (source.Trace.ValueAt(channel.Id, position) is { } value)
            {
                samples.Add(new ChartSample(x, value * channel.Scale));
            }
        }

        return samples;
    }

    /// <summary>
    /// The lap position a domain coordinate refers to, or null when the coordinate is off the
    /// lap entirely.
    /// <para>
    /// On a distance domain this wraps: the Live Compare window runs past the start/finish
    /// line, and the metres ahead of the car there are the lap's opening metres. Wrapping the
    /// stored target is free — the whole lap is on disk. Wrapping the driver's own line is not
    /// possible, which is why <see cref="LapTraceSeriesSource.UpTo"/> exists instead.
    /// </para>
    /// </summary>
    private static double? PositionAt(double x, ChartDomain domain, double trackLengthMeters)
    {
        if (domain.Kind != ChartDomainKind.TrackDistance)
        {
            return x is >= 0 and <= 1 ? x : null;
        }

        if (trackLengthMeters <= 0)
        {
            return null;
        }

        var position = x / trackLengthMeters;
        position -= Math.Floor(position);
        return position;
    }
}
