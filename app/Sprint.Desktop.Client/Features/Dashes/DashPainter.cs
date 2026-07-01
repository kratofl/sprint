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
    private readonly DashPalette _palette;
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
        _palette = palette ?? DashPalette.Default;
        _bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul));
        _canvas = new SKCanvas(_bitmap);
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
        bool idle = false)
    {
        Render(layout, frame, settings, pageId, idle);
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
        // Header/text/flag widgets are borderless per their Go meta (Label.Hidden + no panel border rules);
        // everything else gets the auto panel outline.
        var borderless = widget.Type is "header";
        if (!borderless)
        {
            DrawPanel(rect);
        }

        switch (widget.Type)
        {
            case "header": DrawHeader(rect, frame); break;
            case "rpm_bar": DrawRpmBar(rect, frame); break;
            case "gear_speed": DrawGearSpeed(rect, frame); break;
            case "input_trace": DrawInputTrace(rect, frame); break;
            case "sector": DrawSector(rect, frame); break;
            case "lap_time": DrawLapTime(rect, frame); break;
            case "delta": DrawDelta(rect, frame); break;
            case "fuel": DrawFuel(rect, frame); break;
            case "tyre_temp": DrawTyreTemp(rect, frame); break;
            case "flag": DrawFlag(rect, frame); break;
            case "tc": DrawTc(rect, frame); break;
            case "text": DrawText(widget, rect, frame, settings); break;
            default: DrawUnknown(widget, rect); break;
        }
    }

    // ---- Element primitives ----

    private void DrawPanel(SKRect rect)
    {
        using var border = new SKPaint { Color = _palette.Border, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 1 };
        var inset = new SKRect(rect.Left + 0.5f, rect.Top + 0.5f, rect.Right - 0.5f, rect.Bottom - 0.5f);
        _canvas.DrawRoundRect(inset, 4, 4, border);
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
            var baseColor = segPct switch
            {
                < 0.6 => _palette.Success,
                < 0.85 => _palette.Warning,
                _ => _palette.RpmRed,
            };
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

        var color = delta > 0 ? _palette.Danger : _palette.Success;
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
        var pad = r.Height * 0.5f;
        var cy = r.MidY;
        var size = r.Height * 0.42f;
        DrawTextLine("SPRINT", r.Left + 8, cy, size, DashFonts.LabelBold, _palette.Muted, Align.Start, r.Width * 0.18f);

        var mid = new List<string>();
        if (!string.IsNullOrWhiteSpace(frame.Session.Track)) mid.Add(frame.Session.Track);
        if (!string.IsNullOrWhiteSpace(frame.Session.Car)) mid.Add(frame.Session.Car);
        if (frame.Session.SessionType != SessionType.Unknown) mid.Add(frame.Session.SessionType.ToString().ToUpperInvariant());
        var centerText = mid.Count > 0 ? string.Join("   ", mid) : "NO SESSION";
        DrawTextLine(centerText, r.Left + r.Width * 0.20f, cy, size, DashFonts.Label, _palette.Secondary, Align.Start, r.Width * 0.55f);

        var (flagText, flagColor) = FlagInfo(frame);
        DrawTextLine(flagText, r.Right - r.Height * 0.9f - 6, cy, r.Height * 0.36f, DashFonts.LabelBold, flagColor, Align.End, r.Width * 0.2f);
        DrawDot(r.Right - r.Height * 0.4f, cy, r.Height * 0.14f, flagColor);
    }

    private void DrawRpmBar(SKRect r, TelemetryFrame frame)
    {
        var max = Math.Max(1f, frame.Car.MaxRpm);
        DrawVerticalSegBar(r, frame.Car.Rpm / max);
    }

    private void DrawGearSpeed(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine(DashFormat.Gear(frame.Car.Gear), r.MidX, r.Top + r.Height * 0.40f, r.Height * 0.60f, DashFonts.Value, _palette.Foreground, Align.Center, r.Width * 0.9f);
        DrawTextLine(DashFormat.SpeedKph(frame.Car.SpeedMetersPerSecond), r.MidX, r.Top + r.Height * 0.78f, r.Height * 0.19f, DashFonts.Value, _palette.Foreground, Align.Center, r.Width * 0.9f);
        DrawTextLine("km/h", r.MidX, r.Top + r.Height * 0.92f, r.Height * 0.09f, DashFonts.Label, _palette.Muted, Align.Center, r.Width * 0.9f);
    }

    private void DrawInputTrace(SKRect r, TelemetryFrame frame)
    {
        var rows = new (string Label, double Value, SKColor Color, bool Centered)[]
        {
            ("THR", frame.Car.Throttle, _palette.Success, false),
            ("BRK", frame.Car.Brake, _palette.Danger, false),
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
            using var paint = new SKPaint { Color = active ? _palette.Primary : _palette.Surface, IsAntialias = true };
            _canvas.DrawRoundRect(new SKRect(px, pipY, px + pipW, pipY + pipH), 3, 3, paint);
            DrawTextLine($"S{s}", px + pipW / 2f, pipY + pipH / 2f, pipH * 0.6f, DashFonts.LabelBold, active ? _palette.Background : _palette.Muted, Align.Center, pipW);
        }

        DrawTextLine(DashFormat.Lap(frame.Lap.CurrentLapTime), r.Right - 8, r.Bottom - r.Height * 0.16f, r.Height * 0.22f, DashFonts.Value, _palette.Foreground, Align.End, r.Width * 0.6f);
    }

    private void DrawLapTime(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine("LAP TIMES", r.Left + 10, r.Top + r.Height * 0.13f, r.Height * 0.11f, DashFonts.Label, _palette.Muted, Align.Start, r.Width);
        var rows = new (string Label, string Value, SKColor Color)[]
        {
            ("Current", DashFormat.Lap(frame.Lap.CurrentLapTime), _palette.Foreground),
            ("Last", DashFormat.Lap(frame.Lap.LastLapTime), _palette.Foreground),
            ("Best", DashFormat.Lap(frame.Lap.BestLapTime), _palette.Accent),
        };
        for (var i = 0; i < rows.Length; i++)
        {
            var cy = r.Top + r.Height * (0.38f + i * 0.24f);
            DrawTextLine(rows[i].Label, r.Left + 10, cy, r.Height * 0.15f, DashFonts.Label, _palette.Secondary, Align.Start, r.Width * 0.45f);
            DrawTextLine(rows[i].Value, r.Right - 10, cy, r.Height * 0.20f, DashFonts.Value, rows[i].Color, Align.End, r.Width * 0.55f);
        }
    }

    private void DrawDelta(SKRect r, TelemetryFrame frame)
    {
        if (frame.Lap.TargetLapTime <= 0)
        {
            DrawTextLine("NO TARGET", r.MidX, r.MidY, r.Height * 0.4f, DashFonts.Label, _palette.Muted, Align.Center, r.Width * 0.9f);
            return;
        }

        var color = frame.Lap.Delta > 0.0005 ? _palette.Danger : frame.Lap.Delta < -0.0005 ? _palette.Success : _palette.Foreground;
        DrawTextLine("DELTA", r.Left + 10, r.MidY, r.Height * 0.34f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.25f);
        DrawTextLine(DashFormat.Delta(frame.Lap.Delta), r.Right - 10, r.MidY, r.Height * 0.55f, DashFonts.Value, color, Align.End, r.Width * 0.45f);
        var barW = r.Width * 0.34f;
        DrawDeltaBar(r.MidX - barW / 2f, r.MidY - r.Height * 0.12f, barW, r.Height * 0.24f, frame.Lap.Delta);
    }

    private void DrawFuel(SKRect r, TelemetryFrame frame)
    {
        var fuel = frame.Car.FuelLiters;
        var perLap = frame.Car.FuelPerLapLiters;

        // Low-fuel panel tint (Go DefaultPanelRules: <2 danger, <5 warning).
        if (fuel is > 0 and < 5)
        {
            var tint = fuel < 2 ? _palette.Danger.WithAlpha(51) : _palette.Warning.WithAlpha(31);
            using var tintPaint = new SKPaint { Color = tint };
            _canvas.DrawRect(r, tintPaint);
        }

        DrawTextLine("FUEL", r.Left + 10, r.Top + r.Height * 0.16f, r.Height * 0.12f, DashFonts.Label, _palette.Muted, Align.Start, r.Width);
        DrawTextLine($"{DashFormat.Fuel(fuel)} L", r.Left + 10, r.Top + r.Height * 0.52f, r.Height * 0.34f, DashFonts.Value, _palette.Foreground, Align.Start, r.Width * 0.6f);
        DrawTextLine($"{DashFormat.FuelPerLap(perLap)} L/lap", r.Right - 10, r.Top + r.Height * 0.30f, r.Height * 0.18f, DashFonts.Value, _palette.Secondary, Align.End, r.Width * 0.55f);
        var laps = perLap > 0.01 ? $"~{DashFormat.Int(fuel / perLap)} laps" : "~-- laps";
        DrawTextLine(laps, r.Right - 10, r.Top + r.Height * 0.56f, r.Height * 0.16f, DashFonts.Label, _palette.Muted, Align.End, r.Width * 0.55f);
    }

    private void DrawTyreTemp(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine("TYRE TEMPS", r.Left + 10, r.Top + r.Height * 0.12f, r.Height * 0.1f, DashFonts.Label, _palette.Muted, Align.Start, r.Width);
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
            var temp = tire is null ? 0 : tire.TempCoreCelsius > 0 ? tire.TempCoreCelsius : tire.TempSurfaceCelsius;
            DrawTextLine(corners[i].Label, cx + 8, cy + cellH * 0.4f, cellH * 0.26f, DashFonts.Label, _palette.Muted, Align.Start, cellW * 0.4f);
            DrawTextLine(tire is null ? "--" : $"{DashFormat.Temp(temp)}°", cx + cellW - 8, cy + cellH * 0.5f, cellH * 0.42f, DashFonts.Value, _palette.TyreColor(temp), Align.End, cellW * 0.7f);
        }
    }

    private void DrawFlag(SKRect r, TelemetryFrame frame)
    {
        var (text, color) = FlagInfo(frame);
        DrawDot(r.Left + r.Width * 0.12f, r.MidY, r.Height * 0.18f, color);
        DrawTextLine(text, r.Left + r.Width * 0.62f, r.MidY, r.Height * 0.32f, DashFonts.ValueRegular, color, Align.Center, r.Width * 0.6f);
    }

    private void DrawTc(SKRect r, TelemetryFrame frame)
    {
        DrawTextLine("TC1", r.Left + 6, r.Top + r.Height * 0.2f, r.Height * 0.16f, DashFonts.Label, _palette.Muted, Align.Start, r.Width * 0.6f);
        var color = frame.Electronics.TractionControlActive ? _palette.Accent : _palette.Foreground;
        DrawTextLine(frame.Electronics.TractionControl.ToString(), r.MidX, r.Top + r.Height * 0.58f, r.Height * 0.5f, DashFonts.Value, color, Align.Center, r.Width * 0.9f);
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

        var (color, text) = frame.Flags.Red ? (_palette.Danger, "RED FLAG")
            : frame.Flags.SafetyCar ? (_palette.Warning, "SAFETY CAR")
            : (_palette.Warning, "YELLOW FLAG");

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
        using (var backdrop = new SKPaint { Color = new SKColor(0, 0, 0, 235) })
        {
            _canvas.DrawRect(0, 0, Width, Height, backdrop);
        }

        var barH = Math.Max(6, Height * 0.02f);
        using (var bar = new SKPaint { Color = banner.Color })
        {
            _canvas.DrawRect(0, 0, Width, barH, bar);
            _canvas.DrawRect(0, Height - barH, Width, barH, bar);
        }

        DrawTextLine(banner.Text, Width / 2f, Height / 2f, Height * 0.24f, DashFonts.Value, banner.Color, Align.Center, Width * 0.9f);
    }

    private (string Text, SKColor Color) FlagInfo(TelemetryFrame frame)
    {
        if (frame.Flags.Red) return ("RED", _palette.Danger);
        if (frame.Flags.SafetyCar) return ("SC", _palette.Warning);
        if (frame.Flags.VirtualSafetyCar) return ("VSC", _palette.Warning);
        if (frame.Flags.Yellow || frame.Flags.DoubleYellow) return ("YELLOW", _palette.Warning);
        if (frame.Flags.Checkered) return ("CHK", _palette.Foreground);
        return ("GREEN", _palette.Success);
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

/// <summary>A transient full-screen dash alert (parameter change), produced by <see cref="DashAlertTracker"/>.</summary>
public readonly record struct DashAlertBanner(string Text, SKColor Color);
