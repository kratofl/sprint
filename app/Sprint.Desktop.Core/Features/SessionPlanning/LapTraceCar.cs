using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What the car itself reported through a lap, beside the driver's inputs: engine, fuel and
/// energy, each wheel corner, and damage. Recorded for every lap because a lap that was not
/// recorded cannot be recorded later. Analysis draws them on the lap page, from a thinned copy
/// (<see cref="Only"/>).
/// <para>
/// Values keep the units of <see cref="TelemetryFrame"/>. A wheel channel is its name with the
/// corner behind it: <c>tyreTempInnerFL</c>, <c>brakeTempRR</c>.
/// </para>
/// </summary>
public static class LapTraceCar
{
    /// <summary>
    /// One channel. <paramref name="Stepped"/>: a state that holds (a surface, a dent) rather
    /// than a quantity to interpolate. <paramref name="SilentAtZero"/>: a lap of nothing but
    /// zeros means the game or the car does not report it, so the channel is left out.
    /// </summary>
    public sealed record Channel(string Name, bool Stepped, bool SilentAtZero);

    private static readonly (string Corner, TirePosition Position)[] Corners =
    [
        ("FL", TirePosition.FrontLeft),
        ("FR", TirePosition.FrontRight),
        ("RL", TirePosition.RearLeft),
        ("RR", TirePosition.RearRight),
    ];

    private static readonly (Channel Channel, Func<TelemetryFrame, float?> Read)[] Car =
    [
        (Quantity("rpm"), frame => frame.Car.Rpm),
        // A lap without touching the clutch is a lap of zeros, and that is the reading.
        (new Channel("clutch", Stepped: false, SilentAtZero: false), frame => frame.Car.Clutch),
        (Quantity("fuel"), frame => frame.Car.FuelLiters),
        (Quantity("virtualEnergy"), frame => frame.Energy.VirtualEnergy),
        (Quantity("battery"), frame => frame.Energy.StateOfCharge),
        (Quantity("regenPower"), frame => frame.Energy.RegenPower),
        (Quantity("deployPower"), frame => frame.Energy.DeployPower),
    ];

    private static readonly (Channel Channel, Func<TelemetryFrame, TireState, float?> Read)[] Wheel =
    [
        (Quantity("tyreTempInner"), (_, tyre) => tyre.TempInnerCelsius),
        (Quantity("tyreTempMiddle"), (_, tyre) => tyre.TempMiddleCelsius),
        (Quantity("tyreTempOuter"), (_, tyre) => tyre.TempOuterCelsius),
        (Quantity("tyreTempCore"), (_, tyre) => tyre.TempCoreCelsius),
        (Quantity("tyrePressure"), (_, tyre) => tyre.PressureKPa),
        (Quantity("tyreWear"), (_, tyre) => tyre.WearPercent),
        (Quantity("brakeTemp"), (_, tyre) => tyre.BrakeTempCelsius),
        (Quantity("suspension"), (_, tyre) => tyre.SuspensionDeflectionMeters),
        (Quantity("rideHeight"), (_, tyre) => tyre.RideHeightMeters),
        (Quantity("wheelLoad"), (_, tyre) => tyre.LoadNewtons),
        (Quantity("wheelSpeed"), (_, tyre) => tyre.RotationRadiansPerSecond),
        (Quantity("slipLong"), (_, tyre) => tyre.LongitudinalPatchVelocity),
        (Quantity("slipLat"), (_, tyre) => tyre.LateralPatchVelocity),
        (Quantity("groundLong"), (_, tyre) => tyre.LongitudinalGroundVelocity),
        (Quantity("groundLat"), (_, tyre) => tyre.LateralGroundVelocity),
        (Quantity("sliding"), (_, tyre) => tyre.PatchSlidingFraction),
        (Quantity("forceLong"), (_, tyre) => tyre.LongitudinalForceNewtons),
        (Quantity("forceLat"), (_, tyre) => tyre.LateralForceNewtons),
        (Quantity("camber"), (_, tyre) => tyre.CamberRadians),
        // TireSurface as its number; Unknown is 0, so a game that names no surface leaves it out.
        (new Channel("surface", Stepped: true, SilentAtZero: true), (_, tyre) => (float)tyre.Surface),
        // A wheel that is fine reads false, and so does one a game says nothing about. Only a
        // game that reports damage at all is taken at its word.
        (State("flat"), (frame, tyre) => frame.Damage is null ? null : Flag(tyre.Flat)),
        (State("detached"), (frame, tyre) => frame.Damage is null ? null : Flag(tyre.Detached)),
    ];

    private static readonly (Channel Channel, Func<DamageState, float?> Read)[] Damage =
    [
        .. Enumerable.Range(0, 8).Select(place => (State($"dent{place}"), Dent(place))),
        (State("detachedParts"), damage => Flag(damage.DetachedParts)),
        (State("overheating"), damage => Flag(damage.Overheating)),
        // Holds the last hit's strength, so a change within the lap marks a hit.
        (State("impactMagnitude"), damage => (float)damage.LastImpactMagnitude),
    ];

    /// <summary>Every channel, in the order <see cref="Read"/> fills them.</summary>
    public static IReadOnlyList<Channel> Channels { get; } =
    [
        .. Car.Select(entry => entry.Channel),
        .. Corners.SelectMany(corner => Wheel.Select(entry => entry.Channel with { Name = entry.Channel.Name + corner.Corner })),
        .. Damage.Select(entry => entry.Channel),
    ];

    private static readonly HashSet<string> Names = [.. Channels.Select(channel => channel.Name)];

    /// <summary>
    /// One frame's readings, one per entry of <see cref="Channels"/>. NaN where the game did not
    /// say at this instant.
    /// </summary>
    public static float[] Read(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        float[] values = new float[Channels.Count];
        int index = 0;
        foreach ((Channel _, Func<TelemetryFrame, float?> read) in Car)
        {
            values[index++] = Finite(read(frame));
        }

        foreach ((string _, TirePosition position) in Corners)
        {
            TireState? tyre = frame.Tires.FirstOrDefault(candidate => candidate.Position == position);
            foreach ((Channel _, Func<TelemetryFrame, TireState, float?> read) in Wheel)
            {
                values[index++] = tyre is null ? float.NaN : Finite(read(frame, tyre));
            }
        }

        foreach ((Channel _, Func<DamageState, float?> read) in Damage)
        {
            values[index++] = frame.Damage is { } damage ? Finite(read(damage)) : float.NaN;
        }

        return values;
    }

    /// <summary>
    /// The most samples of each of the car's readings a page is sent: about what a chart draws
    /// across a lap.
    /// </summary>
    public const int PageSamples = 1024;

    /// <summary>
    /// The car's readings alone, thinned to at most <paramref name="maxSamples"/> a channel on a
    /// coarser grid: every n-th point as it was recorded, so a state is never a blend. What a
    /// page draws the car from; all of them at the lap's own resolution would be megabytes as JSON.
    /// </summary>
    public static LapChannelTrace Only(LapChannelTrace trace, int maxSamples = PageSamples)
    {
        ArgumentNullException.ThrowIfNull(trace);

        int stride = Math.Max(1, (int)Math.Ceiling((trace.SampleCount - 1) / (double)(Math.Max(2, maxSamples) - 1)));
        Dictionary<string, float[]> channels = new(StringComparer.Ordinal);
        foreach ((string name, float[] values) in trace.Channels)
        {
            if (!Names.Contains(name))
            {
                continue;
            }

            float[] thinned = new float[((values.Length - 1) / stride) + 1];
            for (int i = 0; i < thinned.Length; i++)
            {
                thinned[i] = values[i * stride];
            }

            channels[name] = thinned;
        }

        return new LapChannelTrace
        {
            Version = trace.Version,
            PositionStep = trace.PositionStep * stride,
            TrackLengthMeters = trace.TrackLengthMeters,
            Channels = channels,
        };
    }

    /// <summary>
    /// The trace without the car's readings: the driving, at the lap's own resolution. What
    /// compares, trains and draws a lap's line reads.
    /// </summary>
    public static LapChannelTrace Without(LapChannelTrace trace)
    {
        ArgumentNullException.ThrowIfNull(trace);

        return new LapChannelTrace
        {
            Version = trace.Version,
            PositionStep = trace.PositionStep,
            TrackLengthMeters = trace.TrackLengthMeters,
            Channels = new Dictionary<string, float[]>(
                trace.Channels.Where(channel => !Names.Contains(channel.Key)),
                StringComparer.Ordinal),
        };
    }

    /// <summary>Whether <paramref name="channel"/> is one of the car's readings.</summary>
    public static bool Has(string channel) => Names.Contains(channel);

    private static Channel Quantity(string name) => new(name, Stepped: false, SilentAtZero: true);

    private static Channel State(string name) => new(name, Stepped: true, SilentAtZero: false);

    private static Func<DamageState, float?> Dent(int place) =>
        damage => place < damage.Dents.Count ? damage.Dents[place] : null;

    private static float Flag(bool value) => value ? 1 : 0;

    private static float Finite(float? value) => value is { } said && float.IsFinite(said) ? said : float.NaN;
}
