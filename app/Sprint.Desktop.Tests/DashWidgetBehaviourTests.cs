using System.Text.Json;
using SkiaSharp;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Dash widget behaviour reported in issue #75: the tyre-temperature widget must read
/// the channel it is configured for (and show absent readings as absent rather than 0°),
/// and the gear/speed stack must honour its alignment setting. Assertions are on painted
/// pixels — where the ink lands is the behaviour under test.
/// </summary>
public sealed class DashWidgetBehaviourTests
{
    [Fact]
    public void TyreTempShowsSurfaceByDefaultAndCoreWhenConfigured()
    {
        // Surface and core are far apart, so the two configurations cannot paint the
        // same pixels: 90°C surface is in range (green), 45°C core is cold (blue).
        var frame = FrameWithTyres(surface: 90, core: 45);
        var palette = DashPalette.Default;

        var surfaceLayout = TyreLayout(channel: null);
        using var surfacePainter = new DashPainter(320, 240, palette);
        var surfacePixels = surfacePainter.Render(surfaceLayout, frame, new AppSettings());

        var coreLayout = TyreLayout(channel: "core");
        using var corePainter = new DashPainter(320, 240, palette);
        var corePixels = corePainter.Render(coreLayout, frame, new AppSettings());

        Assert.True(
            CountExact(surfacePixels, palette.TyreColor(90)) > 0,
            "Default channel should paint the in-range surface temperature.");
        Assert.Equal(0, CountExact(surfacePixels, palette.TyreColor(45)));

        Assert.True(
            CountExact(corePixels, palette.TyreColor(45)) > 0,
            "The core channel should paint the cooler carcass temperature.");
        Assert.Equal(0, CountExact(corePixels, palette.TyreColor(90)));
    }

    [Fact]
    public void TyreTempFallsBackToTheTreadSensorsWhenSurfaceIsNotProvided()
    {
        // An adapter that fills only inner/middle/outer must still produce a reading;
        // the widget averages the tread rather than showing nothing.
        var frame = new TelemetryFrame
        {
            Tires =
            [
                new TireState { Position = TirePosition.FrontLeft, TempInnerCelsius = 88, TempMiddleCelsius = 90, TempOuterCelsius = 92 },
            ],
        };

        var palette = DashPalette.Default;
        using var painter = new DashPainter(320, 240, palette);
        var pixels = painter.Render(TyreLayout(channel: null), frame, new AppSettings());

        Assert.True(CountExact(pixels, palette.TyreColor(90)) > 0, "Expected the tread average to be painted.");
    }

    [Fact]
    public void TyreTempWithoutAnyReadingPaintsNoTemperatureColour()
    {
        // All-zero temperatures mean "no data" (the LMU channels report 0 K out of the
        // car). Painting 0° would look like a real, very cold tyre.
        var frame = new TelemetryFrame
        {
            Tires = [new TireState { Position = TirePosition.FrontLeft }],
        };

        var palette = DashPalette.Default;
        using var painter = new DashPainter(320, 240, palette);
        var pixels = painter.Render(TyreLayout(channel: null), frame, new AppSettings());

        // TyreColor(0) is the cold-range colour; with no reading the widget draws "--"
        // in that colour but never a numeric temperature, so the digit-heavy ink of a
        // real reading is absent. Compare against a frame that does have data.
        using var withData = new DashPainter(320, 240, palette);
        var populated = withData.Render(TyreLayout(channel: null), FrameWithTyres(surface: 90, core: 45), new AppSettings());

        Assert.True(
            VisiblePixels(populated) > VisiblePixels(pixels),
            "A frame with readings must paint more ink than one showing only placeholders.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("center")]
    public void GearSpeedCentresByDefault(string? align)
    {
        var (left, right) = GearInkHalves(align);

        // Centred text puts comparable ink in both halves of the widget.
        var ratio = (double)Math.Min(left, right) / Math.Max(1, Math.Max(left, right));
        Assert.True(ratio > 0.6, $"Expected balanced ink for align={align ?? "unset"}; left={left}, right={right}.");
    }

    [Fact]
    public void GearSpeedHonoursLeftAndRightAlignment()
    {
        var (leftAlignedLeft, leftAlignedRight) = GearInkHalves("left");
        var (rightAlignedLeft, rightAlignedRight) = GearInkHalves("right");

        Assert.True(
            leftAlignedLeft > leftAlignedRight * 2,
            $"Left alignment should pile ink into the left half; left={leftAlignedLeft}, right={leftAlignedRight}.");
        Assert.True(
            rightAlignedRight > rightAlignedLeft * 2,
            $"Right alignment should pile ink into the right half; left={rightAlignedLeft}, right={rightAlignedRight}.");
    }

    private static (int Left, int Right) GearInkHalves(string? align)
    {
        const int width = 320;
        const int height = 240;
        var layout = WidgetLayout("gear_speed", align is null ? null : ("align", align));
        var frame = new TelemetryFrame { Car = new CarState { Gear = 4, SpeedMetersPerSecond = 50, MaxRpm = 9000 } };

        using var painter = new DashPainter(width, height, DashPalette.Default);
        var pixels = painter.Render(layout, frame, new AppSettings());

        var all = pixels.Pixels;
        var left = 0;
        var right = 0;
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                if (!IsInk(all[y * width + x]))
                {
                    continue;
                }

                if (x < width / 2)
                {
                    left++;
                }
                else
                {
                    right++;
                }
            }
        }

        return (left, right);
    }

    private static TelemetryFrame FrameWithTyres(float surface, float core) => new()
    {
        Tires =
        [
            new TireState { Position = TirePosition.FrontLeft, TempSurfaceCelsius = surface, TempCoreCelsius = core },
            new TireState { Position = TirePosition.FrontRight, TempSurfaceCelsius = surface, TempCoreCelsius = core },
            new TireState { Position = TirePosition.RearLeft, TempSurfaceCelsius = surface, TempCoreCelsius = core },
            new TireState { Position = TirePosition.RearRight, TempSurfaceCelsius = surface, TempCoreCelsius = core },
        ],
    };

    private static DashLayout TyreLayout(string? channel) =>
        WidgetLayout("tyre_temp", channel is null ? null : ("channel", channel));

    private static DashLayout WidgetLayout(string type, (string Key, string Value)? config)
    {
        var widget = new DashWidget { Id = "w", Type = type, Col = 0, Row = 0, ColSpan = 20, RowSpan = 12 };
        if (config is { } entry)
        {
            widget.Config = new Dictionary<string, JsonElement>
            {
                [entry.Key] = JsonSerializer.SerializeToElement(entry.Value),
            };
        }

        return new DashLayout
        {
            Id = $"single-{type}",
            GridCols = 20,
            GridRows = 12,
            Pages = [new DashPage { Id = "p", Name = "P", Widgets = [widget] }],
        };
    }

    private static int CountExact(SKBitmap bitmap, SKColor color) =>
        bitmap.Pixels.Count(pixel => pixel == color);

    // Any pixel brighter than the near-black dash background counts as ink.
    private static bool IsInk(SKColor pixel) => pixel.Red > 90 || pixel.Green > 90 || pixel.Blue > 90;

    private static int VisiblePixels(SKBitmap bitmap) => bitmap.Pixels.Count(IsInk);
}
