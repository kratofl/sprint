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
        double step = LapChannelTrace.StepForTrackLength(trackLengthMeters);

        double metresPerSample = step * trackLengthMeters;
        Assert.InRange(metresPerSample, 1.5, 5.0);
    }

    [Fact]
    public void AnUnknownTrackLengthStillYieldsADefensibleGrid()
    {
        double step = LapChannelTrace.StepForTrackLength(null);

        Assert.True(step > 0);
        // A typical GP circuit under the fallback assumption still lands in the band.
        Assert.InRange(step * 5000.0, 1.5, 5.0);
    }

    [Fact]
    public void AbsurdTrackLengthsAreClampedToASaneSampleCount()
    {
        // A 200 m karting loop and a 200 km fantasy layout must not produce two samples
        // or two million; the grid is a storage ceiling as much as a resolution.
        foreach (double length in new[] { 200.0, 200_000.0 })
        {
            int count = (int)Math.Round(1.0 / LapChannelTrace.StepForTrackLength(length)) + 1;
            Assert.InRange(count, LapChannelTrace.MinSamples, LapChannelTrace.MaxSamples);
        }
    }

    [Fact]
    public void EveryDefaultChannelIsCapturedOnTheSharedGrid()
    {
        LapChannelTrace? trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        foreach (string name in LapTraceChannels.Default)
        {
            Assert.True(trace!.TryGetChannel(name, out float[]? values), $"missing channel {name}");
            Assert.Equal(trace.SampleCount, values.Length);
        }
    }

    [Fact]
    public void ChannelsAreInterpolatedOntoTheGridAndReadBackByPosition()
    {
        // Speed ramps linearly 100 -> 300 across the lap, so any position reads back its ramp.
        LapChannelTrace? trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.Equal(200.0, trace!.ValueAt(LapTraceChannels.SpeedKph, 0.5)!.Value, 1);
        Assert.Equal(100.0, trace.ValueAt(LapTraceChannels.SpeedKph, 0.0)!.Value, 1);
    }

    [Fact]
    public void AnAbsentChannelReadsAsUnknownRatherThanZero()
    {
        LapChannelTrace? trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.Null(trace!.ValueAt("tyreTempFl", 0.5));
    }

    [Fact]
    public void TheLapTimeAtTheLineIsTheLapsOwnTime()
    {
        LapChannelTrace? trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.True(trace!.TryGetChannel(LapTraceChannels.ElapsedSeconds, out float[]? elapsed));
        Assert.Equal(90.0, elapsed[^1], 2);
    }

    [Fact]
    public void GearIsCarriedWithoutRoundingToTheWrongRatio()
    {
        LapChannelTrace? trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.True(trace!.TryGetChannel(LapTraceChannels.Gear, out float[]? gears));
        Assert.All(gears, gear => Assert.Equal(Math.Round(gear), gear));
    }

    [Fact]
    public void APartialLapProducesNoTraceRatherThanAMisleadingOne()
    {
        // Joined at half distance: the same guard the reference curve applies.
        List<LapTraceSample> late = FullLap().Where(sample => sample.Position >= 0.5).ToList();

        Assert.Null(LapChannelTrace.FromSamples(late, 90.0, 5000.0));
    }

    [Fact]
    public void AHoleInTheMiddleOfTheLapProducesNoTrace()
    {
        List<LapTraceSample> holed = FullLap().Where(sample => sample.Position is < 0.3 or > 0.6).ToList();

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
        List<LapTraceSample> samples = FullLap();
        List<(double Position, double ElapsedSeconds)> positionsAndTimes = samples
            .Select(sample => (sample.Position, sample.ElapsedSeconds))
            .ToList();

        Assert.NotNull(LapReferenceCurve.FromSamples(positionsAndTimes, 90.0));
        Assert.NotNull(LapChannelTrace.FromSamples(samples, 90.0, 5000.0));

        List<LapTraceSample> late = samples.Where(sample => sample.Position >= 0.5).ToList();
        List<(double Position, double ElapsedSeconds)> latePositionsAndTimes = late
            .Select(sample => (sample.Position, sample.ElapsedSeconds))
            .ToList();

        Assert.Null(LapReferenceCurve.FromSamples(latePositionsAndTimes, 90.0));
        Assert.Null(LapChannelTrace.FromSamples(late, 90.0, 5000.0));
    }

    [Fact]
    public void ATraceStaysWithinItsStatedSizeBudget()
    {
        // ~24 bytes per sample across six channels is the budget the spec sized storage on.
        LapChannelTrace? trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 13_626.0);

        Assert.NotNull(trace);
        int bytes = trace!.SampleCount * trace.Channels.Count * sizeof(float);
        Assert.InRange(bytes, 1, 400_000);
    }

    [Fact]
    public void SettingsAreStepsWrittenOnlyForWhatTheCarHas()
    {
        // TC goes 3 -> 5 at 40 % and is held, never blended; the car has no motor map (max 0).
        Sprint.Desktop.Api.Telemetry.ElectronicsState Electronics(double position) => new()
        {
            TractionControl = (byte)(position < 0.4 ? 3 : 5),
            TractionControlMax = 11,
            Abs = 4,
            AbsMax = 12,
            MotorMap = 2,
            MotorMapMax = 0,
        };
        List<LapTraceSample> samples = [.. FullLap().Select(sample => sample with { Settings = LapTraceSettings.From(Electronics(sample.Position), 0.46f) })];

        LapChannelTrace? trace = LapChannelTrace.FromSamples(samples, 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.True(trace.TryGetChannel(LapTraceChannels.TractionControl, out float[] tc));
        Assert.Equal([3f, 5f], tc.Distinct());
        Assert.Equal(3.0, trace.ValueAt(LapTraceChannels.TractionControl, 0.39));
        Assert.Equal(5.0, trace.ValueAt(LapTraceChannels.TractionControl, 0.41));
        Assert.Equal(0.46f, trace.Channels[LapTraceChannels.BrakeBiasRear][0]);
        Assert.True(trace.TryGetChannel(LapTraceChannels.Abs, out float[] _));
        Assert.False(trace.TryGetChannel(LapTraceChannels.MotorMap, out float[] _));
        Assert.False(trace.TryGetChannel(LapTraceChannels.Migration, out float[] _));
    }

    [Fact]
    public void ALapWithoutSettingsCarriesNoSettingChannels()
    {
        LapChannelTrace? trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.DoesNotContain(trace.Channels.Keys, name => LapTraceSettings.Channels.Any(setting => setting.Channel == name));
    }

    [Fact]
    public void SettingChannelsCostAlmostNothingOnDisk()
    {
        // Every setting a hypercar has, each changed once: the stored (deflated) trace may grow by
        // a few kilobytes at most, at Le Mans, the longest grid.
        Sprint.Desktop.Api.Telemetry.ElectronicsState Electronics(double position) => new()
        {
            TractionControl = (byte)(position < 0.3 ? 3 : 4), TractionControlMax = 11,
            TractionControlSlip = 2, TractionControlSlipMax = 8,
            TractionControlCut = 5, TractionControlCutMax = 8,
            Abs = (byte)(position < 0.6 ? 4 : 3), AbsMax = 12,
            MotorMap = 3, MotorMapMax = 5,
            Migration = 2, MigrationMax = 6,
            FrontAntiRollBar = 3, FrontAntiRollBarMax = 6,
            RearAntiRollBar = 2, RearAntiRollBarMax = 6,
        };
        List<LapTraceSample> withSettings = [.. FullLap().Select(sample => sample with { Settings = LapTraceSettings.From(Electronics(sample.Position), sample.Position < 0.5 ? 0.46f : 0.468f) })];

        long without = Deflated(LapChannelTrace.FromSamples(FullLap(), 90.0, 13_626.0));
        long with = Deflated(LapChannelTrace.FromSamples(withSettings, 90.0, 13_626.0));

        Assert.InRange(with - without, 1, 4_000);
    }

    private static long Deflated(LapChannelTrace? trace)
    {
        Assert.NotNull(trace);
        using MemoryStream stream = new();
        using (System.IO.Compression.DeflateStream deflate = new(stream, System.IO.Compression.CompressionLevel.Fastest, leaveOpen: true))
        {
            LapTraceCodec.Write(deflate, trace);
        }

        return stream.Length;
    }

    /// <summary>
    /// One synthetic lap sampled every 0.1 % of the track: speed ramps 100 -> 300, throttle
    /// falls 1 -> 0, brake rises 0 -> 1, steering ramps -1 -> 1, gear climbs 1 -> 8, and
    /// elapsed time is linear to 90 s.
    /// </summary>
    private static List<LapTraceSample> FullLap()
    {
        List<LapTraceSample> samples = new List<LapTraceSample>();
        for (int i = 0; i <= 1000; i++)
        {
            double position = i / 1000.0;
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
