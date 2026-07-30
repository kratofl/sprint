using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Runtime;
using SkiaSharp;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// SkiaSharp on-wheel dash renderer — the .NET port of the Go <c>gg</c> painter
/// (matrix 4.5, WS6). It renders a <see cref="DashLayout"/> page for a telemetry
/// frame into a pixel buffer with <b>no Avalonia/UI dependency</b>, so the same
/// output feeds the on-screen preview (<see cref="DashImageRenderer"/>), saved
/// thumbnails (<c>DesktopRuntime</c>), and — later — hardware screens (WS7).
///
/// <para>Scope: the fixed critical-widget set (US25/US29) is rendered by direct
/// per-type renderers rather than the Go runtime element-DSL (ColorExpr,
/// Condition, widget stacks, per-widget update-rate cache, theme manager). Those
/// richer/config-driven paths remain deferred WS6 rows.</para>
///
/// <para>Not thread-safe: one painter instance is owned by one caller/thread.
/// The reused bitmap must be consumed before the next <see cref="Render"/>.</para>
/// </summary>
public sealed class DashPainter : IDisposable
{
    private DashPalette _basePalette;
    private DashPalette _palette; // active palette for the widget being drawn (base, or a per-widget style override)
    private readonly SKBitmap _bitmap;
    private readonly SKCanvas _canvas;
    private bool _disposed;

    public int Width { get; }

    public int Height { get; }

    public DashPainter(int width, int height, DashPalette? palette = null)
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
        _basePalette = palette ?? DashPalette.Default;
        _palette = _basePalette;
        _bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul));
        _canvas = new SKCanvas(_bitmap);
    }

    /// <summary>Swaps the base palette so a live theme change reaches long-lived painters (takes effect on the next <see cref="Render"/>).</summary>
    public void SetPalette(DashPalette palette)
    {
        _basePalette = palette ?? DashPalette.Default;
        _palette = _basePalette;
    }

    /// <summary>
    /// Renders the requested page of <paramref name="layout"/> for
    /// <paramref name="frame"/> and returns the (reused) backing bitmap. When
    /// <paramref name="idle"/> is true the idle page is drawn; otherwise
    /// <paramref name="pageId"/> selects a page (first page when null).
    /// </summary>
    public SKBitmap Render(
        DashLayout layout,
        TelemetryFrame frame,
        AppSettings settings,
        string? pageId = null,
        bool idle = false,
        DashAlertBanner? banner = null)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(settings);
        ObjectDisposedException.ThrowIf(_disposed, this);

        _canvas.Clear(_palette.Background);

        var page = SelectPage(layout, pageId, idle);
        if (page is not null)
        {
            var cols = layout.GridCols > 0 ? layout.GridCols : 20;
            var rows = layout.GridRows > 0 ? layout.GridRows : 12;
            foreach (var widget in page.Widgets)
            {
                var rect = GridRect(cols, rows, widget);
                if (rect.Width < 1 || rect.Height < 1)
                {
                    continue;
                }

                DrawWidget(widget, rect, frame, settings);
            }

            foreach (var stack in page.WidgetStacks)
            {
                DrawWidgetStack(stack, cols, rows, frame, settings);
            }
        }

        if (banner is { } activeBanner)
        {
            DrawAlertOverlay(activeBanner);
        }

        DrawFlagOverlay(frame);
        _canvas.Flush();
        return _bitmap;
    }

    /// <summary>Renders and encodes to PNG bytes (thumbnails / file output).</summary>
    public byte[] RenderPng(
        DashLayout layout,
        TelemetryFrame frame,
        AppSettings settings,
        string? pageId = null,
        bool idle = false,
        DashAlertBanner? banner = null)
    {
        Render(layout, frame, settings, pageId, idle, banner);
        using var image = SKImage.FromBitmap(_bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    /// <summary>The rendered pixels in BGRA8888 premultiplied order (for the on-screen bridge / hardware conversion).</summary>
    public ReadOnlySpan<byte> PixelSpanBgra => _bitmap.GetPixelSpan();

    private static DashPage? SelectPage(DashLayout layout, string? pageId, bool idle)
    {
        if (idle)
        {
            return layout.IdlePage ?? layout.Pages.FirstOrDefault();
        }

        if (!string.IsNullOrWhiteSpace(pageId))
        {
            return layout.Pages.FirstOrDefault(p => string.Equals(p.Id, pageId, StringComparison.OrdinalIgnoreCase))
                ?? (string.Equals(layout.IdlePage?.Id, pageId, StringComparison.OrdinalIgnoreCase) ? layout.IdlePage : null)
                ?? layout.Pages.FirstOrDefault();
        }

        return layout.Pages.FirstOrDefault() ?? layout.IdlePage;
    }

    // ---- Grid → pixel mapping (per-edge rounding, matching the Go gridPixelRect) ----

    private SKRect GridRect(int cols, int rows, DashWidget widget)
    {
        var left = GridEdge(Width, cols, widget.Col);
        var right = GridEdge(Width, cols, widget.Col + widget.ColSpan);
        var top = GridEdge(Height, rows, widget.Row);
        var bottom = GridEdge(Height, rows, widget.Row + widget.RowSpan);
        (left, right) = Normalize(left, right, Width);
        (top, bottom) = Normalize(top, bottom, Height);
        return new SKRect(left, top, right, bottom);
    }

    private static int GridEdge(int total, int divisions, int edge)
    {
        if (total <= 0 || divisions <= 0)
        {
            return 0;
        }

        var pos = (int)Math.Round((double)edge * total / divisions, MidpointRounding.AwayFromZero);
        return Math.Clamp(pos, 0, total);
    }

    private static (int Start, int End) Normalize(int start, int end, int total)
    {
        if (total <= 0)
        {
            return (0, 0);
        }

        start = Math.Clamp(start, 0, total - 1);
        if (end <= start)
        {
            end = start + 1;
        }

        if (end > total)
        {
            end = total;
        }

        return (start, end);
    }

    // ---- Widget dispatch ----

    private void DrawWidget(DashWidget widget, SKRect rect, TelemetryFrame frame, AppSettings settings)
    {
        // Wheel telemetry is grouped into compact outlined instruments like a real
        // motorsport display. The outline never adds a fill: the canvas remains black.
        // Authors can explicitly suppress or add the frame per widget.
        if (widget.Style?.Border ?? UsesInstrumentFrame(widget.Type))
        {
            DrawPanel(rect);
        }

        rect = ContentRect(rect, widget.Type);

        // Apply per-widget colour overrides for the duration of this widget only,
        // then restore the base palette so styling never leaks to the next widget.
        _palette = StyledPalette(widget.Style);
        try
        {
            switch (widget.Type)
            {
                case "header": DrawHeader(rect, frame); break;
                case "rpm_bar": DrawRpmBar(rect, frame); break;
                case "gear_speed": DrawGearSpeed(widget, rect, frame); break;
                case "input_trace": DrawInputTrace(rect, frame); break;
                case "sector": DrawSector(rect, frame); break;
                case "lap_time": DrawLapTime(rect, frame); break;
                case "delta": DrawDelta(rect, frame); break;
                case "fuel": DrawFuel(rect, frame); break;
                case "tyre_temp": DrawTyreTemp(widget, rect, frame); break;
                case "flag": DrawFlag(rect, frame); break;
                case "tc": DrawTc(rect, frame); break;
                case "abs": DrawElectronicsValue(rect, "ABS", frame.Electronics.Abs, frame.Electronics.AbsMax); break;
                case "engine_map": DrawElectronicsValue(rect, "MAP", frame.Electronics.MotorMap, frame.Electronics.MotorMapMax); break;
                case "brake_bias": DrawSimpleValue(rect, "BRAKE BIAS", $"{frame.Car.BrakeBiasRear:0.0}%"); break;
                case "fuel_target": DrawSimpleValue(rect, "FUEL TARGET", $"{frame.Car.FuelPerLapLiters:0.00} L/lap"); break;
                case "position": DrawPosition(rect, frame); break;
                case "gaps": DrawGaps(rect, frame); break;
                case "predictive_lap": DrawSimpleValue(rect, "PREDICTED", DashFormat.Lap(frame.Lap.TargetLapTime)); break;
                case "tyre_pressure": DrawTyrePressure(rect, frame); break;
                case "virtual_energy" or "ers": DrawVirtualEnergy(widget, rect, frame); break;
                case "text": DrawText(widget, rect, frame, settings); break;
                default: DrawUnknown(widget, rect); break;
            }
        }
        finally
        {
            _palette = _basePalette;
        }
    }

    // The base palette with any per-widget text/label colour overrides applied.
    private DashPalette StyledPalette(DashWidgetStyle? style)
    {
        if (style is null || (string.IsNullOrEmpty(style.TextColor) && string.IsNullOrEmpty(style.LabelColor)))
        {
            return _basePalette;
        }

        // Text colour recolours the large values (Foreground); label colour recolours
        // the small caption text (Muted). Unset tokens inherit the base palette.
        return _basePalette with
        {
            Foreground = _basePalette.StyleColor(style.TextColor) ?? _basePalette.Foreground,
            Neutral = _basePalette.StyleColor(style.TextColor) ?? _basePalette.Neutral,
            Muted = _basePalette.StyleColor(style.LabelColor) ?? _basePalette.Muted,
        };
    }

    // Renders a widget stack's active (default) layer inside the stack's grid
    // rectangle: the layer's widgets are laid out in the stack's local sub-grid
    // (ColSpan×RowSpan cells) mapped into that rectangle.
    private void DrawWidgetStack(DashWidgetStack stack, int cols, int rows, TelemetryFrame frame, AppSettings settings)
    {
        var rect = GridRect(cols, rows, new DashWidget
        {
            Col = stack.Col,
            Row = stack.Row,
            ColSpan = Math.Max(1, stack.ColSpan),
            RowSpan = Math.Max(1, stack.RowSpan),
        });
        if (rect.Width < 1 || rect.Height < 1)
        {
            return;
        }

        var layer = SelectLayer(stack);
        if (layer is null)
        {
            return;
        }

        var subCols = Math.Max(1, stack.ColSpan);
        var subRows = Math.Max(1, stack.RowSpan);
        foreach (var widget in layer.Widgets)
        {
            var wr = SubRect(rect, subCols, subRows, widget);
            if (wr.Width >= 1 && wr.Height >= 1)
            {
                DrawWidget(widget, wr, frame, settings);
            }
        }
    }

    private static DashWidgetStackLayer? SelectLayer(DashWidgetStack stack)
    {
        if (!string.IsNullOrWhiteSpace(stack.DefaultLayerId))
        {
            var match = stack.Layers.FirstOrDefault(l => string.Equals(l.Id, stack.DefaultLayerId, StringComparison.OrdinalIgnoreCase));
            if (match is not null)
            {
                return match;
            }
        }

        return stack.Layers.FirstOrDefault();
    }

    // Maps a widget positioned in a cols×rows sub-grid into pixels inside <paramref name="rect"/>.
    private static SKRect SubRect(SKRect rect, int cols, int rows, DashWidget widget)
    {
        var cw = rect.Width / cols;
        var ch = rect.Height / rows;
        var left = rect.Left + widget.Col * cw;
        var top = rect.Top + widget.Row * ch;
        var right = rect.Left + Math.Min(cols, widget.Col + widget.ColSpan) * cw;
        var bottom = rect.Top + Math.Min(rows, widget.Row + widget.RowSpan) * ch;
        return new SKRect(left, top, right, bottom);
    }

    // ---- Element primitives ----

    private void DrawPanel(SKRect rect)
    {
        var inset = new SKRect(rect.Left + 2.5f, rect.Top + 2.5f, rect.Right - 2.5f, rect.Bottom - 2.5f);
        var radius = Math.Max(6f, Math.Min(10f, Math.Min(rect.Width, rect.Height) * 0.08f));
        using var border = new SKPaint { Color = _palette.Border, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 1.5f };
        _canvas.DrawRoundRect(inset, radius, radius, border);
    }

    private static bool UsesInstrumentFrame(string type) => type is
        "gear_speed" or "input_trace" or "sector" or "lap_time" or
        "fuel" or "tyre_temp" or "tyre_pressure" or "gaps";

    private static SKRect ContentRect(SKRect rect, string type)
    {
        var maxInset = type is "rpm_bar" or "header" ? 2f : 6f;
        var inset = Math.Min(maxInset, Math.Min(rect.Width, rect.Height) * 0.08f);
        return new SKRect(rect.Left + inset, rect.Top + inset, rect.Right - inset, rect.Bottom - inset);
    }

    private void DrawHBar(float x, float y, float w, float h, double pct, SKColor color, bool centered)
    {
        pct = Math.Clamp(pct, centered ? -1 : 0, 1);
        var track = DashPalette.Dim(color, 0.15);
        var radius = Math.Min(3f, h / 2f);
        using (var trackPaint = new SKPaint { Color = track, IsAntialias = true })
        {
            _canvas.DrawRoundRect(new SKRect(x, y, x + w, y + h), radius, radius, trackPaint);
        }

        using var fill = new SKPaint { Color = color, IsAntialias = true };
        if (centered)
        {
            using (var mid = new SKPaint { Color = DashPalette.Dim(color, 0.4), IsAntialias = true })
            {
                _canvas.DrawRect(x + w / 2 - 0.5f, y, 1, h, mid);
            }

            var frac = pct / 2.0; // -0.5..0.5 relative to centre
            if (frac > 0)
            {
                _canvas.DrawRoundRect(new SKRect(x + w / 2f, y, x + w / 2f + (float)(frac * w), y + h), radius, radius, fill);
            }
            else if (frac < 0)
            {
                _canvas.DrawRoundRect(new SKRect(x + w / 2f + (float)(frac * w), y, x + w / 2f, y + h), radius, radius, fill);
            }
        }
        else if (pct > 0)
        {
            _canvas.DrawRoundRect(new SKRect(x, y, x + (float)(pct * w), y + h), radius, radius, fill);
        }
    }

    private void DrawVerticalSegBar(SKRect rect, double pct)
    {
        pct = Math.Clamp(pct, 0, 1);
        const int segments = 20;
        var innerX = rect.Left + 3;
        var innerW = rect.Width - 6;
        var top = rect.Top + 6;
        var usableH = rect.Height - 12;
        if (innerW <= 0 || usableH <= 0)
        {
            return;
        }

        var segH = usableH / segments;
        var filled = (int)(segments * pct);
        for (var i = 0; i < segments; i++)
        {
            var segPct = (double)i / segments;
            var baseColor = RpmStageColor(segPct);
            var color = i < filled ? baseColor : DashPalette.Dim(baseColor, 0.15);
            var sy = top + usableH - (i + 1) * segH;
            using var paint = new SKPaint { Color = color, IsAntialias = true };
            _canvas.DrawRoundRect(new SKRect(innerX, sy + 1, innerX + innerW, sy + segH - 1), 2, 2, paint);
        }
    }

    private void DrawDeltaBar(float x, float y, float w, float h, double delta, double maxDelta = 2.0)
    {
        var pct = Math.Clamp(delta / maxDelta, -1, 1);
        var mid = x + w / 2f;
        var fillW = (float)(Math.Abs(pct) * w / 2);
        var radius = Math.Min(3f, h / 2f);
        using (var track = new SKPaint { Color = _palette.Surface, IsAntialias = true })
        {
            _canvas.DrawRoundRect(new SKRect(x, y, x + w, y + h), radius, radius, track);
        }

        if (Math.Abs(delta) < 0.001)
        {
            return;
        }

        var color = delta > 0 ? _palette.Neutral : _palette.TimingPersonalBest;
        using var fill = new SKPaint { Color = color, IsAntialias = true };
        if (delta > 0)
        {
            _canvas.DrawRoundRect(new SKRect(mid, y + 1, mid + fillW, y + h - 1), 2, 2, fill);
        }
        else
        {
            _canvas.DrawRoundRect(new SKRect(mid - fillW, y + 1, mid, y + h - 1), 2, 2, fill);
        }
    }

    private void DrawDot(float cx, float cy, float r, SKColor color)
    {
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        _canvas.DrawCircle(cx, cy, r, paint);
    }

    private enum Align
    {
        Start,
        Center,
        End,
    }

    /// <summary>Draws text centred vertically on <paramref name="cy"/>, aligned to <paramref name="anchorX"/>, auto-shrinking to fit <paramref name="maxWidth"/>.</summary>
    private void DrawTextLine(string text, float anchorX, float cy, float size, SKTypeface typeface, SKColor color, Align align, float maxWidth)
    {
        if (string.IsNullOrEmpty(text) || size <= 0)
        {
            return;
        }

        using var font = new SKFont(typeface, size);
        using var paint = new SKPaint { Color = color, IsAntialias = true };

        var width = font.MeasureText(text);
        if (maxWidth > 0 && width > maxWidth)
        {
            font.Size = Math.Max(1f, size * maxWidth / width);
        }

        var metrics = font.Metrics;
        var baseline = cy - (metrics.Ascent + metrics.Descent) / 2f;
        var skAlign = align switch
        {
            Align.Center => SKTextAlign.Center,
            Align.End => SKTextAlign.Right,
            _ => SKTextAlign.Left,
        };
        _canvas.DrawText(text, anchorX, baseline, skAlign, font, paint);
    }

    // ---- Per-widget renderers (font sizes are fractions of widget height, matching the Go definitions) ----

    private void DrawHeader(SKRect r, TelemetryFrame frame)
    {
        var cy = r.MidY;
        var size = r.Height * 0.42f;

        var mid = new List<string>();
        if (!string.IsNullOrWhiteSpace(frame.Session.Track)) mid.Add(frame.Session.Track);
        if (!string.IsNullOrWhiteSpace(frame.Session.Car)) mid.Add(frame.Session.Car);
        if (frame.Session.SessionType != SessionType.Unknown) mid.Add(frame.Session.SessionType.ToString().ToUpperInvariant());
        var centerText = mid.Count > 0 ? string.Join("   ", mid) : "NO SESSION";

        var (flagText, flagColor) = FlagInfo(frame);
        if (r.Width < r.Height * 5f)
        {
            var topY = r.Top + r.Height * 0.32f;
            var bottomY = r.Top + r.Height * 0.72f;
            DrawTextLine("SPRINT", r.Left + 4, topY, r.Height * 0.23f, DashFonts.LabelBold, _palette.Muted, Align.Start, r.Width * 0.42f);
            DrawTextLine(flagText, r.Right - r.Height * 0.26f, topY, r.Height * 0.22f, DashFonts.LabelBold, flagColor, Align.End, r.Width * 0.34f);
            DrawDot(r.Right - r.Height * 0.10f, topY, r.Height * 0.06f, flagColor);
            DrawTextLine(centerText, r.MidX, bottomY, r.Height * 0.20f, DashFonts.Label, _palette.Secondary, Align.Center, r.Width * 0.92f);
            return;
        }

        DrawTextLine("SPRINT", r.Left + 8, cy, size, DashFonts.LabelBold, _palette.Muted, Align.Start, r.Width * 0.18f);
        DrawTextLine(centerText, r.Left + r.Width * 0.20f, cy, size, DashFonts.Label, _palette.Secondary, Align.Start, r.Width * 0.55f);
        DrawTextLine(flagText, r.Right - r.Height * 0.9f - 6, cy, r.Height * 0.36f, DashFonts.LabelBold, flagColor, Align.End, r.Width * 0.2f);
        DrawDot(r.Right - r.Height * 0.4f, cy, r.Height * 0.14f, flagColor);
    }

    private void DrawRpmBar(SKRect r, TelemetryFrame frame)
    {
        var max = Math.Max(1f, frame.Car.MaxRpm);
        var pct = Math.Clamp(frame.Car.Rpm / max, 0, 1);
        if (r.Width <= r.Height * 2)
        {
            DrawVerticalSegBar(r, pct);
            return;
        }

        const int segments = 24;
        var gap = Math.Max(1f, r.Width * 0.0025f);
        var segmentWidth = (r.Width - gap * (segments - 1)) / segments;
        var active = (int)Math.Ceiling(pct * segments);
        for (var index = 0; index < segments; index++)
        {
            var phase = (double)index / (segments - 1);
            var color = RpmStageColor(phase);
            var x = r.Left + index * (segmentWidth + gap);
            using var paint = new SKPaint
            {
                Color = index < active ? color : _palette.Surface,
                IsAntialias = true,
            };
            _canvas.DrawRoundRect(new SKRect(x, r.Top, x + segmentWidth, r.Bottom), 2, 2, paint);
        }
    }

    private void DrawGearSpeed(DashWidget widget, SKRect r, TelemetryFrame frame)
    {
        var rpmRatio = frame.Car.MaxRpm > 0 ? frame.Car.Rpm / frame.Car.MaxRpm : 0;
        var gearColor = rpmRatio >= 0.96
            ? _palette.RpmShift
            : rpmRatio >= 0.88
                ? _palette.RpmNearLimit
                : _palette.Neutral;
        var (anchorX, align) = HorizontalAnchor(widget, r);
        DrawTextLine(DashFormat.Gear(frame.Car.Gear), anchorX, r.Top + r.Height * 0.40f, r.Height * 0.60f, DashFonts.ValueRegular, gearColor, align, r.Width * 0.9f);
        DrawTextLine(DashFormat.SpeedKph(frame.Car.SpeedMetersPerSecond), anchorX, r.Top + r.Height * 0.78f, r.Height * 0.19f, DashFonts.Value, _palette.Neutral, align, r.Width * 0.9f);
        DrawTextLine("km/h", anchorX, r.Top + r.Height * 0.92f, r.Height * 0.09f, DashFonts.Label, _palette.Muted, align, r.Width * 0.9f);
    }

    /// <summary>
    /// Horizontal placement for a widget that exposes an "align" config. Centre is the
    /// default; left/right anchor inside a small inset so the text never touches the
    /// widget edge. The whole stack of lines shares one anchor so they stay aligned
    /// with each other.
    /// </summary>
    private static (float AnchorX, Align Align) HorizontalAnchor(DashWidget widget, SKRect r) =>
        ConfigString(widget, "align") switch
        {
            "left" => (r.Left + r.Width * 0.06f, Align.Start),
            "right" => (r.Right - r.Width * 0.06f, Align.End),
            _ => (r.MidX, Align.Center),
        };

    private SKColor RpmStageColor(double phase) => phase switch
    {
        < 0.78 => _palette.RpmNormal,
        < 0.93 => _palette.RpmNearLimit,
        _ => _palette.RpmShift,
    };

    private void DrawInputTrace(SKRect r, TelemetryFrame frame)
    {
        var rows = new (string Label, double Value, SKColor Color, bool Centered)[]
        {
            ("THR", frame.Car.Throttle, _palette.GoodOnTarget, false),
            ("BRK", frame.Car.Brake, _palette.Critical, false),
            ("CLU", frame.Car.Clutch, _palette.Secondary, false),
            ("STR", (frame.Car.Steering + 1) / 2.0, _palette.Secondary, true),
        };

        const float barXFrac = 0.24f, barWFrac = 0.72f, barHFrac = 0.13f;
        for (var i = 0; i < rows.Length; i++)
        {
            var cyFrac = 0.16f + i * 0.24f;
            var cy = r.Top + cyFrac * r.Height;
            DrawTextLine(rows[i].Label, r.Left + r.Width * (barXFrac - 0.02f), cy, r.Height * 0.11f, DashFonts.Label, _palette.Muted, Align.End, r.Width * barXFrac);
            var barX = r.Left + barXFrac * r.Width;
            var barW = barWFrac * r.Width;
            var barH = barHFrac * r.Height;
            var pct = rows[i].Centered ? rows[i].Value * 2 - 1 : rows[i].Value;
            DrawHBar(barX, cy - barH / 2f, barW, barH, pct, rows[i].Color, rows[i].Centered);
        }
    }

    private void DrawSector(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine("SECTORS", r.Left + 8, r.Top + r.Height * 0.18f, r.Height * 0.16f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.6f);

        var current = Math.Clamp(frame.Lap.Sector, 1, 3);
        var pipW = r.Width / 3.2f;
        var pipH = r.Height * 0.30f;
        var pipY = r.Top + r.Height * 0.42f;
        for (var s = 1; s <= 3; s++)
        {
            var px = r.Left + 8 + (s - 1) * (pipW + 6);
            var active = s == current && frame.Lap.Sector > 0;
            DrawTextLine($"S{s}", px + pipW / 2f, pipY + pipH / 2f, pipH * 0.6f, DashFonts.LabelBold, active ? _palette.Primary : _palette.Muted, Align.Center, pipW);
            if (active)
            {
                using var marker = new SKPaint { Color = _palette.Primary, IsAntialias = true };
                _canvas.DrawRoundRect(new SKRect(px + pipW * 0.2f, pipY + pipH + 3, px + pipW * 0.8f, pipY + pipH + 6), 1.5f, 1.5f, marker);
            }
        }

        DrawTextLine(DashFormat.Lap(frame.Lap.CurrentLapTime), r.Right - 8, r.Bottom - r.Height * 0.16f, r.Height * 0.22f, DashFonts.Value, _palette.Neutral, Align.End, r.Width * 0.6f);
    }

    private void DrawLapTime(SKRect r, TelemetryFrame frame)
    {
        var titleSize = Math.Min(26f, r.Height * 0.09f);
        var labelSize = Math.Min(22f, r.Height * 0.085f);
        var valueSize = Math.Min(32f, r.Height * 0.115f);
        DrawTextLine("LAP TIMES", r.Left + 10, r.Top + r.Height * 0.12f, titleSize, DashFonts.Label, _palette.Muted, Align.Start, r.Width);
        var rows = new (string Label, string Value, SKColor Color)[]
        {
            ("NOW", DashFormat.Lap(frame.Lap.CurrentLapTime), _palette.Neutral),
            ("LAST", DashFormat.Lap(frame.Lap.LastLapTime), _palette.Neutral),
            ("BEST", DashFormat.Lap(frame.Lap.BestLapTime), _palette.TimingFastestOverall),
        };
        for (var i = 0; i < rows.Length; i++)
        {
            var cy = r.Top + r.Height * (0.38f + i * 0.24f);
            DrawTextLine(rows[i].Label, r.Left + 10, cy, labelSize, DashFonts.Label, _palette.Secondary, Align.Start, r.Width * 0.34f);
            DrawTextLine(rows[i].Value, r.Right - 10, cy, valueSize, DashFonts.Value, rows[i].Color, Align.End, r.Width * 0.60f);
        }
    }

    private void DrawDelta(SKRect r, TelemetryFrame frame)
    {
        if (frame.Lap.TargetLapTime <= 0)
        {
            DrawTextLine("NO TARGET", r.MidX, r.MidY, r.Height * 0.4f, DashFonts.Label, _palette.Muted, Align.Center, r.Width * 0.9f);
            return;
        }

        var color = frame.Lap.Delta < -0.0005 ? _palette.TimingPersonalBest : _palette.Neutral;
        DrawTextLine("DELTA", r.Left + 10, r.MidY, r.Height * 0.24f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.20f);
        DrawTextLine(DashFormat.Delta(frame.Lap.Delta), r.Right - 10, r.MidY, r.Height * 0.42f, DashFonts.Value, color, Align.End, r.Width * 0.34f);
        var barW = r.Width * 0.30f;
        DrawDeltaBar(r.Left + r.Width * 0.25f, r.MidY - r.Height * 0.10f, barW, r.Height * 0.20f, frame.Lap.Delta);
    }

    private void DrawFuel(SKRect r, TelemetryFrame frame)
    {
        var fuel = frame.Car.FuelLiters;
        var perLap = frame.Car.FuelPerLapLiters;

        // Low-fuel panel tint (Go DefaultPanelRules: <2 danger, <5 warning).
        if (fuel is > 0 and < 5)
        {
            var tint = fuel < 2 ? _palette.Critical.WithAlpha(51) : _palette.Warning.WithAlpha(31);
            using var tintPaint = new SKPaint { Color = tint };
            _canvas.DrawRect(r, tintPaint);
        }

        if (r.Height < 150 && r.Width < 200)
        {
            DrawTextLine("FUEL", r.Left + 8, r.Top + r.Height * 0.20f, r.Height * 0.12f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.35f);
            DrawTextLine($"{DashFormat.FuelPerLap(perLap)} L/lap", r.Right - 8, r.Top + r.Height * 0.20f, r.Height * 0.11f, DashFonts.Label, _palette.Secondary, Align.End, r.Width * 0.58f);
            DrawTextLine($"{DashFormat.Fuel(fuel)} L", r.MidX, r.Top + r.Height * 0.63f, r.Height * 0.34f, DashFonts.Value, _palette.Foreground, Align.Center, r.Width * 0.9f);
            return;
        }

        DrawTextLine("FUEL", r.Left + 10, r.Top + r.Height * 0.16f, r.Height * 0.12f, DashFonts.Label, _palette.Muted, Align.Start, r.Width);
        DrawTextLine($"{DashFormat.Fuel(fuel)} L", r.Left + 10, r.Top + r.Height * 0.52f, r.Height * 0.34f, DashFonts.Value, _palette.Foreground, Align.Start, r.Width * 0.6f);
        DrawTextLine($"{DashFormat.FuelPerLap(perLap)} L/lap", r.Right - 10, r.Top + r.Height * 0.30f, r.Height * 0.18f, DashFonts.Value, _palette.Secondary, Align.End, r.Width * 0.55f);
        var laps = perLap > 0.01 ? $"~{DashFormat.Int(fuel / perLap)} laps" : "~-- laps";
        DrawTextLine(laps, r.Right - 10, r.Top + r.Height * 0.78f, r.Height * 0.16f, DashFonts.Label, _palette.Muted, Align.End, r.Width * 0.55f);
    }

    // Tyre temperatures. The channel is explicit config, never a silent fallback
    // between two different physical quantities: "surface" is the tread average the
    // driver sees in-game, "core" is the carcass (cooler and much slower to move).
    private void DrawTyreTemp(DashWidget widget, SKRect r, TelemetryFrame frame)
    {
        var useCore = string.Equals(ConfigString(widget, "channel"), "core", StringComparison.Ordinal);
        DrawTextLine(
            useCore ? "TYRE CORE" : "TYRE TEMPS",
            r.Left + 10,
            r.Top + r.Height * 0.12f,
            r.Height * 0.1f,
            DashFonts.Label,
            _palette.Muted,
            Align.Start,
            r.Width);
        var corners = new (string Label, TirePosition Pos)[]
        {
            ("FL", TirePosition.FrontLeft),
            ("FR", TirePosition.FrontRight),
            ("RL", TirePosition.RearLeft),
            ("RR", TirePosition.RearRight),
        };
        var cellW = r.Width / 2f;
        var cellH = (r.Height - r.Height * 0.18f) / 2f;
        var gridTop = r.Top + r.Height * 0.18f;
        for (var i = 0; i < corners.Length; i++)
        {
            var col = i % 2;
            var row = i / 2;
            var cx = r.Left + col * cellW;
            var cy = gridTop + row * cellH;
            var tire = frame.Tires.FirstOrDefault(t => t.Position == corners[i].Pos);
            var temp = tire is null ? 0 : TyreTemperature(tire, useCore);
            // 0 means "no reading" for every temperature channel, so show it as absent
            // instead of a plausible-looking 0°.
            var text = temp > 0 ? $"{DashFormat.Temp(temp)}°" : "--";
            DrawTextLine(corners[i].Label, cx + 8, cy + cellH * 0.4f, cellH * 0.26f, DashFonts.Label, _palette.Muted, Align.Start, cellW * 0.4f);
            DrawTextLine(text, cx + cellW - 8, cy + cellH * 0.5f, cellH * 0.42f, DashFonts.Value, _palette.TyreColor(temp), Align.End, cellW * 0.7f);
        }
    }

    /// <summary>
    /// The requested tyre channel, falling back to the tread sensors when an adapter
    /// fills only inner/middle/outer (the surface average is derived, not authoritative).
    /// </summary>
    private static float TyreTemperature(TireState tire, bool useCore)
    {
        if (useCore)
        {
            return tire.TempCoreCelsius;
        }

        if (tire.TempSurfaceCelsius > 0)
        {
            return tire.TempSurfaceCelsius;
        }

        var sum = 0f;
        var count = 0;
        foreach (var reading in new[] { tire.TempInnerCelsius, tire.TempMiddleCelsius, tire.TempOuterCelsius })
        {
            if (reading > 0)
            {
                sum += reading;
                count++;
            }
        }

        return count == 0 ? 0 : sum / count;
    }

    private void DrawPosition(SKRect r, TelemetryFrame frame)
    {
        var value = frame.Race.TotalPositions > 0
            ? $"P{frame.Race.Position} / {frame.Race.TotalPositions}"
            : frame.Race.Position > 0 ? $"P{frame.Race.Position}" : "P--";
        DrawSimpleValue(r, "POSITION", value);
    }

    private void DrawGaps(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine("GAPS", r.Left + 8, r.Top + r.Height * 0.16f, r.Height * 0.12f, DashFonts.Label, _palette.Muted, Align.Start, r.Width);

        var ahead = DashFormat.Gap(frame.Race.GapAhead);
        var behind = DashFormat.Gap(frame.Race.GapBehind);
        DrawTextLine("AHEAD", r.Left + 10, r.Top + r.Height * 0.5f, r.Height * 0.13f, DashFonts.Label, _palette.Secondary, Align.Start, r.Width * 0.45f);
        DrawTextLine(ahead == "--" ? "--" : $"-{ahead}", r.Left + 10, r.Top + r.Height * 0.78f, r.Height * 0.2f, DashFonts.Value, _palette.Foreground, Align.Start, r.Width * 0.45f);
        DrawTextLine("BEHIND", r.Right - 10, r.Top + r.Height * 0.5f, r.Height * 0.13f, DashFonts.Label, _palette.Secondary, Align.End, r.Width * 0.45f);
        DrawTextLine(behind == "--" ? "--" : $"+{behind}", r.Right - 10, r.Top + r.Height * 0.78f, r.Height * 0.2f, DashFonts.Value, _palette.Foreground, Align.End, r.Width * 0.45f);
    }

    private void DrawTyrePressure(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine("TYRE PRESSURE", r.Left + 10, r.Top + r.Height * 0.12f, r.Height * 0.1f, DashFonts.Label, _palette.Muted, Align.Start, r.Width);
        var corners = new (string Label, TirePosition Pos)[]
        {
            ("FL", TirePosition.FrontLeft),
            ("FR", TirePosition.FrontRight),
            ("RL", TirePosition.RearLeft),
            ("RR", TirePosition.RearRight),
        };
        var cellW = r.Width / 2f;
        var cellH = (r.Height - r.Height * 0.18f) / 2f;
        var gridTop = r.Top + r.Height * 0.18f;
        for (var i = 0; i < corners.Length; i++)
        {
            var col = i % 2;
            var row = i / 2;
            var cx = r.Left + col * cellW;
            var cy = gridTop + row * cellH;
            var tire = frame.Tires.FirstOrDefault(t => t.Position == corners[i].Pos);
            DrawTextLine(corners[i].Label, cx + 8, cy + cellH * 0.28f, cellH * 0.20f, DashFonts.Label, _palette.Muted, Align.Start, cellW * 0.4f);
            DrawTextLine(tire is null ? "--" : DashFormat.Pressure(tire.PressureKPa), cx + cellW - 8, cy + cellH * 0.66f, cellH * 0.34f, DashFonts.Value, _palette.Foreground, Align.End, cellW * 0.82f);
        }
    }

    // LMU virtual-energy budget. The "mode" config picks the readout; all three tolerate
    // 0..1 or 0..100 source scales by normalising off the current level and applying the
    // same factor to the per-lap delta so "laps remaining" stays scale-independent.
    private void DrawVirtualEnergy(DashWidget widget, SKRect r, TelemetryFrame frame)
    {
        var raw = frame.Energy.VirtualEnergy;
        var scale = raw is > 0f and <= 1.0f ? 100f : 1f;
        var pct = raw * scale;
        var mode = ConfigString(widget, "mode") switch
        {
            "percent" => "percent",
            "power" => "power",
            _ => "budget",
        };

        // Low-energy tint mirrors the fuel widget's danger/warning thresholds.
        if (pct is > 0 and < 15)
        {
            var tint = pct < 5 ? _palette.Critical.WithAlpha(51) : _palette.Warning.WithAlpha(31);
            using var tintPaint = new SKPaint { Color = tint };
            _canvas.DrawRect(r, tintPaint);
        }

        switch (mode)
        {
            case "percent":
                DrawVirtualEnergyPercent(r, pct);
                break;
            case "power":
                DrawVirtualEnergyPower(r, pct, frame);
                break;
            default:
                DrawVirtualEnergyBudget(r, pct, frame.Energy.VirtualEnergyPerLap * scale, raw, frame.Energy.VirtualEnergyPerLap);
                break;
        }
    }

    private void DrawVirtualEnergyPercent(SKRect r, float pct)
    {
        DrawTextLine("VIRTUAL ENERGY", r.Left + 8, r.Top + r.Height * 0.18f, r.Height * 0.13f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.9f);
        DrawTextLine(pct > 0 ? $"{pct:0}%" : "--", r.MidX, r.Top + r.Height * 0.58f, r.Height * 0.4f, DashFonts.Value, _palette.Neutral, Align.Center, r.Width * 0.9f);
        var barColor = pct < 5 ? _palette.Critical : pct < 15 ? _palette.Warning : _palette.Neutral;
        DrawHBar(r.Left + r.Width * 0.08f, r.Bottom - r.Height * 0.16f, r.Width * 0.84f, r.Height * 0.08f, pct / 100.0, barColor, centered: false);
    }

    private void DrawVirtualEnergyPower(SKRect r, float pct, TelemetryFrame frame)
    {
        DrawTextLine("VIRTUAL ENERGY", r.Left + 8, r.Top + r.Height * 0.2f, r.Height * 0.14f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.9f);
        DrawTextLine(pct > 0 ? $"{pct:0}%" : "--", r.Left + 8, r.Top + r.Height * 0.62f, r.Height * 0.38f, DashFonts.Value, _palette.Neutral, Align.Start, r.Width * 0.6f);
        var deploy = frame.Energy.DeployPower;
        DrawTextLine(deploy > 0 ? $"DEP {DashFormat.Int(deploy)} kW" : "DEP -- kW", r.Right - 8, r.Top + r.Height * 0.42f, r.Height * 0.15f, DashFonts.Value, _palette.Secondary, Align.End, r.Width * 0.55f);
        var regen = frame.Energy.RegenPower;
        DrawTextLine(regen > 0 ? $"REGEN {DashFormat.Int(regen)} kW" : "REGEN -- kW", r.Right - 8, r.Top + r.Height * 0.82f, r.Height * 0.15f, DashFonts.Value, _palette.Secondary, Align.End, r.Width * 0.6f);
    }

    // Endurance budget view: remaining %, per-lap burn, and estimated laps left. rawLevel
    // and rawPerLap are the un-normalised source values whose ratio is the laps estimate.
    private void DrawVirtualEnergyBudget(SKRect r, float pct, float perLapPct, float rawLevel, float rawPerLap)
    {
        var laps = rawPerLap > 0.0001f ? $"~{DashFormat.Int(rawLevel / rawPerLap)} laps" : "~-- laps";
        var perLapText = perLapPct > 0.0001f ? $"{perLapPct:0.0} %/lap" : "-- %/lap";

        if (r.Height < 150 && r.Width < 200)
        {
            DrawTextLine("V-ENERGY", r.Left + 8, r.Top + r.Height * 0.20f, r.Height * 0.12f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.4f);
            DrawTextLine(perLapText, r.Right - 8, r.Top + r.Height * 0.20f, r.Height * 0.11f, DashFonts.Label, _palette.Secondary, Align.End, r.Width * 0.55f);
            DrawTextLine(pct > 0 ? $"{pct:0}%" : "--", r.MidX, r.Top + r.Height * 0.63f, r.Height * 0.34f, DashFonts.Value, _palette.Neutral, Align.Center, r.Width * 0.9f);
            return;
        }

        DrawTextLine("VIRTUAL ENERGY", r.Left + 10, r.Top + r.Height * 0.16f, r.Height * 0.12f, DashFonts.Label, _palette.Muted, Align.Start, r.Width);
        DrawTextLine(pct > 0 ? $"{pct:0}%" : "--", r.Left + 10, r.Top + r.Height * 0.52f, r.Height * 0.34f, DashFonts.Value, _palette.Neutral, Align.Start, r.Width * 0.6f);
        DrawTextLine(perLapText, r.Right - 10, r.Top + r.Height * 0.30f, r.Height * 0.18f, DashFonts.Value, _palette.Secondary, Align.End, r.Width * 0.55f);
        DrawTextLine(laps, r.Right - 10, r.Top + r.Height * 0.78f, r.Height * 0.16f, DashFonts.Label, _palette.Muted, Align.End, r.Width * 0.55f);
    }

    private void DrawFlag(SKRect r, TelemetryFrame frame)
    {
        var (text, color) = FlagInfo(frame);
        if (r.Width < r.Height * 0.9f)
        {
            var radius = Math.Min(r.Width * 0.18f, r.Height * 0.12f);
            DrawDot(r.MidX, r.Top + r.Height * 0.31f, radius, color);
            DrawTextLine(
                text,
                r.MidX,
                r.Top + r.Height * 0.68f,
                Math.Min(r.Height * 0.18f, r.Width * 0.20f),
                DashFonts.ValueRegular,
                color,
                Align.Center,
                r.Width * 0.88f);
            return;
        }

        var horizontalRadius = Math.Min(r.Height * 0.18f, r.Width * 0.09f);
        DrawDot(r.Left + r.Width * 0.12f, r.MidY, horizontalRadius, color);
        DrawTextLine(
            text,
            r.Left + r.Width * 0.62f,
            r.MidY,
            Math.Min(r.Height * 0.32f, r.Width * 0.12f),
            DashFonts.ValueRegular,
            color,
            Align.Center,
            r.Width * 0.6f);
    }

    private void DrawTc(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine("TC1", r.Left + 6, r.Top + r.Height * 0.2f, r.Height * 0.16f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.6f);
        var color = frame.Electronics.TractionControlActive ? _palette.AssistActive : _palette.Neutral;
        DrawTextLine(frame.Electronics.TractionControl.ToString(), r.MidX, r.Top + r.Height * 0.58f, r.Height * 0.5f, DashFonts.Value, color, Align.Center, r.Width * 0.9f);
    }

    private void DrawElectronicsValue(SKRect r, string label, byte value, byte max)
    {
        DrawSimpleValue(r, label, value.ToString());
    }

    private void DrawSimpleValue(SKRect r, string label, string value)
    {
        DrawTextLine(label, r.Left + 8, r.Top + r.Height * 0.2f, r.Height * 0.14f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.8f);
        DrawTextLine(value, r.MidX, r.Top + r.Height * 0.58f, r.Height * 0.42f, DashFonts.Value, _palette.Foreground, Align.Center, r.Width * 0.92f);
    }

    private void DrawText(DashWidget widget, SKRect r, TelemetryFrame frame, AppSettings settings)
    {
        var content = ConfigString(widget, "content");
        var binding = ConfigString(widget, "binding");
        string? resolved = null;
        if (!string.IsNullOrWhiteSpace(binding))
        {
            resolved = DashBindingResolver.Resolve(new DashBindingContext(frame, settings), binding)?.ToString();
        }

        var display = !string.IsNullOrWhiteSpace(resolved) ? resolved
            : !string.IsNullOrWhiteSpace(content) ? content
            : widget.Id;
        DrawTextLine(display, r.MidX, r.MidY, r.Height * 0.45f, DashFonts.Value, _palette.Foreground, Align.Center, r.Width * 0.94f);
    }

    private void DrawUnknown(DashWidget widget, SKRect r)
    {
        DrawTextLine(widget.Type.ToUpperInvariant(), r.MidX, r.MidY, r.Height * 0.2f, DashFonts.Label, _palette.Muted, Align.Center, r.Width * 0.9f);
    }

    // ---- Overlays ----

    private void DrawFlagOverlay(TelemetryFrame frame)
    {
        if (!frame.Flags.Yellow && !frame.Flags.Red && !frame.Flags.SafetyCar)
        {
            return;
        }

        var (color, text) = frame.Flags.Red ? (DashPalette.Default.Critical, "RED FLAG")
            : frame.Flags.SafetyCar ? (DashPalette.Default.RaceControlYellow, "SAFETY CAR")
            : (DashPalette.Default.RaceControlYellow, "YELLOW FLAG");

        using (var tint = new SKPaint { Color = color.WithAlpha(25) })
        {
            _canvas.DrawRect(0, 0, Width, Height, tint);
        }

        var barH = Math.Max(20, Height * 0.06f);
        using (var bar = new SKPaint { Color = color })
        {
            _canvas.DrawRect(0, Height - barH, Width, barH, bar);
        }

        DrawTextLine(text, Width / 2f, Height - barH / 2f, barH * 0.6f, DashFonts.LabelBold, _palette.Background, Align.Center, Width);
    }

    private void DrawAlertOverlay(DashAlertBanner banner)
    {
        var cols = Math.Max(1, banner.GridCols);
        var rows = Math.Max(1, banner.GridRows);
        var left = GridEdge(Width, cols, banner.Col);
        var top = GridEdge(Height, rows, banner.Row);
        var right = GridEdge(Width, cols, banner.Col + banner.ColSpan);
        var bottom = GridEdge(Height, rows, banner.Row + banner.RowSpan);
        var panel = new SKRect(left + 2, top + 2, right - 2, bottom - 2);
        if (panel.Width < 4 || panel.Height < 4)
        {
            return;
        }

        var inverted = banner.Condition == DashCondition.Critical && banner.InvertColors;
        var fill = inverted ? banner.Color : new SKColor(8, 8, 10, 246);
        var titleColor = inverted ? _palette.Background : banner.Color;
        var valueColor = inverted ? _palette.Background : _palette.Foreground;
        using (var backdrop = new SKPaint { Color = fill, IsAntialias = true })
        {
            var radius = Math.Max(8, Math.Min(panel.Width, panel.Height) * 0.06f);
            _canvas.DrawRoundRect(panel, radius, radius, backdrop);
        }
        using (var edge = new SKPaint { Color = inverted ? _palette.Background : banner.Color, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = Math.Max(1.5f, panel.Height * 0.008f) })
        {
            var radius = Math.Max(8, Math.Min(panel.Width, panel.Height) * 0.06f);
            _canvas.DrawRoundRect(panel, radius, radius, edge);
        }

        var titleY = panel.Top + panel.Height * 0.25f;
        var valueY = panel.Top + panel.Height * 0.64f;
        DrawTextLine(banner.Title, panel.MidX, titleY, panel.Height * 0.13f, DashFonts.LabelBold, titleColor, Align.Center, panel.Width * 0.86f);
        DrawTextLine(banner.Value, panel.MidX, valueY, panel.Height * 0.52f, DashFonts.Value, valueColor, Align.Center, panel.Width * 0.84f);
    }

    private (string Text, SKColor Color) FlagInfo(TelemetryFrame frame)
    {
        if (frame.Flags.Red) return ("RED", DashPalette.Default.Critical);
        if (frame.Flags.SafetyCar) return ("SC", DashPalette.Default.RaceControlYellow);
        if (frame.Flags.VirtualSafetyCar) return ("VSC", DashPalette.Default.RaceControlYellow);
        if (frame.Flags.Yellow || frame.Flags.DoubleYellow) return ("YELLOW", DashPalette.Default.RaceControlYellow);
        if (frame.Flags.Checkered) return ("CHK", DashPalette.Default.Neutral);
        return ("GREEN", DashPalette.Default.GoodOnTarget);
    }

    private static string? ConfigString(DashWidget widget, string key)
    {
        if (widget.Config is not null && widget.Config.TryGetValue(key, out var element) && element.ValueKind == JsonValueKind.String)
        {
            return element.GetString();
        }

        return null;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _canvas.Dispose();
        _bitmap.Dispose();
    }
}

/// <summary>A transient dash alert (parameter change), produced by <see cref="DashAlertTracker"/>.</summary>
public readonly record struct DashAlertBanner(
    string Title,
    string Value,
    SKColor Color,
    int Col = 6,
    int Row = 3,
    int ColSpan = 8,
    int RowSpan = 6,
    int GridCols = 20,
    int GridRows = 12,
    bool InvertColors = false,
    DashCondition Condition = DashCondition.Neutral);
