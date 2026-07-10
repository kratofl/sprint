using System.Runtime.InteropServices;
using Avalonia.Headless;
using Avalonia.Media.Imaging;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Hardware;
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
    [InlineData(59.9995, "1:00.000")]  // rounds up across the minute boundary, never ":60.000"
    [InlineData(119.9996, "2:00.000")]
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
    [InlineData(0, "--")]
    [InlineData(-1, "--")]
    [InlineData(1.234, "1.234")]
    [InlineData(0.5, "0.500")]
    public void FormatsRaceGap(double seconds, string expected) =>
        Assert.Equal(expected, DashFormat.Gap(seconds));

    [Theory]
    [InlineData(0, "--")]
    [InlineData(-5, "--")]
    [InlineData(165.4, "165.4")]
    public void FormatsTyrePressure(double kPa, string expected) =>
        Assert.Equal(expected, DashFormat.Pressure(kPa));

    [Fact]
    public void DefaultDashPaletteUsesCalmPrecisionGraphiteAndStatusTokens()
    {
        var palette = DashPalette.Default;

        AssertColor("#0B0B0D", palette.Background);
        AssertColor("#1B1B1E", palette.Surface);
        AssertColor("#12FFFFFF", palette.Border);
        AssertColor("#F5F5F7", palette.Foreground);
        AssertColor("#A1A1AA", palette.Secondary);
        AssertColor("#6F6F78", palette.Muted);
        AssertColor("#FF6A00", palette.Primary);
        AssertColor("#1F7FE6", palette.Accent);
        AssertColor("#16B566", palette.Success);
        AssertColor("#E0A30C", palette.Warning);
        AssertColor("#F02744", palette.Danger);
        AssertColor("#F02744", palette.RpmRed);
    }

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
    public void UnknownPageIdFallsBackToFirstPageInsteadOfBlank()
    {
        var layout = new DashLayout
        {
            Id = "fallback",
            GridCols = 20,
            GridRows = 12,
            Pages =
            [
                new DashPage
                {
                    Id = "first",
                    Name = "First",
                    Widgets =
                    [
                        new DashWidget
                        {
                            Id = "gear",
                            Type = "gear_speed",
                            Col = 0,
                            Row = 0,
                            ColSpan = 20,
                            RowSpan = 12
                        }
                    ]
                },
                new DashPage { Id = "second", Name = "Second" }
            ]
        };

        using var painter = new DashPainter(320, 192);
        var bitmap = painter.Render(
            layout,
            new TelemetryFrame { Car = new CarState { Gear = 3, SpeedMetersPerSecond = 50 } },
            new AppSettings(),
            pageId: "missing-page");

        var (visible, buckets) = Analyze(bitmap);
        Assert.True(visible > 320 * 192 / 20, $"Expected first-page fallback content, saw {visible} lit pixels.");
        Assert.True(buckets >= 3, $"Expected first-page fallback to render varied pixels, found {buckets} buckets.");
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
    public void StyleTextColorRecolorsWidgetValues()
    {
        var layout = SingleWidgetLayout("gear_speed");
        var frame = new TelemetryFrame { Car = new CarState { Gear = 4, SpeedMetersPerSecond = 50 } };

        using var plain = new DashPainter(200, 200);
        var defaultReds = CountRedDominant(plain.Render(layout, frame, new AppSettings()));

        layout.Pages[0].Widgets[0].Style = new DashWidgetStyle { TextColor = "red" };
        using var styled = new DashPainter(200, 200);
        var styledReds = CountRedDominant(styled.Render(layout, frame, new AppSettings()));

        // Default gear/speed values are white; the "red" text-colour override recolours them.
        Assert.True(styledReds > defaultReds + 50, $"Expected red-recoloured values; default={defaultReds}, styled={styledReds}.");
    }

    [Fact]
    public void FromThemeAppliesOverridesAndRedlineTracksDanger()
    {
        Assert.Same(DashPalette.Default, DashPalette.FromTheme(null));
        Assert.Same(DashPalette.Default, DashPalette.FromTheme(new DashTheme()));

        var themed = DashPalette.FromTheme(new DashTheme { Primary = "#16B566", Danger = "#123456" });
        AssertColor("#16B566", themed.Primary);
        AssertColor("#123456", themed.Danger);
        AssertColor("#123456", themed.RpmRed);  // redline follows the danger override
        AssertColor("#1F7FE6", themed.Accent);   // unset slots inherit the Graphite default
    }

    [Fact]
    public void LayoutThemeRecolorsRenderedValues()
    {
        var layout = SingleWidgetLayout("gear_speed");
        layout.Theme = new DashTheme { Foreground = "#16B566" }; // green values
        var frame = new TelemetryFrame { Car = new CarState { Gear = 4, SpeedMetersPerSecond = 50 } };

        using var painter = new DashPainter(200, 200, DashPalette.FromTheme(layout.Theme));
        var bitmap = painter.Render(layout, frame, new AppSettings());

        var greens = 0;
        foreach (var p in bitmap.Pixels)
        {
            if (p.Green > 120 && p.Red < 90 && p.Blue < 110)
            {
                greens++;
            }
        }

        Assert.True(greens > 50, $"Expected green-themed values, saw {greens} green pixels.");
    }

    [Fact]
    public void StyleBorderOverrideRemovesPanelOutline()
    {
        var layout = SingleWidgetLayout("tc"); // draws a panel outline by default
        var frame = new TelemetryFrame();

        using var bordered = new DashPainter(200, 200);
        var borderedEdge = bordered.Render(layout, frame, new AppSettings()).GetPixel(0, 100);

        layout.Pages[0].Widgets[0].Style = new DashWidgetStyle { Border = false };
        using var borderless = new DashPainter(200, 200);
        var borderlessEdge = borderless.Render(layout, frame, new AppSettings()).GetPixel(0, 100);

        Assert.True(Brightness(borderedEdge) > Brightness(borderlessEdge) + 15,
            $"Expected the outline to disappear when Border=off; bordered={borderedEdge}, borderless={borderlessEdge}.");
        Assert.True(Brightness(borderlessEdge) < 14, $"Expected a clean near-black edge with no outline, saw {borderlessEdge}.");
    }

    private static int CountRedDominant(SKBitmap bitmap)
    {
        var count = 0;
        foreach (var p in bitmap.Pixels)
        {
            if (p.Red > 120 && p.Green < 80 && p.Blue < 90)
            {
                count++;
            }
        }

        return count;
    }

    private static int Brightness(SKColor color) => Math.Max(color.Red, Math.Max(color.Green, color.Blue));

    [Fact]
    public void WidgetStackRendersDefaultLayerContent()
    {
        var layout = new DashLayout
        {
            Id = "stacked",
            GridCols = 20,
            GridRows = 12,
            Pages =
            [
                new DashPage
                {
                    Id = "p",
                    Name = "P",
                    WidgetStacks =
                    [
                        new DashWidgetStack
                        {
                            Id = "stk",
                            Name = "Stack",
                            Col = 0,
                            Row = 0,
                            ColSpan = 20,
                            RowSpan = 12,
                            DefaultLayerId = "l1",
                            Layers =
                            [
                                new DashWidgetStackLayer
                                {
                                    Id = "l1",
                                    Name = "L1",
                                    Widgets = [new DashWidget { Id = "g", Type = "gear_speed", Col = 0, Row = 0, ColSpan = 20, RowSpan = 12 }],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        using var painter = new DashPainter(200, 200);
        var bitmap = painter.Render(layout, new TelemetryFrame { Car = new CarState { Gear = 4, SpeedMetersPerSecond = 50 } }, new AppSettings());

        var (visible, _) = Analyze(bitmap);
        Assert.True(visible > 200 * 200 / 40, $"Expected the stack's default layer to render content, saw {visible} lit pixels.");
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
    public async Task DashImageRendererAndHardwareFrameSourceUseCanonicalDashPainterOutput()
    {
        // DashImageRenderer.Render builds a WriteableBitmap, which needs a live Avalonia
        // platform — dispatch the body through the headless session so this test is
        // self-sufficient rather than relying on another test to initialize the platform.
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashPainterTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            await session.Dispatch(() =>
            {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.Single(item => item.IsDefault);
            var frame = new TelemetryFrame
            {
                Car = new CarState
                {
                    Gear = 4,
                    SpeedMetersPerSecond = 34.2f,
                    Rpm = 6400,
                    MaxRpm = 8000,
                    FuelLiters = 41.2f,
                },
            };
            var palette = DashPalette.FromTheme(layout.Theme);

            using var painter = new DashPainter(320, 192, palette);
            var png = painter.RenderPng(layout, frame, runtime.Settings);

            Assert.True(png.Length > 1000);
            Assert.Equal(137, png[0]);
            Assert.Equal(80, png[1]);
            Assert.Equal(78, png[2]);
            Assert.Equal(71, png[3]);

            using var bitmap = DashImageRenderer.Render(layout, frame, runtime.Settings, 320, 192, palette: palette);
            Assert.Equal(320, bitmap.PixelSize.Width);
            Assert.Equal(192, bitmap.PixelSize.Height);

            painter.Render(layout, frame, runtime.Settings);

            // The on-screen editor bitmap must be the canonical painter's pixels,
            // not a re-styled or re-scaled approximation: byte-for-byte BGRA equality.
            var expectedBgra = painter.PixelSpanBgra.ToArray();
            Assert.Equal(expectedBgra, ReadBgra(bitmap));

            var expectedRgb565 = new byte[320 * 192 * 2];
            Rgb565.FromBgra(painter.PixelSpanBgra, 320, 192, rotation: 0, expectedRgb565);

            using var source = new DashPainterFrameSource(
                layout,
                runtime.Settings,
                new ScreenConfig { Width = 320, Height = 192, Rotation = 0, Margin = 0, OffsetX = 0, OffsetY = 0 },
                palette);
            var actualRgb565 = new byte[320 * 192 * 2];
            source.Render(frame, actualRgb565);

            Assert.Equal(expectedRgb565, actualRgb565);
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
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

    // Reads a WriteableBitmap's BGRA pixels into a tightly-packed buffer,
    // stripping any row-stride padding so it can be compared to painter output.
    private static byte[] ReadBgra(WriteableBitmap bitmap)
    {
        var width = bitmap.PixelSize.Width;
        var height = bitmap.PixelSize.Height;
        var rowBytes = width * 4;
        var result = new byte[rowBytes * height];
        using var buffer = bitmap.Lock();
        for (var y = 0; y < height; y++)
        {
            Marshal.Copy(buffer.Address + y * buffer.RowBytes, result, y * rowBytes, rowBytes);
        }

        return result;
    }

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

    private static void AssertColor(string expectedHex, SKColor actual)
    {
        var expected = SKColor.Parse(expectedHex);
        Assert.Equal(expected, actual);
    }
}
