using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for the per-lap channel trace (#194). The trace is the second,
/// richer tier beside <see cref="LapReferenceCurve"/>: a position grid sized in metres rather
/// than in lap fractions, carrying named channels.
/// </summary>
public sealed class LapChannelTraceTests
{
    [Theory]
    [InlineData(13626.0)] // Le Mans
    [InlineData(7004.0)]  // Spa
    [InlineData(4259.0)]  // Zandvoort
    public void TheGridLandsNearTwoMetresWhateverTheTrackLength(double trackLengthMeters)
    {
        var step = LapChannelTrace.StepForTrackLength(trackLengthMeters);

        var metresPerSample = step * trackLengthMeters;
        Assert.InRange(metresPerSample, 1.5, 5.0);
    }

    [Fact]
    public void AnUnknownTrackLengthStillYieldsADefensibleGrid()
    {
        var step = LapChannelTrace.StepForTrackLength(null);

        Assert.True(step > 0);
        // A typical GP circuit under the fallback assumption still lands in the band.
        Assert.InRange(step * 5000.0, 1.5, 5.0);
    }

    [Fact]
    public void AbsurdTrackLengthsAreClampedToASaneSampleCount()
    {
        // A 200 m karting loop and a 200 km fantasy layout must not produce two samples
        // or two million; the grid is a storage ceiling as much as a resolution.
        foreach (var length in new[] { 200.0, 200_000.0 })
        {
            var count = (int)Math.Round(1.0 / LapChannelTrace.StepForTrackLength(length)) + 1;
            Assert.InRange(count, LapChannelTrace.MinSamples, LapChannelTrace.MaxSamples);
        }
    }

    [Fact]
    public void EveryDefaultChannelIsCapturedOnTheSharedGrid()
    {
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        foreach (var name in LapTraceChannels.Default)
        {
            Assert.True(trace!.TryGetChannel(name, out var values), $"missing channel {name}");
            Assert.Equal(trace.SampleCount, values.Length);
        }
    }

    [Fact]
    public void ChannelsAreInterpolatedOntoTheGridAndReadBackByPosition()
    {
        // Speed ramps linearly 100 -> 300 across the lap, so any position reads back its ramp.
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.Equal(200.0, trace!.ValueAt(LapTraceChannels.SpeedKph, 0.5)!.Value, 1);
        Assert.Equal(100.0, trace.ValueAt(LapTraceChannels.SpeedKph, 0.0)!.Value, 1);
    }

    [Fact]
    public void AnAbsentChannelReadsAsUnknownRatherThanZero()
    {
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.Null(trace!.ValueAt("tyreTempFl", 0.5));
    }

    [Fact]
    public void TheLapTimeAtTheLineIsTheLapsOwnTime()
    {
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.True(trace!.TryGetChannel(LapTraceChannels.ElapsedSeconds, out var elapsed));
        Assert.Equal(90.0, elapsed[^1], 2);
    }

    [Fact]
    public void GearIsCarriedWithoutRoundingToTheWrongRatio()
    {
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.True(trace!.TryGetChannel(LapTraceChannels.Gear, out var gears));
        Assert.All(gears, gear => Assert.Equal(Math.Round(gear), gear));
    }

    [Fact]
    public void APartialLapProducesNoTraceRatherThanAMisleadingOne()
    {
        // Joined at half distance: the same guard the reference curve applies.
        var late = FullLap().Where(sample => sample.Position >= 0.5).ToList();

        Assert.Null(LapChannelTrace.FromSamples(late, 90.0, 5000.0));
    }

    [Fact]
    public void AHoleInTheMiddleOfTheLapProducesNoTrace()
    {
        var holed = FullLap().Where(sample => sample.Position is < 0.3 or > 0.6).ToList();

        Assert.Null(LapChannelTrace.FromSamples(holed, 90.0, 5000.0));
    }

    [Fact]
    public void ALapWithNoCompletedTimeProducesNoTrace()
    {
        Assert.Null(LapChannelTrace.FromSamples(FullLap(), 0.0, 5000.0));
    }

    [Fact]
    public void TheGuardsMatchTheReferenceCurveSoTheTwoTiersNeverDisagree()
    {
        // A lap the curve accepts must produce a trace, and one it rejects must not: a lap
        // that has a curve but no trace, or the reverse, is a tier the UI cannot explain.
        var samples = FullLap();
        var positionsAndTimes = samples
            .Select(sample => (sample.Position, sample.ElapsedSeconds))
            .ToList();

        Assert.NotNull(LapReferenceCurve.FromSamples(positionsAndTimes, 90.0));
        Assert.NotNull(LapChannelTrace.FromSamples(samples, 90.0, 5000.0));

        var late = samples.Where(sample => sample.Position >= 0.5).ToList();
        var latePositionsAndTimes = late
            .Select(sample => (sample.Position, sample.ElapsedSeconds))
            .ToList();

        Assert.Null(LapReferenceCurve.FromSamples(latePositionsAndTimes, 90.0));
        Assert.Null(LapChannelTrace.FromSamples(late, 90.0, 5000.0));
    }

    [Fact]
    public void ATraceStaysWithinItsStatedSizeBudget()
    {
        // ~24 bytes per sample across six channels is the budget the spec sized storage on.
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 13_626.0);

        Assert.NotNull(trace);
        var bytes = trace!.SampleCount * trace.Channels.Count * sizeof(float);
        Assert.InRange(bytes, 1, 400_000);
    }

    /// <summary>
    /// One synthetic lap sampled every 0.1 % of the track: speed ramps 100 -> 300, throttle
    /// falls 1 -> 0, brake rises 0 -> 1, steering ramps -1 -> 1, gear climbs 1 -> 8, and
    /// elapsed time is linear to 90 s.
    /// </summary>
    private static List<LapTraceSample> FullLap()
    {
        var samples = new List<LapTraceSample>();
        for (var i = 0; i <= 1000; i++)
        {
            var position = i / 1000.0;
            samples.Add(new LapTraceSample(
                position,
                (float)(100 + (200 * position)),
                (float)(1 - position),
                (float)position,
                (float)((2 * position) - 1),
                1 + (int)(position * 7),
                90.0 * position));
        }

        return samples;
    }
}
