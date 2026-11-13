using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>
/// The driver's side of the pit wall: turns the newest frame into the <see cref="PitWallBoard"/>
/// sent to the engineer, and the cars around the driver into radar.
/// <para>
/// It remembers two things a single frame cannot say: where every car started the race (the
/// places on the first race frame before the leader completed a lap; a desktop that joins later
/// leaves them unknown rather than guessing), and the lap the last impact happened on (only for
/// impacts it saw happen). One instance per link; not thread-safe.
/// </para>
/// </summary>
public sealed class PitWallBoardBuilder
{
    /// <summary>How far around the driver's car radar looks, metres.</summary>
    public const double RadarRange = 40;

    /// <summary>The most cars one radar message carries, nearest first, so it fits one datagram.</summary>
    public const int RadarCars = 8;

    private static readonly TirePosition[] Corners = [TirePosition.FrontLeft, TirePosition.FrontRight, TirePosition.RearLeft, TirePosition.RearRight];

    // Start places of the race being run; null while not in a race or when it was joined late.
    private IReadOnlyDictionary<int, int>? _startPlaces;
    private bool _startSettled;
    private string _raceTrack = "";
    private double _raceTime;

    // The scale of virtual energy and battery readings for the session (track and type), fixed by
    // the first non-zero reading of each: 1 for a fraction, 0.01 for a percentage.
    private string _energySession = "";
    private double? _energyScale;
    private double? _chargeScale;

    private bool _impactSeen;
    private double? _impactTime;
    private int? _impactLap;

    public PitWallBoard Build(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        this.FollowStart(frame);
        this.FollowImpact(frame);

        double? length = frame.Session.TrackLengthMeters is > 0 and { } meters ? meters : null;
        IReadOnlyList<PitWallCar> field = [.. (frame.Field ?? [])
            .OrderBy(car => car.Place > 0 ? car.Place : int.MaxValue)
            .Select(car => this.Car(car, length))];
        return new PitWallBoard(Session(frame, length), field, this.Status(frame));
    }

    /// <summary>
    /// The cars within <see cref="RadarRange"/> of the driver's, nearest first, at most
    /// <see cref="RadarCars"/>. Every position comes from the same scoring snapshot, so cars do not
    /// jump against each other; only the heading is the car's own, from its pose. Empty without a
    /// pose or the driver's own entry in the field.
    /// </summary>
    public static IReadOnlyList<PitWallRadarCar> Radar(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (frame.Field is not { } field || frame.Car.Pose is not { } pose || field.FirstOrDefault(car => car.IsPlayer) is not { } own)
            return [];

        // The body's forward axis is -Z; rotated into the world and flattened onto the ground.
        double x = pose.OrientationX, y = pose.OrientationY, z = pose.OrientationZ, w = pose.OrientationW;
        double forwardX = -2 * ((x * z) + (w * y));
        double forwardZ = -(1 - (2 * ((x * x) + (y * y))));
        double length = Math.Sqrt((forwardX * forwardX) + (forwardZ * forwardZ));
        if (length < 1e-6)
            return [];
        forwardX /= length;
        forwardZ /= length;

        // Right of forward, seen from above with +Y up.
        double rightX = -forwardZ, rightZ = forwardX;
        return [.. field
            .Where(car => !car.IsPlayer && !car.InGarage)
            .Select(car => (car, dx: (double)car.PositionX - own.PositionX, dz: (double)car.PositionZ - own.PositionZ))
            .Select(near => (near.car, right: (near.dx * rightX) + (near.dz * rightZ), ahead: (near.dx * forwardX) + (near.dz * forwardZ)))
            .Where(near => Math.Sqrt((near.right * near.right) + (near.ahead * near.ahead)) <= RadarRange)
            .OrderBy(near => (near.right * near.right) + (near.ahead * near.ahead))
            .Take(RadarCars)
            .Select(near => new PitWallRadarCar(near.car.Id, Cut(near.car.Driver), Math.Round(near.right, 1), Math.Round(near.ahead, 1)))];
    }

    /// <summary>The most characters of a driver's name radar carries, so a message of long names still fits one datagram.</summary>
    public const int RadarNameLength = 24;

    private static string Cut(string name) => name.Length > RadarNameLength ? name[..RadarNameLength] : name;

    private static PitWallSession Session(TelemetryFrame frame, double? length)
    {
        SessionConditions conditions = frame.Conditions;
        return new PitWallSession
        {
            Track = frame.Session.Track,
            TrackLengthMeters = Round(length, 1),
            SessionType = frame.Session.SessionType,
            TimeRemaining = Round(frame.Session.SessionTimeRemaining, 1),
            TotalTime = Round(frame.Session.TotalSessionTime, 1),
            MaxLaps = frame.Session.MaxLaps,
            AirTemp = Round(conditions.AirTemperatureCelsius, 1),
            TrackTemp = Round(conditions.TrackTemperatureCelsius, 1),
            Wetness = Round(conditions.PathWetness, 3),
            Raining = Round(conditions.Raining, 3),
            // No game reports grip as a fraction: LMU's mTrackGripLevel is a small grade of its own
            // (1 in a wet race at Le Mans), so the fraction stays unknown and the grade goes as is.
            Grip = null,
            GripLevel = conditions.TrackGripLevel,
            Elapsed = Math.Round(frame.Session.SessionTime, 1),
            Phase = frame.Session.Phase,
            YellowSectors = [frame.Flags.Sector1Yellow, frame.Flags.Sector2Yellow, frame.Flags.Sector3Yellow],
        };
    }

    private PitWallCar Car(FieldCar car, double? length) => new()
    {
        Id = car.Id,
        Driver = car.Driver,
        Car = car.Car,
        CarClass = car.CarClass,
        IsPlayer = car.IsPlayer,
        Place = car.Place,
        ClassPlace = car.ClassPlace,
        StartPlace = this._startPlaces is { } starts && starts.TryGetValue(car.Id, out int start) ? start : null,
        LapsCompleted = car.LapsCompleted,
        LapFraction = length is { } meters ? Math.Round(Math.Clamp(car.LapDistanceMeters / meters, 0, 1), 4) : 0,
        Sector = car.Sector,
        LastLap = Round(car.LastLapTime, 3),
        BestLap = Round(car.BestLapTime, 3),
        LastSectors = [Round(car.LastLapSector1, 3), Round(car.LastLapSector2, 3), Round(car.LastLapSector3, 3)],
        GapToLeader = Math.Round(car.GapToLeader, 3),
        LapsToLeader = car.LapsToLeader,
        GapToNext = Math.Round(car.GapToNext, 3),
        LapsToNext = car.LapsToNext,
        InPit = car.InPitLane,
        PitState = car.PitState,
        PitStops = car.PitStops,
        Penalties = car.Penalties,
        BlueFlag = car.BlueFlag,
        FinishStatus = car.FinishStatus,
        Compound = car.Compound,
        X = Math.Round(car.PositionX, 1),
        Z = Math.Round(car.PositionZ, 1),
    };

    private static double? Round(double? value, int digits) => value is { } known ? Math.Round(known, digits) : null;

    private PitWallCarStatus Status(TelemetryFrame frame)
    {
        // Virtual energy and the battery are fractions on the pit wall. The game does not document
        // their scale, so this assumes the first non-zero reading of a session tells: above 1 it is
        // a percentage. Decided once, so a car running low does not flip between scales; nothing at
        // all means the car has none.
        string session = $"{frame.Session.Track}|{frame.Session.SessionType}";
        if (session != this._energySession)
        {
            this._energySession = session;
            this._energyScale = null;
            this._chargeScale = null;
        }

        double energy = frame.Energy.VirtualEnergy;
        double charge = frame.Energy.StateOfCharge;
        if (energy > 0)
            this._energyScale ??= energy > 1.0001 ? 0.01 : 1;
        if (charge > 0)
            this._chargeScale ??= charge > 1.0001 ? 0.01 : 1;
        double energyScale = this._energyScale ?? 1;
        bool hasEnergy = energy > 0 || frame.Energy.VirtualEnergyPerLap > 0;

        return new PitWallCarStatus
        {
            Tyres = [.. Corners.Select(corner => Tyre(frame, corner))],
            FuelLiters = Math.Round(frame.Car.FuelLiters, 2),
            FuelPerLapLiters = Math.Round(frame.Car.FuelPerLapLiters, 3),
            FuelCapacityLiters = frame.Car.FuelCapacityLiters,
            VirtualEnergy = hasEnergy ? Math.Round(Math.Clamp(energy * energyScale, 0, 1), 4) : null,
            VirtualEnergyPerLap = hasEnergy ? Math.Round(Math.Clamp(frame.Energy.VirtualEnergyPerLap * energyScale, 0, 1), 4) : null,
            Battery = charge > 0 ? Math.Round(Math.Clamp(charge * (this._chargeScale ?? 1), 0, 1), 4) : null,
            Damage = frame.Damage is { } damage
                ? new PitWallDamage
                {
                    Dents = damage.Dents,
                    LastImpact = damage.LastImpactSessionTime is { } time
                        ? new PitWallImpact(Math.Round(time, 2), Math.Round(damage.LastImpactMagnitude, 1), this._impactTime == time ? this._impactLap : null)
                        : null,
                    Overheating = damage.Overheating,
                    DetachedParts = damage.DetachedParts,
                }
                : null,
        };
    }

    private static PitWallTyre Tyre(TelemetryFrame frame, TirePosition corner)
    {
        TireState tire = frame.Tires.FirstOrDefault(candidate => candidate.Position == corner) ?? new TireState { Position = corner };
        return new PitWallTyre
        {
            Position = corner,
            Inner = Math.Round(tire.TempInnerCelsius, 1),
            Middle = Math.Round(tire.TempMiddleCelsius, 1),
            Outer = Math.Round(tire.TempOuterCelsius, 1),
            Core = Math.Round(tire.TempCoreCelsius, 1),
            Brake = Math.Round(tire.BrakeTempCelsius, 1),
            PressureKPa = Math.Round(tire.PressureKPa, 1),
            WearPercent = Math.Round(tire.WearPercent, 1),
            Compound = tire.Compound,
        };
    }

    /// <summary>Records the grid once per race: a new race is a race frame after anything else, on another track, or with the clock gone back.</summary>
    private void FollowStart(TelemetryFrame frame)
    {
        if (frame.Session.SessionType != SessionType.Race)
        {
            this.ForgetStart();
            this._raceTrack = "";
            return;
        }

        if (!string.Equals(frame.Session.Track, this._raceTrack, StringComparison.Ordinal) || frame.Session.SessionTime < this._raceTime - 1)
        {
            this.ForgetStart();
            this._raceTrack = frame.Session.Track;
        }

        this._raceTime = frame.Session.SessionTime;
        if (this._startSettled || frame.Field is not { } field || field.FirstOrDefault(car => car.Place == 1) is not { } leader)
            return;

        this._startSettled = true;
        this._startPlaces = leader.LapsCompleted == 0
            ? field.Where(car => car.Place > 0).GroupBy(car => car.Id).ToDictionary(group => group.Key, group => group.First().Place)
            : null;
    }

    private void ForgetStart()
    {
        this._startPlaces = null;
        this._startSettled = false;
        this._raceTime = 0;
    }

    /// <summary>A change of the last impact's time is an impact seen happening, on the lap being driven; the first reading is history.</summary>
    private void FollowImpact(TelemetryFrame frame)
    {
        if (frame.Damage is not { } damage)
            return;

        double? time = damage.LastImpactSessionTime;
        if (!this._impactSeen)
        {
            this._impactSeen = true;
            this._impactTime = time;
            this._impactLap = null;
            return;
        }

        if (time != this._impactTime)
        {
            this._impactTime = time;
            this._impactLap = time is null ? null : frame.Lap.CurrentLap;
        }
    }
}
