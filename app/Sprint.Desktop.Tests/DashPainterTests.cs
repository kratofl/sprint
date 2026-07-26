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
    public void FunctionalDashPaletteUsesRealRacingSemanticsInsteadOfBrandOrange()
    {
        var palette = DashPalette.Default;

        AssertColor("#08080A", palette.Background);
        AssertColor("#1B1B1E", palette.Surface);
        AssertColor("#1FFFFFFF", palette.Border);
        AssertColor("#F5F5F7", palette.Foreground);
        AssertColor("#A1A1AA", palette.Secondary);
        AssertColor("#6F6F78", palette.Muted);
        AssertColor("#F5F5F7", palette.Primary);
        AssertColor("#1F7FE6", palette.Accent);
        AssertColor("#16B566", palette.Success);
        AssertColor("#FF6A00", palette.Warning);
        AssertColor("#F02744", palette.Danger);
        AssertColor("#E0A30C", palette.RaceControlYellow);
        AssertColor("#16B566", palette.RpmNormal);
        AssertColor("#F02744", palette.RpmNearLimit);
        AssertColor("#1F7FE6", palette.RpmShift);
    }

    [Fact]
    public void FunctionalRpmBarRendersGreenRedAndBlueShiftStages()
    {
        using var painter = new DashPainter(480, 48);
        var bitmap = painter.Render(
            SingleWidgetLayout("rpm_bar"),
            new TelemetryFrame
            {
                Car = new CarState { Rpm = 8850, MaxRpm = 9000 },
            },
            new AppSettings());

        Assert.True(CountExact(bitmap, DashPalette.Default.RpmNormal) > 0, "Expected green running RPM stages.");
        Assert.True(CountExact(bitmap, DashPalette.Default.RpmNearLimit) > 0, "Expected red near-limit RPM stages.");
        Assert.True(CountExact(bitmap, DashPalette.Default.RpmShift) > 0, "Expected blue shift RPM stages.");
        Assert.Equal(0, CountExact(bitmap, SKColor.Parse(Graphite.AccentHex)));
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
    public void StyledConditionOverridesRemainNamedWhileSafetyStatesStayProtected()
    {
        Assert.Same(DashPalette.Default, DashPalette.FromTheme(null));
        Assert.Same(DashPalette.Default, DashPalette.FromTheme(new DashTheme()));

        var themed = DashPalette.FromTheme(new DashTheme
        {
            Neutral = "#DADADA",
            GoodOnTarget = "#10A050",
            ColdLow = "#2255AA",
            AssistActive = "#3377CC",
            Warning = "#B06010",
            Critical = "#123456",
            Fault = "#654321",
            TimingFastestOverall = "#BB66FF",
            TimingPersonalBest = "#22BB66",
        }, DashColorSystem.Styled);

        AssertColor("#DADADA", themed.Neutral);
        AssertColor("#10A050", themed.GoodOnTarget);
        AssertColor("#2255AA", themed.ColdLow);
        AssertColor("#3377CC", themed.AssistActive);
        AssertColor("#B06010", themed.Warning);
        AssertColor("#F02744", themed.Critical);
        AssertColor("#F02744", themed.Fault);
        AssertColor("#BB66FF", themed.TimingFastestOverall);
        AssertColor("#22BB66", themed.TimingPersonalBest);
        AssertColor("#F02744", themed.RpmNearLimit);
    }

    [Fact]
    public void WheelWidgetsRenderNamedRacingConditionsInsteadOfLegacyGenericAliases()
    {
        var neutral = SKColor.Parse("#DCDCDC");
        var coldLow = SKColor.Parse("#26C6DA");
        var assistActive = SKColor.Parse("#42A5F5");
        var fastest = SKColor.Parse("#AB47BC");
        var personalBest = SKColor.Parse("#66BB6A");
        var palette = DashPalette.Default with
        {
            Foreground = SKColors.Brown,
            Accent = SKColors.Pink,
            Success = SKColors.Lime,
            Danger = SKColors.Maroon,
            Neutral = neutral,
            ColdLow = coldLow,
            AssistActive = assistActive,
            TimingFastestOverall = fastest,
            TimingPersonalBest = personalBest,
        };

        using var tcPainter = new DashPainter(320, 240, palette);
        var tc = tcPainter.Render(
            SingleWidgetLayout("tc"),
            new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 4, TractionControlActive = true } },
            new AppSettings());
        Assert.True(CountExact(tc, assistActive) > 0, "Expected active TC to use AssistActive.");

        using var tirePainter = new DashPainter(320, 240, palette);
        var tires = tirePainter.Render(
            SingleWidgetLayout("tyre_temp"),
            new TelemetryFrame
            {
                Tires = Enum.GetValues<TirePosition>()
                    .Select(position => new TireState { Position = position, TempCoreCelsius = 30 })
                    .ToArray(),
            },
            new AppSettings());
        Assert.True(CountExact(tires, coldLow) > 0, "Expected under-range tyres to use ColdLow.");

        using var timingPainter = new DashPainter(320, 240, palette);
        var timing = timingPainter.Render(
            SingleWidgetLayout("lap_time"),
            new TelemetryFrame { Lap = new LapState { CurrentLapTime = 81, LastLapTime = 82, BestLapTime = 80 } },
            new AppSettings());
        Assert.True(CountExact(timing, neutral) > 0, "Expected ordinary timing values to use Neutral.");
        Assert.True(CountExact(timing, fastest) > 0, "Expected best timing to use fastest-overall purple.");

        using var deltaPainter = new DashPainter(320, 240, palette);
        var delta = deltaPainter.Render(
            SingleWidgetLayout("delta"),
            new TelemetryFrame { Lap = new LapState { TargetLapTime = 80, Delta = -0.2 } },
            new AppSettings());
        Assert.True(CountExact(delta, personalBest) > 0, "Expected an improving comparison to use personal-best green.");

        using var energyPainter = new DashPainter(320, 240, palette);
        var energy = energyPainter.Render(
            SingleWidgetLayout("virtual_energy"),
            new TelemetryFrame { Energy = new EnergyState { VirtualEnergy = 68, DeployPower = 92 } },
            new AppSettings());
        Assert.True(CountExact(energy, neutral) > 0, "Expected ordinary virtual-energy value to remain Neutral.");
        Assert.Equal(0, CountExact(energy, SKColors.Pink));
    }

    [Fact]
    public void RaceControlRenderingPreservesLiteralSignalColorAcrossStyledPalettes()
    {
        var palette = DashPalette.Default with
        {
            Warning = SKColors.Magenta,
            Danger = SKColors.Cyan,
            Success = SKColors.Blue,
        };
        using var painter = new DashPainter(320, 240, palette);
        var bitmap = painter.Render(
            SingleWidgetLayout("flag"),
            new TelemetryFrame { Flags = new RaceFlags { Yellow = true } },
            new AppSettings());

        Assert.True(CountExact(bitmap, DashPalette.Default.RaceControlYellow) > 0, "Expected literal yellow race-control signal.");
        Assert.Equal(0, CountExact(bitmap, SKColors.Magenta));
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
    public void InstrumentWidgetsUseAnOutlineWithoutFillingTheGraphiteCanvas()
    {
        var layout = SingleWidgetLayout("gear_speed");
        var frame = new TelemetryFrame();

        using var framed = new DashPainter(200, 200);
        var framedBitmap = framed.Render(layout, frame, new AppSettings());
        var framedEdge = framedBitmap.GetPixel(2, 100);
        var framedInterior = framedBitmap.GetPixel(12, 100);

        layout.Pages[0].Widgets[0].Style = new DashWidgetStyle { Border = false };
        using var unframed = new DashPainter(200, 200);
        var unframedEdge = unframed.Render(layout, frame, new AppSettings()).GetPixel(2, 100);

        Assert.True(Brightness(framedEdge) > Brightness(unframedEdge) + 20,
            $"Expected a restrained default instrument outline; framed={framedEdge}, unframed={unframedEdge}.");
        Assert.Equal(DashPalette.Default.Background, framedInterior);
    }

    [Theory]
    [InlineData("rpm_bar")]
    [InlineData("header")]
    [InlineData("text")]
    [InlineData("delta")]
    [InlineData("tc")]
    [InlineData("abs")]
    [InlineData("engine_map")]
    [InlineData("brake_bias")]
    [InlineData("fuel_target")]
    [InlineData("position")]
    [InlineData("predictive_lap")]
    [InlineData("virtual_energy")]
    public void ContinuousSurfaceWidgetsRemainUnframedByDefault(string type)
    {
        var layout = SingleWidgetLayout(type);
        using var painter = new DashPainter(200, 200);
        var edge = painter.Render(layout, new TelemetryFrame(), new AppSettings()).GetPixel(2, 100);

        Assert.Equal(DashPalette.Default.Background, edge);
    }

    [Fact]
    public void ExplicitBorderCanFrameAContinuousSurfaceWidget()
    {
        var layout = SingleWidgetLayout("text");
        layout.Pages[0].Widgets[0].Style = new DashWidgetStyle { Border = true };
        using var painter = new DashPainter(200, 200);
        var edge = painter.Render(layout, new TelemetryFrame(), new AppSettings()).GetPixel(2, 100);

        Assert.True(Brightness(edge) > 20, $"Expected an explicit text-widget outline, saw {edge}.");
    }

    [Fact]
    public void DefaultPresetUsesAUsefulDriverFirstHierarchy()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.DashLayouts.Single(item => item.IsDefault);
            var page = layout.Pages.Single(item => item.Id == "driving-default");
            var widgets = page.Widgets.ToDictionary(widget => widget.Type);

            Assert.True(DashLayoutValidator.IsValid(layout));
            Assert.Equal(["Driving", "Endurance", "Timing", "Vehicle"], layout.Pages.Select(item => item.Name).ToArray());
            Assert.Equal(page.Widgets.Count, page.Widgets.Select(widget => widget.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count());
            Assert.Equal(
                new[] { "abs", "brake_bias", "delta", "engine_map", "fuel", "gear_speed", "input_trace", "lap_time", "position", "rpm_bar", "sector", "tc" },
                widgets.Keys.OrderBy(type => type, StringComparer.Ordinal).ToArray());

            Assert.Equal((0, 0, 20, 1), Position(widgets["rpm_bar"]));
            Assert.Equal((5, 3, 10, 9), Position(widgets["gear_speed"]));
            Assert.Equal((0, 3, 5, 6), Position(widgets["lap_time"]));
            Assert.Equal((15, 3, 5, 6), Position(widgets["sector"]));
            Assert.Equal((0, 9, 5, 3), Position(widgets["delta"]));
            Assert.Equal((15, 9, 5, 3), Position(widgets["input_trace"]));
            Assert.All(["gear_speed", "lap_time", "sector", "input_trace"],
                type => Assert.False(widgets[type].Style?.Border ?? true, $"Expected {type} to remain open on the continuous instrument surface."));
            Assert.All(["tc", "abs", "engine_map", "brake_bias", "fuel", "position"],
                type => Assert.Equal(1, widgets[type].Row));

            Assert.Equal("auto", layout.AlertConfig?.ColorToken);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static (int Col, int Row, int ColSpan, int RowSpan) Position(DashWidget widget) =>
        (widget.Col, widget.Row, widget.ColSpan, widget.RowSpan);

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
        Assert.Equal("TRACTION CONTROL", banner!.Value.Title);
        Assert.Equal("5", banner.Value.Value);

        // Still active before expiry.
        now = now.AddSeconds(1);
        Assert.NotNull(tracker.Evaluate(layout, changed, palette));

        // Past expiry with no further change → cleared.
        now = now.AddSeconds(1);
        Assert.Null(tracker.Evaluate(layout, changed, palette));
    }

    [Fact]
    public void AlertTrackerUsesTheSuzukiThemeColor()
    {
        var tracker = new DashAlertTracker();
        var layout = new DashLayout
        {
            Id = "suzuki-alert",
            AlertConfig = new DashAlertConfig { ColorToken = "suzuki" },
            Alerts = [new DashAlert { Id = "tc", Type = "tc_change" }],
        };
        var icePalette = DashPalette.FromTheme(
            DashThemePresets.All.Single(preset => preset.Name == "Ice").Theme,
            DashColorSystem.Styled);
        tracker.Evaluate(
            layout,
            new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 3 } },
            icePalette);

        var banner = tracker.Evaluate(
            layout,
            new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 4 } },
            icePalette);

        Assert.NotNull(banner);
        Assert.Equal(SkiaSharp.SKColor.Parse(Graphite.DashThemeSuzukiPrimaryHex), banner.Value.Color);
    }

    [Fact]
    public void AdjustmentAlertsRemainStableEvenWhenLegacyConfigurationRequestsInversion()
    {
        var tracker = new DashAlertTracker();
        var layout = new DashLayout
        {
            Id = "stable-adjustment",
            AlertConfig = new DashAlertConfig { InvertColors = true },
            Alerts = [new DashAlert { Id = "tc", Type = "tc_change" }],
        };
        var palette = DashPalette.Default;
        tracker.Evaluate(layout, new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 3 } }, palette);

        var banner = tracker.Evaluate(
            layout,
            new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 4 } },
            palette);

        Assert.NotNull(banner);
        Assert.Equal(DashCondition.AssistActive, banner.Value.Condition);
        Assert.False(banner.Value.InvertColors);
    }

    [Fact]
    public void CriticalInversionIsBoundedToTwoHertzAndStopsWithTheCondition()
    {
        Assert.False(DashAttention.IsInverted(DashCondition.Critical, requested: true, TimeSpan.Zero));
        Assert.False(DashAttention.IsInverted(DashCondition.Critical, requested: true, TimeSpan.FromMilliseconds(249)));
        Assert.True(DashAttention.IsInverted(DashCondition.Critical, requested: true, TimeSpan.FromMilliseconds(250)));
        Assert.True(DashAttention.IsInverted(DashCondition.Critical, requested: true, TimeSpan.FromMilliseconds(499)));
        Assert.False(DashAttention.IsInverted(DashCondition.Critical, requested: true, TimeSpan.FromMilliseconds(500)));
        Assert.False(DashAttention.IsInverted(DashCondition.Warning, requested: true, TimeSpan.FromMilliseconds(250)));
        Assert.False(DashAttention.IsInverted(DashCondition.Critical, requested: false, TimeSpan.FromMilliseconds(250)));
    }

    [Fact]
    public void AlertOverlayRespectsAuthoredGeometry()
    {
        var layout = SingleWidgetLayout("gear_speed");
        using var painter = new DashPainter(400, 240);
        var banner = new DashAlertBanner("ABS", "4", DashPalette.Default.Warning, 10, 0, 10, 6);
        var bitmap = painter.Render(layout, new TelemetryFrame(), new AppSettings(), banner: banner);

        Assert.Equal(DashPalette.Default.Background, bitmap.GetPixel(20, 20));
        Assert.NotEqual(DashPalette.Default.Background, bitmap.GetPixel(300, 2));
    }

    [Fact]
    public void HardwareFrameSourceTriggersConfiguredAlertFromTelemetryChange()
    {
        var layout = new DashLayout
        {
            Id = "alert-hardware",
            GridCols = 20,
            GridRows = 12,
            Pages = [new DashPage { Id = "main", Name = "Main" }],
            Alerts = [new DashAlert { Id = "tc", Type = "tc_change", Col = 5, Row = 3, ColSpan = 10, RowSpan = 6 }],
        };
        var config = new ScreenConfig { Width = 200, Height = 120 };
        using var source = new DashPainterFrameSource(layout, new AppSettings(), config);
        var baseline = new byte[200 * 120 * 2];
        var alerted = new byte[baseline.Length];

        source.Render(new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 3 } }, baseline);
        source.Render(new TelemetryFrame { Electronics = new ElectronicsState { TractionControl = 5 } }, alerted);

        Assert.True(baseline.Zip(alerted).Count(pair => pair.First != pair.Second) > 100,
            "Expected the telemetry change to produce a visible alert in the hardware frame.");
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

    private static int CountExact(SKBitmap bitmap, SKColor color) =>
        bitmap.Pixels.Count(pixel => pixel == color);
}
