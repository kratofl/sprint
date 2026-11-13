using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>One observed instant of a lap, as the recorder saw it.</summary>
/// <param name="Position">Track position, 0–1.</param>
/// <param name="World">Where the car was, in <c>CarPose</c>'s frame. Null when the game did not say.</param>
/// <param name="ThrottleApplied">The throttle that reached the car after traction control, 0–1. Null when the game did not say.</param>
/// <param name="BrakeApplied">The brake that reached the car after ABS, 0–1. Null when the game did not say.</param>
/// <param name="Settings">The car's in-car settings (TC, ABS, brake bias, …). Null when the game did not say.</param>
/// <param name="Car">The car's own readings, as <see cref="LapTraceCar.Read"/> lays them out. Null where only the driving matters (the live lap).</param>
public readonly record struct LapTraceSample(
    double Position,
    float SpeedKph,
    float Throttle,
    float Brake,
    float Steering,
    int Gear,
    double ElapsedSeconds,
    LapTraceWorld? World = null,
    float? ThrottleApplied = null,
    float? BrakeApplied = null,
    LapTraceSettings? Settings = null,
    float[]? Car = null);

/// <summary>
/// The settings a driver changes from the wheel, at one instant: each null when the car lacks it
/// (the game reports a max of 0) or the game did not say. Recorded as step channels so Analysis
/// can show where on the lap one changed.
/// </summary>
public readonly record struct LapTraceSettings(
    float? TractionControl,
    float? TractionControlSlip,
    float? TractionControlCut,
    float? Abs,
    float? MotorMap,
    float? Migration,
    float? FrontAntiRollBar,
    float? RearAntiRollBar,
    float? BrakeBiasRear)
{
    /// <summary>Each setting's channel and how to read it off a sample.</summary>
    public static IReadOnlyList<(string Channel, Func<LapTraceSettings, float?> Read)> Channels { get; } =
    [
        (LapTraceChannels.TractionControl, settings => settings.TractionControl),
        (LapTraceChannels.TractionControlSlip, settings => settings.TractionControlSlip),
        (LapTraceChannels.TractionControlCut, settings => settings.TractionControlCut),
        (LapTraceChannels.Abs, settings => settings.Abs),
        (LapTraceChannels.MotorMap, settings => settings.MotorMap),
        (LapTraceChannels.Migration, settings => settings.Migration),
        (LapTraceChannels.FrontAntiRollBar, settings => settings.FrontAntiRollBar),
        (LapTraceChannels.RearAntiRollBar, settings => settings.RearAntiRollBar),
        (LapTraceChannels.BrakeBiasRear, settings => settings.BrakeBiasRear),
    ];

    /// <summary>What a frame says about the car's settings; a setting the car lacks stays null.</summary>
    public static LapTraceSettings From(ElectronicsState electronics, float brakeBiasRear) => new(
        Setting(electronics.TractionControl, electronics.TractionControlMax),
        Setting(electronics.TractionControlSlip, electronics.TractionControlSlipMax),
        Setting(electronics.TractionControlCut, electronics.TractionControlCutMax),
        Setting(electronics.Abs, electronics.AbsMax),
        Setting(electronics.MotorMap, electronics.MotorMapMax),
        Setting(electronics.Migration, electronics.MigrationMax),
        Setting(electronics.FrontAntiRollBar, electronics.FrontAntiRollBarMax),
        Setting(electronics.RearAntiRollBar, electronics.RearAntiRollBarMax),
        // A bias of 0 or 1 would put all the braking on one axle: the game did not say.
        float.IsFinite(brakeBiasRear) && brakeBiasRear is > 0 and < 1 ? brakeBiasRear : null);

    private static float? Setting(byte value, byte max) => max > 0 ? value : null;
}

/// <summary>A world position in metres, in <c>CarPose</c>'s right-handed, Y-up frame.</summary>
public readonly record struct LapTraceWorld(float X, float Y, float Z);

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

    /// <summary>
    /// Where the car was: the lap's line on the track, in the game's world. Written only
    /// when every sample of the lap had a position: a line with holes filled by a held value
    /// would cut corners nobody drove.
    /// </summary>
    public const string WorldX = "worldX";
    public const string WorldY = "worldY";
    public const string WorldZ = "worldZ";

    /// <summary>
    /// The throttle and brake that reached the car, 0–1: <see cref="Throttle"/> and
    /// <see cref="Brake"/> after traction control and ABS, so the gap between the two pairs is
    /// where the electronics stepped in. Each written only when every sample of the lap had it,
    /// for the reason the world channels are.
    /// </summary>
    public const string ThrottleApplied = "throttleApplied";
    public const string BrakeApplied = "brakeApplied";

    /// <summary>
    /// The in-car settings (<see cref="LapTraceSettings"/>) as steps: each holds its value until
    /// the driver changed it, never a blend. Brake bias is the rear share, 0–1, as the frame has
    /// it; the rest are the game's steps. Each is written only when the car had the setting on
    /// every sample of the lap. Analysis derives where one changed from these, so the changes
    /// travel with a shared lap's trace.
    /// </summary>
    public const string TractionControl = "tc";
    public const string TractionControlSlip = "tcSlip";
    public const string TractionControlCut = "tcCut";
    public const string Abs = "abs";
    public const string MotorMap = "motorMap";
    public const string Migration = "migration";
    public const string FrontAntiRollBar = "arbFront";
    public const string RearAntiRollBar = "arbRear";
    public const string BrakeBiasRear = "brakeBiasRear";

    /// <summary>
    /// What the recorder always writes. The world, applied-pedal and setting channels come on top
    /// when the game reports them, and so do the car's own readings (<see cref="LapTraceCar"/>).
    /// </summary>
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
/// Values are <see cref="float"/>: 24 bytes per sample across the six default channels, and 44
/// with the three world and two applied-pedal channels LMU adds — about 300 KB for a lap of
/// Le Mans, the longest layout. Milliseconds
/// and 0.1 km/h are both far inside a float's precision at these magnitudes. Each setting
/// channel adds 4 bytes a sample before compression, but a value held for most of a lap
/// deflates to almost nothing, so on disk the settings cost a few hundred bytes a lap.
/// </para>
/// <para>
/// The car's own readings (<see cref="LapTraceCar"/>) are about a hundred channels more, which
/// makes a lap of Le Mans roughly 3 MB before compression. Nothing caps what is kept: the driver
/// sees the total in Settings and decides.
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

    public int SampleCount => this.Channels.Count == 0 ? 0 : this.Channels.Values.First().Length;

    /// <summary>Whether this trace can honestly drive a comparison.</summary>
    public bool IsUsable => this.PositionStep > 0 && this.Channels.Count > 0 && this.SampleCount > 1;

    /// <summary>
    /// The grid step for a track, as a fraction of a lap, sized to land near
    /// <see cref="TargetSampleMeters"/> and clamped so the sample count stays sane.
    /// </summary>
    public static double StepForTrackLength(double? trackLengthMeters)
    {
        double length = trackLengthMeters is { } reported && double.IsFinite(reported) && reported > 0
            ? reported
            : FallbackTrackLengthMeters;

        int intervals = (int)Math.Round(length / TargetSampleMeters);
        return 1.0 / Math.Clamp(intervals, MinSamples - 1, MaxSamples - 1);
    }

    public bool TryGetChannel(string name, out float[] values)
    {
        if (this.Channels.TryGetValue(name, out float[]? stored) && stored.Length > 0)
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
        if (!this.TryGetChannel(name, out float[]? values) || this.PositionStep <= 0)
        {
            return null;
        }

        double exact = Math.Clamp(position, 0, 1) / this.PositionStep;
        int index = (int)Math.Floor(exact);
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

        return Resample(samples, trackLengthMeters, lapTimeSeconds);
    }

    /// <summary>
    /// The lap in progress, resampled onto the same grid so a live line can be drawn through
    /// the same renderer as a stored one. Null until there are two samples to draw between.
    /// <para>
    /// Deliberately unguarded, and deliberately <em>not for storage</em>. The completeness
    /// guards ask "did we see the whole lap", which is false by construction for a lap the
    /// driver is still on. Grid points past the last observation hold the last value; a caller
    /// must not read them, which is what <c>LapTraceSeriesSource.UpTo</c> is for.
    /// </para>
    /// </summary>
    public static LapChannelTrace? Live(
        IReadOnlyList<LapTraceSample> samples,
        double? trackLengthMeters)
    {
        ArgumentNullException.ThrowIfNull(samples);

        return samples.Count < 2
            ? null
            : Resample(samples, trackLengthMeters, samples[^1].ElapsedSeconds);
    }

    /// <summary>
    /// Lays observed samples onto the track's grid. <paramref name="tailElapsedSeconds"/> is
    /// the elapsed time stated past the last observation — the lap total for a finished lap,
    /// the last reading for one still running.
    /// </summary>
    private static LapChannelTrace Resample(
        IReadOnlyList<LapTraceSample> samples,
        double? trackLengthMeters,
        double tailElapsedSeconds)
    {
        double step = StepForTrackLength(trackLengthMeters);
        int count = (int)Math.Round(1.0 / step) + 1;

        float[] speed = new float[count];
        float[] throttle = new float[count];
        float[] brake = new float[count];
        float[] steering = new float[count];
        float[] gear = new float[count];
        float[] elapsed = new float[count];
        bool hasWorld = samples.All(sample => sample.World is not null);
        float[] worldX = hasWorld ? new float[count] : [];
        float[] worldY = hasWorld ? new float[count] : [];
        float[] worldZ = hasWorld ? new float[count] : [];
        bool hasThrottleApplied = samples.All(sample => sample.ThrottleApplied is not null);
        bool hasBrakeApplied = samples.All(sample => sample.BrakeApplied is not null);
        float[] throttleApplied = hasThrottleApplied ? new float[count] : [];
        float[] brakeApplied = hasBrakeApplied ? new float[count] : [];
        List<(string Channel, Func<LapTraceSettings, float?> Read, float[] Values)> settings =
        [
            .. LapTraceSettings.Channels
                .Where(setting => samples.All(sample => sample.Settings is { } held && setting.Read(held) is not null))
                .Select(setting => (setting.Channel, setting.Read, new float[count])),
        ];
        List<(LapTraceCar.Channel Channel, int Index, float[] Values)> car =
        [
            .. LapTraceCar.Channels
                .Select((channel, at) => (Channel: channel, Index: at))
                .Where(entry => Reported(samples, entry.Channel, entry.Index))
                .Select(entry => (entry.Channel, entry.Index, new float[count])),
        ];

        int index = 0;
        for (int i = 0; i < count; i++)
        {
            double position = Math.Min(i * step, 1.0);

            // Before the first observation nothing was seen; holding the first reading is what
            // the reference curve does at the same edge.
            if (position <= samples[0].Position)
            {
                Write(i, samples[0], samples[0].ElapsedSeconds);
                continue;
            }

            // Past the last observation the tail time is the only time that can be stated, and
            // the last reading is the only car state that was observed.
            if (position >= samples[^1].Position)
            {
                Write(i, samples[^1], tailElapsedSeconds);
                continue;
            }

            // Both series ascend, so the bracketing sample only ever moves forward.
            while (samples[index + 1].Position <= position)
            {
                index++;
            }

            LapTraceSample start = samples[index];
            LapTraceSample end = samples[index + 1];
            double span = end.Position - start.Position;
            double t = span <= PositionEpsilon ? 0 : (position - start.Position) / span;

            speed[i] = Lerp(start.SpeedKph, end.SpeedKph, t);
            throttle[i] = Lerp(start.Throttle, end.Throttle, t);
            brake[i] = Lerp(start.Brake, end.Brake, t);
            steering[i] = Lerp(start.Steering, end.Steering, t);
            // Gear is a discrete selection, not a quantity: interpolating 3 and 4 into 3.5
            // would draw a ratio the car does not have. Hold the gear that was engaged.
            gear[i] = start.Gear;
            elapsed[i] = (float)(start.ElapsedSeconds + ((end.ElapsedSeconds - start.ElapsedSeconds) * t));
            if (hasWorld && start.World is { } from && end.World is { } to)
            {
                worldX[i] = Lerp(from.X, to.X, t);
                worldY[i] = Lerp(from.Y, to.Y, t);
                worldZ[i] = Lerp(from.Z, to.Z, t);
            }

            if (hasThrottleApplied && start.ThrottleApplied is { } throttleFrom && end.ThrottleApplied is { } throttleTo)
            {
                throttleApplied[i] = Lerp(throttleFrom, throttleTo, t);
            }

            if (hasBrakeApplied && start.BrakeApplied is { } brakeFrom && end.BrakeApplied is { } brakeTo)
            {
                brakeApplied[i] = Lerp(brakeFrom, brakeTo, t);
            }

            // A setting is a selection, like gear: hold the one in force.
            WriteSettings(i, start);
            foreach ((LapTraceCar.Channel channel, int at, float[] values) in car)
            {
                if (start.Car is { } carFrom && end.Car is { } carTo)
                {
                    values[i] = channel.Stepped ? carFrom[at] : Lerp(carFrom[at], carTo[at], t);
                }
            }
        }

        Dictionary<string, float[]> channels = new(StringComparer.Ordinal)
        {
            [LapTraceChannels.SpeedKph] = speed,
            [LapTraceChannels.Throttle] = throttle,
            [LapTraceChannels.Brake] = brake,
            [LapTraceChannels.Steering] = steering,
            [LapTraceChannels.Gear] = gear,
            [LapTraceChannels.ElapsedSeconds] = elapsed,
        };
        if (hasWorld)
        {
            channels[LapTraceChannels.WorldX] = worldX;
            channels[LapTraceChannels.WorldY] = worldY;
            channels[LapTraceChannels.WorldZ] = worldZ;
        }

        if (hasThrottleApplied)
        {
            channels[LapTraceChannels.ThrottleApplied] = throttleApplied;
        }

        if (hasBrakeApplied)
        {
            channels[LapTraceChannels.BrakeApplied] = brakeApplied;
        }

        foreach ((string channel, Func<LapTraceSettings, float?> _, float[] values) in settings)
        {
            channels[channel] = values;
        }

        foreach ((LapTraceCar.Channel channel, int _, float[] values) in car)
        {
            channels[channel.Name] = values;
        }

        return new LapChannelTrace
        {
            Version = FormatVersion,
            PositionStep = step,
            TrackLengthMeters = trackLengthMeters,
            Channels = channels,
        };

        void Write(int i, LapTraceSample sample, double elapsedSeconds)
        {
            speed[i] = sample.SpeedKph;
            throttle[i] = sample.Throttle;
            brake[i] = sample.Brake;
            steering[i] = sample.Steering;
            gear[i] = sample.Gear;
            elapsed[i] = (float)elapsedSeconds;
            if (hasWorld && sample.World is { } world)
            {
                worldX[i] = world.X;
                worldY[i] = world.Y;
                worldZ[i] = world.Z;
            }

            if (hasThrottleApplied && sample.ThrottleApplied is { } applied)
            {
                throttleApplied[i] = applied;
            }

            if (hasBrakeApplied && sample.BrakeApplied is { } braked)
            {
                brakeApplied[i] = braked;
            }

            WriteSettings(i, sample);
            foreach ((LapTraceCar.Channel _, int at, float[] values) in car)
            {
                if (sample.Car is { } held)
                {
                    values[i] = held[at];
                }
            }
        }

        void WriteSettings(int i, LapTraceSample sample)
        {
            foreach ((string _, Func<LapTraceSettings, float?> read, float[] values) in settings)
            {
                if (sample.Settings is { } held && read(held) is { } value)
                {
                    values[i] = value;
                }
            }
        }
    }

    /// <summary>
    /// Whether a lap's samples carry one of the car's readings: said on every sample, like the
    /// other optional channels, and not a lap of zeros where zero means the game was silent.
    /// </summary>
    private static bool Reported(IReadOnlyList<LapTraceSample> samples, LapTraceCar.Channel channel, int index)
    {
        bool nonZero = false;
        foreach (LapTraceSample sample in samples)
        {
            if (sample.Car is not { } car || index >= car.Length || !float.IsFinite(car[index]))
            {
                return false;
            }

            nonZero |= car[index] != 0;
        }

        return nonZero || !channel.SilentAtZero;
    }

    private static float Lerp(float start, float end, double t) =>
        (float)(start + ((end - start) * t));
}
