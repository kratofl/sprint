using SkiaSharp;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// Where a chart stack's pieces sit inside a surface of a given size, and the one pixel ↔
/// domain mapping every chart in the stack shares.
/// <para>
/// Separate from both the controller and the painter because two callers need the same
/// answer: the painter draws the crosshair at <see cref="PixelAt"/>, and a view turns a
/// pointer position into the domain coordinate it hands to the controller. If either
/// computed its own mapping the crosshair would drift from the values beside it.
/// </para>
/// <para>Free of Avalonia — SkiaSharp rectangles only.</para>
/// </summary>
public sealed class ChartStackLayout
{
    /// <summary>The breathing room between the stack and its host's card edge.</summary>
    public const float OuterPadding = 16f;

    // A single left gutter carries every chart's value labels, so the plots line up.
    private const float Padding = OuterPadding;
    private const float ValueGutter = 46f;
    // Enough room that a title and a legend key clear the plot's top grid line and value
    // label instead of crowding them.
    private const float HeaderHeight = 22f;
    private const float ChartGap = 14f;
    private const float AxisBandHeight = 18f;

    // The floor a plot is still worth drawing at. Below it the render falls back to the
    // stated "too small" case instead of stacking axis chrome on top of itself.
    private const float MinPlotHeight = 24f;

    private readonly float _chartHeight;
    private readonly float _plotHeight;

    public ChartStackLayout(ChartStack stack, float width, float height)
    {
        ArgumentNullException.ThrowIfNull(stack);
        Stack = stack;
        Width = width;
        Height = height;

        var count = Math.Max(1, stack.Charts.Count);
        var content = height - (Padding * 2) - AxisBandHeight - (ChartGap * (count - 1));
        _chartHeight = content / count;
        _plotHeight = _chartHeight - HeaderHeight;
        HasRoom = _plotHeight >= MinPlotHeight && PlotRight - PlotLeft > 0;
    }

    public ChartStack Stack { get; }

    public float Width { get; }

    public float Height { get; }

    /// <summary>False when the surface is too small to draw the stack honestly.</summary>
    public bool HasRoom { get; }

    public float PlotLeft => Padding + ValueGutter;

    public float PlotRight => Width - Padding;

    /// <summary>The title/legend row above chart <paramref name="index"/>'s plot.</summary>
    public SKRect Header(int index)
    {
        var top = Padding + (index * (_chartHeight + ChartGap));
        return new SKRect(Padding, top, PlotRight, top + HeaderHeight);
    }

    /// <summary>The plot area of chart <paramref name="index"/> — where its series is drawn.</summary>
    public SKRect Plot(int index)
    {
        var top = Padding + (index * (_chartHeight + ChartGap)) + HeaderHeight;
        return new SKRect(PlotLeft, top, PlotRight, top + _plotHeight);
    }

    /// <summary>The shared X axis, once, under the whole stack.</summary>
    public SKRect AxisBand
    {
        get
        {
            var top = Height - Padding - AxisBandHeight;
            return new SKRect(PlotLeft, top, PlotRight, top + AxisBandHeight);
        }
    }

    /// <summary>The vertical span the crosshair covers: the first plot down to the axis labels.</summary>
    public SKRect CrosshairSpan => new(PlotLeft, Plot(0).Top, PlotRight, AxisBand.Bottom);

    /// <summary>
    /// The domain coordinate under a pointer, clamped to the domain's ends. Clamping places
    /// the cursor; it never claims a value, because a series outside its own samples still
    /// reports nothing.
    /// </summary>
    public double DomainAt(float x)
    {
        var span = PlotRight - PlotLeft;
        if (span <= 0)
        {
            return Stack.Domain.Min;
        }

        var fraction = Math.Clamp((x - PlotLeft) / span, 0, 1);
        return Stack.Domain.Min + (fraction * Stack.Domain.Span);
    }

    /// <summary>Where a domain coordinate sits horizontally — the same mapping, inverted.</summary>
    public float PixelAt(double domainValue)
    {
        if (Stack.Domain.Span <= 0)
        {
            return PlotLeft;
        }

        var fraction = Math.Clamp((domainValue - Stack.Domain.Min) / Stack.Domain.Span, 0, 1);
        return PlotLeft + (float)(fraction * (PlotRight - PlotLeft));
    }

    /// <summary>Where a value sits vertically inside a plot, on that chart's scale.</summary>
    public static float ValuePixel(SKRect plot, double value, ChartScale scale)
    {
        ArgumentNullException.ThrowIfNull(scale);
        if (scale.Span <= 0)
        {
            return plot.MidY;
        }

        var fraction = Math.Clamp((value - scale.Min) / scale.Span, 0, 1);
        return plot.Bottom - (float)(fraction * plot.Height);
    }
}
