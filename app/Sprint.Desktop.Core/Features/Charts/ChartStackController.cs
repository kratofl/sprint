namespace Sprint.Desktop.Features.Charts;

/// <summary>What one series reports at the cursor's domain coordinate.</summary>
public sealed record ChartSeriesReadout(string Name, double? Value);

/// <summary>What one chart in the stack reports at the cursor's domain coordinate.</summary>
public sealed record ChartPanelReadout(string Title, IReadOnlyList<ChartSeriesReadout> Series);

/// <summary>Every chart's reading at one shared domain coordinate.</summary>
public sealed record ChartStackReadout(
    double Domain,
    string DomainText,
    IReadOnlyList<ChartPanelReadout> Charts);

/// <summary>
/// Cursor state for a chart stack, deliberately free of Avalonia and of pixels: a view
/// converts a pointer position into a domain coordinate and hands it over, which makes
/// "cursor at 0.62 → each series reports its value there" a plain unit test.
/// </summary>
public sealed class ChartStackController
{
    public ChartStackController(ChartStack stack)
    {
        ArgumentNullException.ThrowIfNull(stack);
        Stack = stack;
    }

    public ChartStack Stack { get; }

    /// <summary>The cursor's domain coordinate, or null while the pointer is away.</summary>
    public double? Cursor { get; private set; }

    /// <summary>Every chart's reading at <see cref="Cursor"/>, or null while the pointer is away.</summary>
    public ChartStackReadout? Readout =>
        Cursor is { } cursor ? Read(cursor) : null;

    /// <summary>
    /// Places the cursor at a domain coordinate, snapped to what the domain can actually
    /// resolve. Returns whether anything changed, so a view can skip a repaint.
    /// </summary>
    public bool MoveCursor(double domainValue)
    {
        var snapped = Stack.Domain.Snap(domainValue);
        if (Cursor is { } current && current.Equals(snapped))
        {
            return false;
        }

        Cursor = snapped;
        return true;
    }

    /// <summary>Takes the cursor away (the pointer left the stack). Returns whether anything changed.</summary>
    public bool ClearCursor()
    {
        if (Cursor is null)
        {
            return false;
        }

        Cursor = null;
        return true;
    }

    private ChartStackReadout Read(double domainValue) => new(
        domainValue,
        Stack.Domain.Format(domainValue),
        [.. Stack.Charts.Select(chart => new ChartPanelReadout(
            chart.Title,
            [.. chart.Series.Select(series => new ChartSeriesReadout(series.Name, ValueAt(series, domainValue)))]))]);

    private static double? ValueAt(ChartSeries series, double x)
    {
        var samples = series.Samples;

        // Outside the samples the series has nothing to report. Holding the nearest edge
        // value would state a measurement at a coordinate that was never observed, which is
        // the same reason a partial lap yields no reference curve at all.
        if (samples.Count == 0 || x < samples[0].X || x > samples[^1].X)
        {
            return null;
        }

        // The last sample at or before the cursor. Landing exactly on a sample must report
        // that sample, not the one before it — a stepped series would otherwise show the
        // previous lap's figure while the cursor sits on this one.
        var index = 0;
        for (var i = 1; i < samples.Count && samples[i].X <= x; i++)
        {
            index = i;
        }

        if (index == samples.Count - 1)
        {
            return samples[index].Y;
        }

        var (startX, startY) = samples[index];
        var (endX, endY) = samples[index + 1];
        var span = endX - startX;
        if (series.Interpolation == ChartInterpolation.Stepped || span <= 0)
        {
            return startY;
        }

        return startY + ((endY - startY) * ((x - startX) / span));
    }
}
