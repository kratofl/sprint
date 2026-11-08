using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The Live Compare rolling window (#195). Avalonia-free, so the whole "what does the driver
/// see right now" question is a unit test.
/// </summary>
public sealed class LiveCompareControllerTests
{
    private const double TrackLength = 5000;

    [Fact]
    public void WithNoTargetThereIsNothingToDraw()
    {
        LiveCompareController controller = new LiveCompareController();

        controller.Ingest(Frame(position: 0.2));

        Assert.False(controller.HasTarget);
        Assert.Null(controller.Snapshot());
    }

    [Fact]
    public void ATargetWhoseTraceIsUnusableIsRefusedRatherThanHalfAccepted()
    {
        // Naming a lap the HUD cannot draw is worse than showing no target at all.
        LiveCompareController controller = new LiveCompareController();

        controller.SetTarget(Target(), new LapChannelTrace());

        Assert.False(controller.HasTarget);
        Assert.Null(controller.Target);
    }

    [Fact]
    public void ATargetAloneDrawsTheReferenceBeforeTheDriverHasTurnedAWheel()
    {
        LiveCompareController controller = Loaded();

        LiveCompareFrame? frame = controller.Snapshot();

        Assert.NotNull(frame);
        Assert.False(frame!.HasLiveLine);
        ChartPanel speed = Speed(frame.Stack);
        Assert.Single(speed.Series);
        Assert.Equal(ChartSeriesRole.Comparison, speed.Series[0].Role);
    }

    [Fact]
    public void TheHudAlwaysNamesTheLapItIsChasing()
    {
        // Spec §2.4: the wheel delta and the HUD can legitimately chase different laps, and
        // that disagreement must never be silent.
        LiveCompareController controller = Loaded();

        Assert.Equal("Practice · Lap 4 · 1:40.000", controller.Snapshot()!.TargetName);
    }

    [Fact]
    public void TheWindowFollowsTheCar()
    {
        LiveCompareController controller = Loaded();

        controller.Ingest(Frame(position: 0.5));
        ChartDomain mid = controller.Snapshot()!.Stack.Domain;
        controller.Ingest(Frame(position: 0.6));
        ChartDomain later = controller.Snapshot()!.Stack.Domain;

        // 200 m behind, 600 m ahead of 2500 m.
        Assert.Equal(2300, mid.Min, 1);
        Assert.Equal(3100, mid.Max, 1);
        Assert.True(later.Min > mid.Min);
    }

    [Fact]
    public void YourLineStopsAtTheCarAndTheTargetRunsOnAhead()
    {
        LiveCompareController controller = Loaded();

        Drive(controller, from: 0.0, to: 0.5);
        LiveCompareFrame frame = controller.Snapshot()!;

        Assert.True(frame.HasLiveLine);
        ChartPanel speed = Speed(frame.Stack);
        ChartSeries you = speed.Series.Single(series => series.Role == ChartSeriesRole.Current);
        ChartSeries target = speed.Series.Single(series => series.Role == ChartSeriesRole.Comparison);
        Assert.True(you.Samples[^1].X <= 2500 + 1);
        Assert.True(target.Samples[^1].X >= 3090);
    }

    [Fact]
    public void LeavingTheCarClearsTheLiveLineButKeepsTheTarget()
    {
        LiveCompareController controller = Loaded();
        Drive(controller, from: 0.0, to: 0.5);

        controller.Ingest(Frame(position: 0.5, inCar: false));

        Assert.True(controller.HasTarget);
        Assert.False(controller.Snapshot()!.HasLiveLine);
    }

    [Fact]
    public void ANewLapStartsTheLiveLineOverRatherThanSplicingTwoLaps()
    {
        LiveCompareController controller = Loaded();
        Drive(controller, from: 0.0, to: 0.9);

        // Across the line: position wraps and the lap number increments.
        controller.Ingest(Frame(position: 0.01, lap: 2));
        ChartSeries? you = Speed(controller.Snapshot()!.Stack).Series
            .SingleOrDefault(series => series.Role == ChartSeriesRole.Current);

        // One sample is not a line; the previous lap's shape must not survive the wrap.
        Assert.Null(you);
    }

    [Fact]
    public void TheDeltaIsReadFromTheTargetsOwnElapsedTimeChannel()
    {
        // The target lap is linear to 100 s, so at half distance it had taken 50 s. The driver
        // arrives at 47 s, three seconds up.
        LiveCompareController controller = Loaded();

        controller.Ingest(Frame(position: 0.5, lapTime: 47));

        Assert.Equal(-3.0, controller.Delta()!.Value, 1);
    }

    [Fact]
    public void TheDeltaIsUnknownBeforeTheDriverHasBeenSeen()
    {
        Assert.Null(Loaded().Delta());
    }

    [Fact]
    public void TheWindowSizesAreSettings()
    {
        LiveCompareController controller = Loaded();
        controller.MetersBehind = 50;
        controller.MetersAhead = 100;

        controller.Ingest(Frame(position: 0.5));

        ChartDomain domain = controller.Snapshot()!.Stack.Domain;
        Assert.Equal(2450, domain.Min, 1);
        Assert.Equal(2600, domain.Max, 1);
    }

    [Fact]
    public void ThePanelSetIsConfigurable()
    {
        LiveCompareController controller = Loaded();
        controller.Panels = [LapChartPanels.Gear];

        Assert.Equal("Gear", Assert.Single(controller.Snapshot()!.Stack.Charts).Title);
    }

    [Fact]
    public void PastTheLineTheTargetKeepsDrawingIntoTheNextLap()
    {
        // 100 m short of the line looking 600 ahead: the driver needs the corner after the
        // line, and the target has it.
        LiveCompareController controller = Loaded();

        controller.Ingest(Frame(position: 0.98));
        LiveCompareFrame frame = controller.Snapshot()!;

        ChartSeries target = Speed(frame.Stack).Series.Single(s => s.Role == ChartSeriesRole.Comparison);
        Assert.Contains(target.Samples, sample => sample.X > TrackLength);
    }

    /// <summary>The speed panel by title, so a change of default panel order cannot break these.</summary>
    private static ChartPanel Speed(ChartStack stack) =>
        stack.Charts.Single(chart => chart.Title == "Speed");

    private static LiveCompareController Loaded()
    {
        LiveCompareController controller = new LiveCompareController();
        controller.SetTarget(Target(), TargetTrace());
        return controller;
    }

    private static LiveCompareTarget Target() => new(
        "hs-1",
        4,
        "Practice · Lap 4 · 1:40.000",
        100,
        new LapHistoryContext
        {
            Game = "Le Mans Ultimate",
            TrackCourse = "Spa-Francorchamps",
            CarModel = "Porsche 963",
            TrackLengthMeters = TrackLength,
        });

    private static void Drive(LiveCompareController controller, double from, double to)
    {
        for (double position = from; position <= to + 1e-9; position += 0.002)
        {
            controller.Ingest(Frame(position: position, lapTime: position * 100));
        }
    }

    private static TelemetryFrame Frame(
        double position,
        int lap = 1,
        double lapTime = 0,
        bool inCar = true) => new()
        {
            Session = new SessionInfo
            {
                Game = "Le Mans Ultimate",
                Track = "Spa-Francorchamps",
                Car = "Porsche 963",
                TrackLengthMeters = TrackLength,
                InCar = inCar,
            },
            Car = new CarState
            {
                SpeedMetersPerSecond = (float)(40 + (30 * position)),
                Throttle = (float)(1 - position),
                Brake = (float)position,
                Gear = 4,
            },
            Lap = new LapState
            {
                CurrentLap = lap,
                TrackPosition = (float)position,
                CurrentLapTime = lapTime,
            },
        };

    /// <summary>A whole reference lap on a 1 m grid, linear to 100 s.</summary>
    private static LapChannelTrace TargetTrace()
    {
        const int count = 5001;
        float[] speed = new float[count];
        float[] brake = new float[count];
        float[] throttle = new float[count];
        float[] gear = new float[count];
        float[] elapsed = new float[count];
        for (int i = 0; i < count; i++)
        {
            double t = i / (double)(count - 1);
            speed[i] = (float)(120 + (180 * t));
            brake[i] = (float)t;
            throttle[i] = (float)(1 - t);
            gear[i] = 4;
            elapsed[i] = (float)(100 * t);
        }

        return new LapChannelTrace
        {
            PositionStep = 1.0 / (count - 1),
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
