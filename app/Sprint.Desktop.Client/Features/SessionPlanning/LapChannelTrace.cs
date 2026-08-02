namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>One observed instant of a lap, as the recorder saw it.</summary>
/// <param name="Position">Track position, 0–1.</param>
public readonly record struct LapTraceSample(
    double Position,
    float SpeedKph,
    float Throttle,
    float Brake,
    float Steering,
    int Gear,
    double ElapsedSeconds);

/// <summary>
/// The channel names a trace carries. Names rather than fields so a later feature can add a
/// channel without migrating every stored trace — a reader asks for what it needs and copes
/// with absence.
/// </summary>
public static class LapTraceChannels
{
    public const string SpeedKph = "speedKph";
    public const string Throttle = "throttle";
    public const string Brake = "brake";
    public const string Steering = "steering";
    public const string Gear = "gear";
    public const string ElapsedSeconds = "elapsedSeconds";

    /// <summary>What the recorder writes today.</summary>
    public static IReadOnlyList<string> Default { get; } =
        [SpeedKph, Throttle, Brake, Steering, Gear, ElapsedSeconds];
}

/// <summary>
/// How a lap was driven, channel by channel, on a fixed position grid (#194). The richer tier
/// beside <see cref="LapReferenceCurve"/>, which stays position→time only and stays cheap.
/// <para>
/// The grid is sized in <em>metres</em>, not in lap fractions. A fixed fraction would mean 68 m
/// of resolution at Le Mans and 25 m at Zandvoort, and the reading a driver needs — where they
/// lifted, where they hit the pedal — is a distance on track. The step is stored per instance,
/// the same convention <see cref="LapReferenceCurve"/> already uses, so a reader never assumes
/// a global one.
/// </para>
/// <para>
/// Values are <see cref="float"/>: 24 bytes per sample across the six default channels, which
/// is what the storage budget was sized on. Milliseconds and 0.1 km/h are both far inside a
/// float's precision at these magnitudes.
/// </para>
/// </summary>
public sealed class LapChannelTrace
{
    /// <summary>Bumped only when the on-disk layout changes. Adding a channel does not.</summary>
    public const int FormatVersion = 1;

    /// <summary>The resolution the grid aims for, in metres.</summary>
    public const double TargetSampleMeters = 2.0;

    /// <summary>Assumed track length when the game did not report one — a typical GP circuit.</summary>
    public const double FallbackTrackLengthMeters = 5000.0;

    /// <summary>Sample-count floor, so a very short layout still has a usable grid.</summary>
    public const int MinSamples = 200;

    /// <summary>Sample-count ceiling, so an implausible track length cannot size a huge file.</summary>
    public const int MaxSamples = 20_000;

    private const double PositionEpsilon = 1e-6;

    public int Version { get; set; } = FormatVersion;

    /// <summary>The sampling interval as a fraction of a lap. Index <c>i</c> is <c>i * PositionStep</c>.</summary>
    public double PositionStep { get; set; }

    /// <summary>
    /// The track length the grid was derived from, so a reader can convert the grid back into
    /// metres without guessing which layout produced it. Null when the game never said.
    /// </summary>
    public double? TrackLengthMeters { get; set; }

    /// <summary>Channel values by name, every array the same length.</summary>
    public Dictionary<string, float[]> Channels { get; set; } = new(StringComparer.Ordinal);

    public int SampleCount => Channels.Count == 0 ? 0 : Channels.Values.First().Length;

    /// <summary>Whether this trace can honestly drive a comparison.</summary>
    public bool IsUsable => PositionStep > 0 && Channels.Count > 0 && SampleCount > 1;

    /// <summary>
    /// The grid step for a track, as a fraction of a lap, sized to land near
    /// <see cref="TargetSampleMeters"/> and clamped so the sample count stays sane.
    /// </summary>
    public static double StepForTrackLength(double? trackLengthMeters)
    {
        var length = trackLengthMeters is { } reported && double.IsFinite(reported) && reported > 0
            ? reported
            : FallbackTrackLengthMeters;

        var intervals = (int)Math.Round(length / TargetSampleMeters);
        return 1.0 / Math.Clamp(intervals, MinSamples - 1, MaxSamples - 1);
    }

    public bool TryGetChannel(string name, out float[] values)
    {
        if (Channels.TryGetValue(name, out var stored) && stored.Length > 0)
        {
            values = stored;
            return true;
        }

        values = [];
        return false;
    }

    /// <summary>
    /// A channel's value at an arbitrary track position, linearly interpolated between grid
    /// points. Null when the channel is absent — a caller must be able to tell "this trace does
    /// not carry that" from "the value here is zero".
    /// </summary>
    public double? ValueAt(string name, double position)
    {
        if (!TryGetChannel(name, out var values) || PositionStep <= 0)
        {
            return null;
        }

        var exact = Math.Clamp(position, 0, 1) / PositionStep;
        var index = (int)Math.Floor(exact);
        if (index >= values.Length - 1)
        {
            return values[^1];
        }

        return values[index] + ((values[index + 1] - values[index]) * (exact - index));
    }

    /// <summary>
    /// Resamples one lap's observed samples onto the track's grid, or returns null when they do
    /// not span enough of the lap to describe it honestly. Rejects exactly the laps
    /// <see cref="LapReferenceCurve.FromSamples"/> rejects, so the two tiers never disagree.
    /// </summary>
    /// <param name="samples">The lap's observed samples, strictly ascending in position.</param>
    /// <param name="lapTimeSeconds">The lap's completed time — the only time known true at the line.</param>
    /// <param name="trackLengthMeters">Track length, for sizing the grid. Null when unknown.</param>
    public static LapChannelTrace? FromSamples(
        IReadOnlyList<LapTraceSample> samples,
        double lapTimeSeconds,
        double? trackLengthMeters)
    {
        ArgumentNullException.ThrowIfNull(samples);

        if (lapTimeSeconds <= 0
            || !LapCompleteness.IsComplete([.. samples.Select(sample => sample.Position)]))
        {
            return null;
        }

        var step = StepForTrackLength(trackLengthMeters);
        var count = (int)Math.Round(1.0 / step) + 1;

        var speed = new float[count];
        var throttle = new float[count];
        var brake = new float[count];
        var steering = new float[count];
        var gear = new float[count];
        var elapsed = new float[count];

        var index = 0;
        for (var i = 0; i < count; i++)
        {
            var position = Math.Min(i * step, 1.0);

            // Before the first observation nothing was seen; holding the first reading is what
            // the reference curve does at the same edge.
            if (position <= samples[0].Position)
            {
                Write(i, samples[0], samples[0].ElapsedSeconds);
                continue;
            }

            // Past the last observation the lap total is the only time known to be true, and
            // the last reading is the only car state that was observed.
            if (position >= samples[^1].Position)
            {
                Write(i, samples[^1], lapTimeSeconds);
                continue;
            }

            // Both series ascend, so the bracketing sample only ever moves forward.
            while (samples[index + 1].Position <= position)
            {
                index++;
            }

            var start = samples[index];
            var end = samples[index + 1];
            var span = end.Position - start.Position;
            var t = span <= PositionEpsilon ? 0 : (position - start.Position) / span;

            speed[i] = Lerp(start.SpeedKph, end.SpeedKph, t);
            throttle[i] = Lerp(start.Throttle, end.Throttle, t);
            brake[i] = Lerp(start.Brake, end.Brake, t);
            steering[i] = Lerp(start.Steering, end.Steering, t);
            // Gear is a discrete selection, not a quantity: interpolating 3 and 4 into 3.5
            // would draw a ratio the car does not have. Hold the gear that was engaged.
            gear[i] = start.Gear;
            elapsed[i] = (float)(start.ElapsedSeconds + ((end.ElapsedSeconds - start.ElapsedSeconds) * t));
        }

        return new LapChannelTrace
        {
            Version = FormatVersion,
            PositionStep = step,
            TrackLengthMeters = trackLengthMeters,
            Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
            {
                [LapTraceChannels.SpeedKph] = speed,
                [LapTraceChannels.Throttle] = throttle,
                [LapTraceChannels.Brake] = brake,
                [LapTraceChannels.Steering] = steering,
                [LapTraceChannels.Gear] = gear,
                [LapTraceChannels.ElapsedSeconds] = elapsed,
            },
        };

        void Write(int i, LapTraceSample sample, double elapsedSeconds)
        {
            speed[i] = sample.SpeedKph;
            throttle[i] = sample.Throttle;
            brake[i] = sample.Brake;
            steering[i] = sample.Steering;
            gear[i] = sample.Gear;
            elapsed[i] = (float)elapsedSeconds;
        }
    }

    private static float Lerp(float start, float end, double t) =>
        (float)(start + ((end - start) * t));
}
