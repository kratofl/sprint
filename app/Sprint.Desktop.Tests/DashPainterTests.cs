using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using SkiaSharp;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashPainterTests
{
    [Theory]
    [InlineData(0, "--:--.---")]
    [InlineData(-3, "--:--.---")]
    [InlineData(83.456, "1:23.456")]
    [InlineData(59.999, "0:59.999")]
    public void FormatsLapTime(double seconds, string expected) =>
        Assert.Equal(expected, DashFormat.Lap(seconds));

    [Theory]
    [InlineData(0, "0.000")]
    [InlineData(0.0004, "0.000")]
    [InlineData(0.123, "+0.123")]
    [InlineData(-0.5, "-0.500")]
    public void FormatsSignedDelta(double seconds, string expected) =>
        Assert.Equal(expected, DashFormat.Delta(seconds));

    [Theory]
    [InlineData(0, "N")]
    [InlineData(-1, "R")]
    [InlineData(4, "4")]
    public void FormatsGear(int gear, string expected) =>
        Assert.Equal(expected, DashFormat.Gear(gear));

    [Fact]
    public void FormatsSpeedToKph() =>
        Assert.Equal("100", DashFormat.SpeedKph(27.7778));

    [Fact]
    public void DefaultPresetRendersVariedContent()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.First(item => item.IsDefault);

            using var painter = new DashPainter(480, 480);
            var frame = new TelemetryFrame
            {
                Car = new CarState { Gear = 4, SpeedMetersPerSecond = 60, Rpm = 8200, MaxRpm = 9000, FuelLiters = 34, FuelPerLapLiters = 2.6f },
                Lap = new LapState { CurrentLapTime = 83.4, BestLapTime = 82.1, TargetLapTime = 82.5, Delta = -0.3, Sector = 2 },
            };
            var bitmap = painter.Render(layout, frame, runtime.Settings);

            var (visible, buckets) = Analyze(bitmap);
            Assert.True(visible > 480 * 480 / 20, $"Expected substantial rendered content, saw {visible} lit pixels.");
            Assert.True(buckets >= 8, $"Expected varied colours, found {buckets} buckets.");
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void EveryCatalogWidgetTypeRendersWithoutThrowing()
    {
        var frame = new TelemetryFrame();
        var settings = new AppSettings();

        foreach (var definition in DashWidgetCatalog.All)
        {
            var layout = new DashLayout
            {
                Id = $"single-{definition.Type}",
                GridCols = 20,
                GridRows = 12,
                Pages =
                [
                    new DashPage
                    {
                        Id = "p",
                        Name = "P",
                        Widgets = [new DashWidget { Id = "w", Type = definition.Type, Col = 0, Row = 0, ColSpan = 20, RowSpan = 12 }],
                    },
                ],
            };

            using var painter = new DashPainter(320, 240);
            var bitmap = painter.Render(layout, frame, settings);
            var (visible, _) = Analyze(bitmap);
            Assert.True(visible > 0, $"Widget '{definition.Type}' rendered no visible pixels.");
        }
    }

    [Fact]
    public void RedFlagPaintsBottomBanner()
    {
        var layout = SingleWidgetLayout("gear_speed");
        var frame = new TelemetryFrame { Flags = new RaceFlags { Red = true } };

        using var painter = new DashPainter(200, 200);
        var bitmap = painter.Render(layout, frame, new AppSettings());

        // The flag overlay paints a solid danger-coloured bar across the bottom rows.
        var midBottom = bitmap.GetPixel(100, 195);
        Assert.True(midBottom.Red > 150 && midBottom.Green < 120 && midBottom.Blue < 120,
            $"Expected a red flag banner at the bottom, saw {midBottom}.");
    }

    [Fact]
    public void RenderPngProducesValidPngHeader()
    {
        var layout = SingleWidgetLayout("lap_time");
        using var painter = new DashPainter(320, 192);
        var png = painter.RenderPng(layout, new TelemetryFrame(), new AppSettings());

        Assert.True(png.Length > 100);
        Assert.Equal(new byte[] { 137, 80, 78, 71 }, png.AsSpan(0, 4).ToArray());
    }

    [Fact]
    public void AlertTrackerFiresOnTcChangeAndExpires()
    {
        var now = DateTimeOffset.UnixEpoch;
        var tracker = new DashAlertTracker(() => now, durationSeconds: 1.5);
        var layout = new DashLayout
        {
            Id = "l",
            Alerts = [new DashAlert { Id = "a", Type = "tc_change" }],
        };
        var palette = DashPalette.Default;

        // First frame primes the previous-value baseline — no diff yet.
        Assert.Null(tracker.Evaluate(layout, new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 3 } }, palette));

        // TC changes → banner fires.
        var changed = new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 5 } };
        var banner = tracker.Evaluate(layout, changed, palette);
        Assert.NotNull(banner);
        Assert.Equal("TC1  5", banner!.Value.Text);

        // Still active before expiry.
        now = now.AddSeconds(1);
        Assert.NotNull(tracker.Evaluate(layout, changed, palette));

        // Past expiry with no further change → cleared.
        now = now.AddSeconds(1);
        Assert.Null(tracker.Evaluate(layout, changed, palette));
    }

    private static DashLayout SingleWidgetLayout(string type) => new()
    {
        Id = $"single-{type}",
        GridCols = 20,
        GridRows = 12,
        Pages =
        [
            new DashPage
            {
                Id = "p",
                Name = "P",
                Widgets = [new DashWidget { Id = "w", Type = type, Col = 0, Row = 0, ColSpan = 20, RowSpan = 12 }],
            },
        ],
    };

    private static (int Visible, int Buckets) Analyze(SKBitmap bitmap)
    {
        var pixels = bitmap.Pixels;
        var visible = 0;
        var buckets = new HashSet<int>();
        foreach (var p in pixels)
        {
            if (p.Red > 8 || p.Green > 8 || p.Blue > 8)
            {
                visible++;
                buckets.Add(((p.Red >> 5) << 6) | ((p.Green >> 5) << 3) | (p.Blue >> 5));
            }
        }

        return (visible, buckets.Count);
    }
}
