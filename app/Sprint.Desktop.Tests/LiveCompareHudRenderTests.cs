using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Does the HUD actually fit? The overlay is deliberately small, and three stacked charts inside
/// it is the case that decides whether "small" is usable or merely compact. Renders to
/// <c>artifacts/visual/</c> so it can be looked at rather than argued about.
/// </summary>
public sealed class LiveCompareHudRenderTests
{
    private const double TrackLength = 5000;

    /// <summary>The chart area a 460x340 overlay leaves after its header, notice room and padding.</summary>
    private const int SurfaceWidth = 436;
    private const int SurfaceHeight = 268;

    [Fact]
    public void ThreeChartsFitInsideTheDefaultOverlaySize()
    {
        var stack = HudStack();
        var layout = new ChartStackLayout(stack, SurfaceWidth, SurfaceHeight);

        Assert.Equal(3, stack.Charts.Count);
        Assert.True(
            layout.HasRoom,
            $"three charts do not fit in {SurfaceWidth}x{SurfaceHeight}; the default overlay is too small for its own panel set");
    }

    [Fact]
    public void EveryHudPanelHasSomethingToDraw()
    {
        // A panel that resolves to Empty is a band of wasted height over the game.
        foreach (var chart in HudStack().Charts)
        {
            Assert.Equal(ChartPanelState.Ready, chart.State);
        }
    }

    [Fact]
    public void TheOverlayRendersAtItsDefaultSizeForInspection()
    {
        var root = Path.Combine(
            TestEnv.RepoRoot, "app", "Sprint.Desktop.Tests", "artifacts", "visual");
        Directory.CreateDirectory(root);

        using var painter = new ChartStackPainter(SurfaceWidth, SurfaceHeight, ChartPalette.HudSurface);

        // No cursor: this is what a driver actually sees. The overlay is click-through while
        // locked, so no pointer ever enters it and the crosshair readouts never appear.
        var driving = new ChartStackController(HudStack());
        var png = painter.RenderPng(driving);
        File.WriteAllBytes(Path.Combine(root, "live-compare-hud-default.png"), png);

        // And with one, for the unlocked case where the driver is inspecting it by hand.
        var inspecting = new ChartStackController(HudStack());
        inspecting.MoveCursor(2500);
        File.WriteAllBytes(
            Path.Combine(root, "live-compare-hud-cursor.png"),
            painter.RenderPng(inspecting));

        Assert.True(png.Length > 1000, "the overlay rendered to an empty image");
    }

    /// <summary>The HUD as it actually runs: pedals, speed, gear over a rolling distance window.</summary>
    private static ChartStack HudStack()
    {
        var controller = new LiveCompareController();
        controller.SetTarget(
            new LiveCompareTarget(
                "hs-1",
                4,
                "Spa-Francorchamps · Lap 4 · 1:40.0",
                100,
                new LapHistoryContext
                {
                    Game = "Le Mans Ultimate",
                    TrackCourse = "Spa-Francorchamps",
                    CarModel = "Porsche 963",
                    TrackLengthMeters = TrackLength,
                }),
            Trace(braking: true));

        for (var position = 0.0; position <= 0.5; position += 0.002)
        {
            controller.Ingest(Frame(position));
        }

        return controller.Snapshot()!.Stack;
    }

    private static Sprint.Desktop.Api.Telemetry.TelemetryFrame Frame(double position) => new()
    {
        Session = new Sprint.Desktop.Api.Telemetry.SessionInfo
        {
            Game = "Le Mans Ultimate",
            Track = "Spa-Francorchamps",
            Car = "Porsche 963",
            TrackLengthMeters = TrackLength,
            InCar = true,
        },
        Car = new Sprint.Desktop.Api.Telemetry.CarState
        {
            // A braking zone around half distance, so the shapes are the ones a driver reads.
            SpeedMetersPerSecond = (float)(80 - (50 * Math.Exp(-Math.Pow((position - 0.5) * 40, 2)))),
            Throttle = (float)Math.Clamp(1 - Math.Exp(-Math.Pow((position - 0.5) * 30, 2)) * 1.2, 0, 1),
            Brake = (float)Math.Clamp(Math.Exp(-Math.Pow((position - 0.5) * 30, 2)), 0, 1),
            Gear = 6 - (int)(4 * Math.Exp(-Math.Pow((position - 0.5) * 30, 2))),
        },
        Lap = new Sprint.Desktop.Api.Telemetry.LapState
        {
            CurrentLap = 1,
            TrackPosition = (float)position,
            CurrentLapTime = (float)(position * 100),
        },
    };

    private static LapChannelTrace Trace(bool braking)
    {
        const int Count = 2501;
        var speed = new float[Count];
        var brake = new float[Count];
        var throttle = new float[Count];
        var gear = new float[Count];
        var elapsed = new float[Count];
        for (var i = 0; i < Count; i++)
        {
            var t = i / (double)(Count - 1);
            // The target brakes slightly later and carries more speed — the whole point of
            // having it on screen.
            var zone = braking ? Math.Exp(-Math.Pow((t - 0.52) * 30, 2)) : 0;
            speed[i] = (float)((80 - (45 * zone)) * 3.6);
            brake[i] = (float)Math.Clamp(zone, 0, 1);
            throttle[i] = (float)Math.Clamp(1 - (zone * 1.2), 0, 1);
            gear[i] = 6 - (int)(4 * zone);
            elapsed[i] = (float)(100 * t);
        }

        return new LapChannelTrace
        {
            PositionStep = 1.0 / (Count - 1),
            TrackLengthMeters = TrackLength,
            Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
            {
                [LapTraceChannels.SpeedKph] = speed,
                [LapTraceChannels.Brake] = brake,
                [LapTraceChannels.Throttle] = throttle,
                [LapTraceChannels.Gear] = gear,
                [LapTraceChannels.ElapsedSeconds] = elapsed,
            },
        };
    }
}
