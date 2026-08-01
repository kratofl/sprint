using System.Globalization;
using SkiaSharp;
using Sprint.Desktop.Features.Dashes;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// Draws a <see cref="ChartStack"/> with SkiaSharp: several charts stacked over one shared
/// X axis, with a single crosshair and a per-chart readout at the cursor.
/// <para>
/// Follows the dash painter's approach rather than inventing a second one — an owned
/// bitmap, one reused paint and font, no Avalonia — so the same render can also serve a
/// thumbnail or an export later. All colour comes from <see cref="ChartPalette"/>, i.e.
/// from the Graphite tokens.
/// </para>
/// <para>Not thread-safe: one painter belongs to one caller, and the returned bitmap must
/// be consumed before the next <see cref="Render"/>.</para>
/// </summary>
public sealed class ChartStackPainter : IDisposable
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    // Fixed marks (dataviz): 2px line, >=8px marker, hairline solid grid, a 2px surface
    // ring so a marker stays legible where it crosses its own line.
    private const float SeriesStroke = 2f;
    private const float HairLine = 1f;
    private const float MarkerRadius = 4f;
    private const float MarkerRing = 2f;

    private const float TitleSize = 11.5f;
    private const float LegendSize = 10f;
    private const float TickSize = 9.5f;
    private const float ReadoutValueSize = 11.5f;
    private const float ReadoutNameSize = 10f;
    private const float NoticeTitleSize = 12.5f;
    private const float NoticeDetailSize = 11f;

    private const int AxisTicks = 5;

    // Within this much of a plot edge a tick label is aligned inward instead of centred.
    private const float EdgeTickInset = 24f;

    private readonly SKBitmap _bitmap;
    private readonly SKCanvas _canvas;
    private readonly SKPaint _paint = new() { IsAntialias = true };
    private readonly SKFont _font = new(DashFonts.Label, TitleSize);
    private bool _disposed;

    public ChartStackPainter(int width, int height)
    {
        if (width <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(width));
        }

        if (height <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(height));
        }

        Width = width;
        Height = height;
        _bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul));
        _canvas = new SKCanvas(_bitmap);
    }

    public int Width { get; }

    public int Height { get; }

    /// <summary>Renders the controller's stack and cursor, returning the (reused) bitmap.</summary>
    public SKBitmap Render(ChartStackController controller)
    {
        ArgumentNullException.ThrowIfNull(controller);
        ObjectDisposedException.ThrowIf(_disposed, this);

        var stack = controller.Stack;
        var layout = new ChartStackLayout(stack, Width, Height);
        _canvas.Clear(ChartPalette.Surface);

        if (stack.Charts.Count == 0 || stack.IsEmpty)
        {
            DrawNotice("No data", "This stack has no recorded samples yet.");
            _canvas.Flush();
            return _bitmap;
        }

        if (!layout.HasRoom)
        {
            DrawNotice("Not enough room", "Give the stack more height to plot these charts.");
            _canvas.Flush();
            return _bitmap;
        }

        for (var i = 0; i < stack.Charts.Count; i++)
        {
            DrawChart(stack.Charts[i], layout, i);
        }

        DrawAxis(layout);

        if (controller.Readout is { } readout)
        {
            DrawCursor(layout, readout);
        }

        _canvas.Flush();
        return _bitmap;
    }

    /// <summary>Renders and encodes to PNG bytes (artifacts, exports).</summary>
    public byte[] RenderPng(ChartStackController controller)
    {
        Render(controller);
        using var image = SKImage.FromBitmap(_bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    /// <summary>The rendered pixels in BGRA8888 premultiplied order (for an Avalonia bridge).</summary>
    public ReadOnlySpan<byte> PixelSpanBgra => _bitmap.GetPixelSpan();

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _canvas.Dispose();
        _bitmap.Dispose();
        _paint.Dispose();
        _font.Dispose();
    }

    // ---- Charts ----

    private void DrawChart(ChartPanel panel, ChartStackLayout layout, int index)
    {
        var header = layout.Header(index);
        var plot = layout.Plot(index);

        var title = panel.Unit is { Length: > 0 } unit ? $"{panel.Title} ({unit})" : panel.Title;
        DrawText(title, header.Left, header.MidY, TitleSize, DashFonts.LabelBold, ChartPalette.TextSecondary);

        if (panel.State != ChartPanelState.Ready)
        {
            // Stated, not implied: an axis pair drawn around nothing reads as "zero", which
            // is a different claim from "this was never recorded".
            var (stateTitle, stateDetail) = panel.State == ChartPanelState.Empty
                ? ("No data", "Nothing recorded for this metric.")
                : ("Not enough data", "One sample cannot describe a trend.");
            DrawText(stateTitle, plot.MidX, plot.MidY - 7, NoticeDetailSize, DashFonts.LabelBold, ChartPalette.TextSecondary, SKTextAlign.Center);
            DrawText(stateDetail, plot.MidX, plot.MidY + 7, NoticeDetailSize, DashFonts.Label, ChartPalette.TextMuted, SKTextAlign.Center);
            return;
        }

        var scale = ValueScale(panel);
        DrawGrid(plot, scale);

        if (panel.Series.Count > 1)
        {
            DrawLegend(panel, header);
        }

        foreach (var series in panel.Series)
        {
            DrawSeries(series, layout, plot, scale);
        }
    }

    // One scale per chart. Two measures of different scale belong in two charts, never on
    // two y-axes of one plot.
    private static ChartScale ValueScale(ChartPanel panel)
    {
        var min = double.MaxValue;
        var max = double.MinValue;
        foreach (var series in panel.Series)
        {
            foreach (var (_, y) in series.Samples)
            {
                min = Math.Min(min, y);
                max = Math.Max(max, y);
            }
        }

        return min > max ? ChartScale.For(0, 1) : ChartScale.For(min, max);
    }

    private void DrawGrid(SKRect plot, ChartScale scale)
    {
        // Three hairlines and two labels: enough to read a level, quiet enough to stay behind
        // the data. Solid, never dashed.
        for (var i = 0; i <= 2; i++)
        {
            var y = plot.Bottom - (i * plot.Height / 2f);
            _canvas.DrawLine(plot.Left, y, plot.Right, y, Paint(ChartPalette.Grid, SKPaintStyle.Stroke, HairLine));
        }

        DrawText(scale.Format(scale.Max), plot.Left - 8, plot.Top + 4, TickSize, DashFonts.Label, ChartPalette.TextMuted, SKTextAlign.Right);
        DrawText(scale.Format(scale.Min), plot.Left - 8, plot.Bottom - 4, TickSize, DashFonts.Label, ChartPalette.TextMuted, SKTextAlign.Right);
    }

    private void DrawLegend(ChartPanel panel, SKRect header)
    {
        // Identity never rests on colour alone: with two or more series the legend is always
        // there, keyed with a short stroke of the series colour beside text-token text.
        var x = header.Right;
        for (var i = panel.Series.Count - 1; i >= 0; i--)
        {
            var series = panel.Series[i];
            _font.Typeface = DashFonts.Label;
            _font.Size = LegendSize;
            var width = _font.MeasureText(series.Name);
            DrawText(series.Name, x, header.MidY, LegendSize, DashFonts.Label, ChartPalette.TextSecondary, SKTextAlign.Right);
            var keyRight = x - width - 6;
            _canvas.DrawLine(
                keyRight - 12,
                header.MidY,
                keyRight,
                header.MidY,
                Paint(ChartPalette.Series(series.Role), SKPaintStyle.Stroke, SeriesStroke));
            x = keyRight - 12 - 14;
        }
    }

    private void DrawSeries(ChartSeries series, ChartStackLayout layout, SKRect plot, ChartScale scale)
    {
        var color = ChartPalette.Series(series.Role);
        if (series.Samples.Count == 1)
        {
            var (x, y) = series.Samples[0];
            DrawMarker(layout.PixelAt(x), ChartStackLayout.ValuePixel(plot, y, scale), color);
            return;
        }

        if (series.Samples.Count == 0)
        {
            return;
        }

        using var path = new SKPath();
        for (var i = 0; i < series.Samples.Count; i++)
        {
            var (sampleX, sampleY) = series.Samples[i];
            var x = layout.PixelAt(sampleX);
            var y = ChartStackLayout.ValuePixel(plot, sampleY, scale);
            if (i == 0)
            {
                path.MoveTo(x, y);
                continue;
            }

            if (series.Interpolation == ChartInterpolation.Stepped)
            {
                // A discrete figure held its value up to here; it did not slope towards it.
                path.LineTo(x, path.LastPoint.Y);
            }

            path.LineTo(x, y);
        }

        if (series.FillArea)
        {
            using var area = new SKPath(path);
            area.LineTo(path.LastPoint.X, plot.Bottom);
            area.LineTo(layout.PixelAt(series.Samples[0].X), plot.Bottom);
            area.Close();
            _canvas.DrawPath(area, Paint(ChartPalette.Area(color)));
        }

        var stroke = Paint(color, SKPaintStyle.Stroke, SeriesStroke);
        stroke.StrokeJoin = SKStrokeJoin.Round;
        stroke.StrokeCap = SKStrokeCap.Round;
        _canvas.DrawPath(path, stroke);
    }

    // ---- Shared axis ----

    private void DrawAxis(ChartStackLayout layout)
    {
        var band = layout.AxisBand;
        var domain = layout.Stack.Domain;

        foreach (var value in domain.Ticks(AxisTicks))
        {
            var x = layout.PixelAt(value);

            // Alignment follows where the tick landed, not its position in the list: a
            // discrete axis can stop short of the right edge, and a label centred on the
            // frame would hang outside it.
            var align = (x - band.Left, band.Right - x) switch
            {
                ( < EdgeTickInset, _) => SKTextAlign.Left,
                (_, < EdgeTickInset) => SKTextAlign.Right,
                _ => SKTextAlign.Center,
            };
            DrawText(domain.Format(value), x, band.Top + 6, TickSize, DashFonts.Label, ChartPalette.TextMuted, align);
        }

        // The axis is named once for the whole stack, in the value gutter, because every chart
        // above it shares this coordinate. A name that will not fit is dropped rather than
        // clipped — half a word is worse than none, and the ticks carry the unit anyway.
        _font.Typeface = DashFonts.Label;
        _font.Size = TickSize;
        if (_font.MeasureText(domain.AxisLabel) <= band.Left - 8 - ChartStackLayout.OuterPadding)
        {
            DrawText(domain.AxisLabel, band.Left - 8, band.Top + 6, TickSize, DashFonts.Label, ChartPalette.TextMuted, SKTextAlign.Right);
        }
    }

    // ---- Cursor ----

    private void DrawCursor(ChartStackLayout layout, ChartStackReadout readout)
    {
        var x = layout.PixelAt(readout.Domain);
        var span = layout.CrosshairSpan;
        _canvas.DrawLine(x, span.Top, x, span.Bottom, Paint(ChartPalette.Cursor, SKPaintStyle.Stroke, HairLine));

        for (var i = 0; i < layout.Stack.Charts.Count; i++)
        {
            var panel = layout.Stack.Charts[i];
            if (panel.State != ChartPanelState.Ready)
            {
                continue;
            }

            var plot = layout.Plot(i);
            var scale = ValueScale(panel);

            // The readout carries more resolution than the axis: the axis states levels, the
            // cursor states the measurement the reader hovered for.
            var decimals = Decimals(scale.Span);
            var anchorY = plot.MidY;
            var rows = new List<(SKColor Key, string Value, string Name)>();
            for (var s = 0; s < panel.Series.Count; s++)
            {
                var series = panel.Series[s];
                var value = readout.Charts[i].Series[s].Value;
                var color = ChartPalette.Series(series.Role);
                if (value is { } present)
                {
                    var y = ChartStackLayout.ValuePixel(plot, present, scale);
                    DrawMarker(x, y, color);
                    if (rows.Count == 0)
                    {
                        anchorY = y;
                    }

                    rows.Add((color, Number(present, decimals), series.Name));
                    continue;
                }

                // An absent reading is stated, so the reader can tell "nothing here" from
                // "I did not hover precisely enough".
                rows.Add((color, "—", series.Name));
            }

            DrawReadout(layout, plot, x, anchorY, panel, rows);
        }

        DrawDomainCursorLabel(layout, x, readout.DomainText);
    }

    private void DrawMarker(float x, float y, SKColor color)
    {
        _canvas.DrawCircle(x, y, MarkerRadius + (MarkerRing / 2f), Paint(ChartPalette.Surface, SKPaintStyle.Stroke, MarkerRing));
        _canvas.DrawCircle(x, y, MarkerRadius, Paint(color));
    }

    private void DrawReadout(
        ChartStackLayout layout,
        SKRect plot,
        float cursorX,
        float anchorY,
        ChartPanel panel,
        List<(SKColor Key, string Value, string Name)> rows)
    {
        if (rows.Count == 0)
        {
            return;
        }

        const float padX = 7f;
        const float padY = 5f;
        const float rowHeight = 14f;
        const float keyWidth = 10f;
        const float keyGap = 6f;
        var showNames = panel.Series.Count > 1;

        var textWidth = 0f;
        foreach (var (_, value, name) in rows)
        {
            _font.Typeface = DashFonts.LabelBold;
            _font.Size = ReadoutValueSize;
            var width = _font.MeasureText(value);
            if (showNames)
            {
                _font.Typeface = DashFonts.Label;
                _font.Size = ReadoutNameSize;
                width += 6 + _font.MeasureText(name);
            }

            textWidth = Math.Max(textWidth, width);
        }

        var chipWidth = (padX * 2) + keyWidth + keyGap + textWidth;
        var chipHeight = (padY * 2) + (rows.Count * rowHeight);

        // Beside the crosshair, flipping to its other side rather than running off the plot.
        var left = cursorX + 10;
        if (left + chipWidth > layout.PlotRight)
        {
            left = cursorX - 10 - chipWidth;
        }

        var top = Math.Clamp(anchorY - (chipHeight / 2f), plot.Top, Math.Max(plot.Top, plot.Bottom - chipHeight));
        var chip = new SKRect(left, top, left + chipWidth, top + chipHeight);
        _canvas.DrawRoundRect(chip, Graphite.RadiusNested, Graphite.RadiusNested, Paint(ChartPalette.Readout));
        _canvas.DrawRoundRect(chip, Graphite.RadiusNested, Graphite.RadiusNested, Paint(ChartPalette.ReadoutBorder, SKPaintStyle.Stroke, HairLine));

        for (var i = 0; i < rows.Count; i++)
        {
            var (key, value, name) = rows[i];
            var rowY = chip.Top + padY + (rowHeight * i) + (rowHeight / 2f);
            _canvas.DrawLine(
                chip.Left + padX,
                rowY,
                chip.Left + padX + keyWidth,
                rowY,
                Paint(key, SKPaintStyle.Stroke, SeriesStroke));

            // The value leads and the series name follows: the reader already knows which
            // series they are on and came for the number.
            var textX = chip.Left + padX + keyWidth + keyGap;
            DrawText(value, textX, rowY, ReadoutValueSize, DashFonts.LabelBold, ChartPalette.Text);
            if (showNames)
            {
                _font.Typeface = DashFonts.LabelBold;
                _font.Size = ReadoutValueSize;
                var valueWidth = _font.MeasureText(value);
                DrawText(name, textX + valueWidth + 6, rowY, ReadoutNameSize, DashFonts.Label, ChartPalette.TextSecondary);
            }
        }
    }

    private void DrawDomainCursorLabel(ChartStackLayout layout, float cursorX, string text)
    {
        var band = layout.AxisBand;
        _font.Typeface = DashFonts.LabelBold;
        _font.Size = TickSize;
        var width = _font.MeasureText(text) + 12;
        var left = Math.Clamp(cursorX - (width / 2f), band.Left, Math.Max(band.Left, band.Right - width));
        var chip = new SKRect(left, band.Top + 1, left + width, band.Bottom - 1);

        // The cursor's own coordinate is separated from the tick chrome it covers, and wears
        // text colour rather than a series colour — it is chrome, not a measurement.
        _canvas.DrawRoundRect(chip, Graphite.RadiusNested, Graphite.RadiusNested, Paint(ChartPalette.Readout));
        DrawText(text, chip.MidX, chip.MidY, TickSize, DashFonts.LabelBold, ChartPalette.Text, SKTextAlign.Center);
    }

    private void DrawNotice(string title, string detail)
    {
        var cy = Height / 2f;
        DrawText(title, Width / 2f, cy - 9, NoticeTitleSize, DashFonts.LabelBold, ChartPalette.TextSecondary, SKTextAlign.Center);
        DrawText(detail, Width / 2f, cy + 9, NoticeDetailSize, DashFonts.Label, ChartPalette.TextMuted, SKTextAlign.Center);
    }

    // ---- Primitives ----

    private void DrawText(
        string text,
        float anchorX,
        float centerY,
        float size,
        SKTypeface typeface,
        SKColor color,
        SKTextAlign align = SKTextAlign.Left)
    {
        if (string.IsNullOrEmpty(text))
        {
            return;
        }

        _font.Typeface = typeface;
        _font.Size = size;
        var metrics = _font.Metrics;
        var baseline = centerY - ((metrics.Ascent + metrics.Descent) / 2f);
        _canvas.DrawText(text, anchorX, baseline, align, _font, Paint(color));
    }

    private SKPaint Paint(SKColor color, SKPaintStyle style = SKPaintStyle.Fill, float strokeWidth = 0)
    {
        _paint.Color = color;
        _paint.Style = style;
        _paint.StrokeWidth = strokeWidth;
        _paint.StrokeJoin = SKStrokeJoin.Miter;
        _paint.StrokeCap = SKStrokeCap.Butt;
        _paint.IsAntialias = true;
        return _paint;
    }

    // Axis and readout numbers stay at a resolution the range can actually support, so a
    // stable axis does not jitter through digits that carry no information.
    private static int Decimals(double span) => span switch
    {
        >= 20 => 0,
        >= 2 => 1,
        _ => 2,
    };

    private static string Number(double value, int decimals) =>
        value.ToString("F" + decimals.ToString(Inv), Inv);
}
