using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The shared trace-to-stack builder (#195, #196). Both the Live Compare HUD and the Analysis
/// view render through this, so it is the one place that decides how a stored lap becomes
/// chart series.
/// </summary>
public sealed class LapTraceChartsTests
{
    private const double TrackLength = 5000;

    [Fact]
    public void TheDistanceDomainReadsInMetres()
    {
        var domain = ChartDomain.TrackDistance(-200, 600);

        Assert.Equal(ChartDomainKind.TrackDistance, domain.Kind);
        Assert.Equal("Distance", domain.AxisLabel);
        Assert.Equal("Track distance", domain.Label);
        Assert.Equal("450 m", domain.Format(450));
        // Behind the car is negative, and saying so is honest — that stretch is already driven.
        Assert.Equal("-200 m", domain.Format(-200));
    }

    [Fact]
    public void OneLapIsDrawnInEmberAndTheComparisonInBlue()
    {
        var stack = LapTraceCharts.Build(
            LapChartPanels.HudDefaults,
            ChartDomain.TrackPosition(),
            [Source("You", ChartSeriesRole.Current), Source("Target", ChartSeriesRole.Comparison)]);

        // Pedals lead the HUD stack: that is the reading a driver shapes against a reference.
        Assert.Equal(["Throttle & brake", "Speed", "Gear"], stack.Charts.Select(chart => chart.Title));

        var speed = stack.Charts.Single(chart => chart.Title == "Speed");
        Assert.Equal(2, speed.Series.Count);
        Assert.Equal(ChartSeriesRole.Current, speed.Series[0].Role);
        Assert.Equal(ChartSeriesRole.Comparison, speed.Series[1].Role);
    }

    [Fact]
    public void TwoLapsNameTheirSeriesAndOneLapDoesNot()
    {
        var pair = LapTraceCharts.Build(
            [LapChartPanels.Speed],
            ChartDomain.TrackPosition(),
            [Source("You", ChartSeriesRole.Current), Source("Lap 7", ChartSeriesRole.Comparison)]);
        var single = LapTraceCharts.Build(
            [LapChartPanels.Speed],
            ChartDomain.TrackPosition(),
            [Source("You", ChartSeriesRole.Current)]);

        Assert.Equal("Speed · You", pair.Charts[0].Series[0].Name);
        Assert.Equal("Speed · Lap 7", pair.Charts[0].Series[1].Name);
        // With nothing to tell apart, the lap's name is noise.
        Assert.Equal("Speed", single.Charts[0].Series[0].Name);
    }

    [Fact]
    public void OnlyBrakeIsFilledSoColourStaysFreeToMeanWhoseLapItIs()
    {
        var stack = LapTraceCharts.Build(
            [LapChartPanels.Pedals],
            ChartDomain.TrackPosition(),
            [Source("You", ChartSeriesRole.Current)]);

        var pedals = stack.Charts[0];
        Assert.Equal("Brake", pedals.Series[0].Name);
        Assert.True(pedals.Series[0].FillArea);
        Assert.Equal("Throttle", pedals.Series[1].Name);
        Assert.False(pedals.Series[1].FillArea);
        // Both belong to the same lap, so both carry that lap's colour.
        Assert.All(pedals.Series, series => Assert.Equal(ChartSeriesRole.Current, series.Role));
    }

    [Fact]
    public void PedalsAreShownAsPercentagesNotAsFractions()
    {
        // Stored 0–1 because that is what the game reports; a driver reads a percentage.
        var stack = LapTraceCharts.Build(
            [LapChartPanels.Pedals],
            ChartDomain.TrackPosition(),
            [Source("You", ChartSeriesRole.Current)]);

        var brake = stack.Charts[0].Series[0];
        Assert.All(brake.Samples, sample => Assert.InRange(sample.Y, 0, 100));
        Assert.Contains(brake.Samples, sample => sample.Y > 1.5);
    }

    [Fact]
    public void YourLineStopsAtTheCarWhileTheTargetRunsOnAhead()
    {
        // The asymmetry the HUD is built around: you cannot draw a future you have not driven.
        var domain = ChartDomain.TrackDistance(1000, 2000);
        var stack = LapTraceCharts.Build(
            [LapChartPanels.Speed],
            domain,
            [
                Source("You", ChartSeriesRole.Current, upTo: 1400),
                Source("Target", ChartSeriesRole.Comparison),
            ]);

        var you = stack.Charts[0].Series[0];
        var target = stack.Charts[0].Series[1];
        Assert.True(you.Samples[^1].X <= 1400);
        Assert.True(target.Samples[^1].X >= 1990);
    }

    [Fact]
    public void TheTargetWrapsPastTheStartFinishLineSoTheWindowKeepsScrolling()
    {
        // 300 m short of the line, looking 600 m ahead: the far half of the window is the next
        // lap's opening metres, and the target has them on disk.
        var domain = ChartDomain.TrackDistance(TrackLength - 300, TrackLength + 300);
        var stack = LapTraceCharts.Build(
            [LapChartPanels.Speed],
            domain,
            [Source("Target", ChartSeriesRole.Comparison)]);

        var target = stack.Charts[0].Series[0];
        Assert.Contains(target.Samples, sample => sample.X > TrackLength);
        // Unwrapped X, so the line is continuous across the line rather than jumping back.
        Assert.Equal(target.Samples.OrderBy(sample => sample.X), target.Samples);
    }

    [Fact]
    public void AChannelTheTraceNeverCarriedYieldsAnEmptyPanelNotAFlatZeroLine()
    {
        var bare = new LapChannelTrace
        {
            PositionStep = 0.001,
            TrackLengthMeters = TrackLength,
            Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
            {
                [LapTraceChannels.SpeedKph] = [100f, 200f, 300f],
            },
        };

        var stack = LapTraceCharts.Build(
            [LapChartPanels.Speed, LapChartPanels.Gear],
            ChartDomain.TrackPosition(),
            [new LapTraceSeriesSource(bare, TrackLength, "You", ChartSeriesRole.Current)]);

        Assert.Equal(ChartPanelState.Ready, stack.Charts[0].State);
        Assert.Equal(ChartPanelState.Empty, stack.Charts[1].State);
        Assert.Empty(stack.Charts[1].Series);
    }

    [Fact]
    public void GearIsSteppedBecauseTheCarHasNoRatioBetweenThirdAndFourth()
    {
        var stack = LapTraceCharts.Build(
            [LapChartPanels.Gear],
            ChartDomain.TrackPosition(),
            [Source("You", ChartSeriesRole.Current)]);

        Assert.Equal(ChartInterpolation.Stepped, stack.Charts[0].Series[0].Interpolation);
    }

    [Fact]
    public void AnUnknownPanelIdFallsBackRatherThanLeavingTheDriverAnEmptyStack()
    {
        // A panel set stored by a later build must not blank the HUD.
        Assert.Equal(
            LapChartPanels.HudDefaults,
            LapChartPanels.Resolve(["nonsense"], LapChartPanels.HudDefaults));
        Assert.Equal(
            [LapChartPanels.Gear],
            LapChartPanels.Resolve(["gear"], LapChartPanels.HudDefaults));
    }

    private static LapTraceSeriesSource Source(string label, ChartSeriesRole role, double? upTo = null) =>
        new(Trace(), TrackLength, label, role, upTo);

    /// <summary>
    /// A synthetic lap on a 1 m grid: speed ramps 100 → 300, brake ramps 0 → 1, throttle falls
    /// 1 → 0, steering ramps −1 → 1, gear climbs 1 → 8.
    /// </summary>
    private static LapChannelTrace Trace()
    {
        const int Count = 5001;
        var speed = new float[Count];
        var brake = new float[Count];
        var throttle = new float[Count];
        var steering = new float[Count];
        var gear = new float[Count];
        for (var i = 0; i < Count; i++)
        {
            var t = i / (double)(Count - 1);
            speed[i] = (float)(100 + (200 * t));
            brake[i] = (float)t;
            throttle[i] = (float)(1 - t);
            steering[i] = (float)((2 * t) - 1);
            gear[i] = 1 + (int)(t * 7);
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
                [LapTraceChannels.Steering] = steering,
                [LapTraceChannels.Gear] = gear,
            },
        };
    }
}
