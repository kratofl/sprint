using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Does one small overlay window actually hold a readable chart? Since 2026-08-07 the HUD is a
/// set of small windows rather than one stack, so the case that decides whether "small" is
/// usable is a single panel at a single window's size — including at the smallest size a driver
/// can drag it to.
/// </summary>
public sealed class LiveCompareHudRenderTests
{
    private const double TrackLength = 5000;

    [Fact]
    public void EveryHudPanelHasSomethingToDraw()
    {
        // A panel that resolves to Empty is a window of wasted space over the game.
        foreach (var chart in HudStack().Charts)
        {
            Assert.Equal(ChartPanelState.Ready, chart.State);
        }
    }

    [Fact]
    public void EveryHudWindowNamesBothLapsSoColourIsNeverTheOnlyKey()
    {
        // Throttle · You against Throttle · Target, per window. Identity never rests on colour
        // alone, and split into separate windows there is no shared legend to fall back on.
        foreach (var chart in HudStack().Charts)
        {
            Assert.Equal(2, chart.Series.Count);
            Assert.Contains(chart.Series, series => series.Name.EndsWith("You", StringComparison.Ordinal));
            Assert.Contains(chart.Series, series => series.Name.EndsWith("Target", StringComparison.Ordinal));
        }
    }

    /// <summary>
    /// One chart on its own over the set's shared domain — the way <c>CompareHudHost</c> slices
    /// the frame out for a window.
    /// </summary>
    private static ChartStack Single(ChartStack stack, ChartPanel chart) => new(stack.Domain, [chart]);

    /// <summary>The HUD as it actually runs: throttle, brake, speed over a rolling distance window.</summary>
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
