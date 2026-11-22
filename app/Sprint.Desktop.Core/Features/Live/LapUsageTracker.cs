using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// What each lap uses up, read off the player's own readings lap by lap: fuel (last lap, this lap
/// so far, the stint's average), virtual energy (last lap, the stint's average), per tyre the
/// wear the last lap took and its average tread temperature, and the last lap's top speed. Only a
/// lap seen whole counts: from the line, in the car, without a stop in the box or a refuel (which
/// leave the top speed standing). The stint averages count clean laps only: no pit lane, no
/// yellow, safety car or full course yellow. A stint starts over when the car stops in its box,
/// stands in the garage or gets fuel; everything starts over on a new session. Out of the car a
/// frame passes unchanged.
/// </summary>
/// <remarks>Not thread-safe: <see cref="TelemetryEngine"/> calls it from its reader thread only.</remarks>
public sealed class LapUsageTracker
{
    // A rise beyond these above the lap's lowest reading is a refuel (a refill of virtual energy),
    // not noise. LMU pours fuel in over seconds, so frame to frame a refuel barely shows.
    private const float RefuelLiters = 0.2f;
    private const float RefillEnergy = 0.5f;

    private readonly SessionWatch _session = new();
    private int? _lap;
    private LapStart? _start;
    private float _lapLowestFuel = float.MaxValue;
    private float _lapLowestEnergy = float.MaxValue;

    // Per tyre, in TirePosition order: the tread temperature summed over the lap's frames.
    private readonly double[] _tempSums = new double[4];
    private readonly int[] _tempCounts = new int[4];
    private bool _lapPitted;
    private bool _lapYellow;
    private bool _lapRefuelled;
    private float _lapTopSpeed;

    private float? _fuelLastLap;
    private float? _energyLastLap;
    private float? _topSpeedLastLap;
    private readonly float?[] _wearLastLap = new float?[4];
    private readonly float?[] _tempLastLap = new float?[4];
    private readonly Stint _fuelStint = new();
    private readonly Stint _energyStint = new();

    /// <summary>Returns <paramref name="frame"/> with what the laps used filled in. Never mutates the input.</summary>
    public TelemetryFrame Augment(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        this.StartOverOnNewSession(frame.Session);
        if (!frame.Session.InCar)
        {
            // Whatever happens out of the car is not seen: the lap under way no longer counts.
            this._lap = null;
            this._start = null;
            return frame;
        }

        this.Observe(frame);

        float fuel = frame.Car.FuelLiters;
        return frame with
        {
            Car = frame.Car with
            {
                FuelLastLapLiters = this._fuelLastLap,
                FuelThisLapLiters = this._start is { } start && !this._lapRefuelled ? Math.Max(0, start.Fuel - fuel) : null,
                FuelStintPerLapLiters = this._fuelStint.Average,
            },
            Energy = frame.Energy with
            {
                VirtualEnergyLastLap = this._energyLastLap,
                VirtualEnergyStintPerLap = this._energyStint.Average,
            },
            Lap = frame.Lap with { LastLapTopSpeedMetersPerSecond = this._topSpeedLastLap },
            Tires = [.. frame.Tires.Select(tire => Index(tire.Position) is int i
                ? tire with { WearLastLapPercent = this._wearLastLap[i], AverageTempLastLapCelsius = this._tempLastLap[i] }
                : tire)],
        };
    }

    private void Observe(TelemetryFrame frame)
    {
        int lap = frame.Lap.CurrentLap;
        float fuel = frame.Car.FuelLiters;
        float energy = frame.Energy.VirtualEnergy;

        // Standing in the box counts as a refuel even before any fuel shows.
        bool refuelled = frame.Car.PitState == PitState.Stopped
            || fuel > this._lapLowestFuel + RefuelLiters
            || energy > this._lapLowestEnergy + RefillEnergy;
        if (this._lap is not null && refuelled)
        {
            this._lapRefuelled = true;
            this._fuelStint.Clear();
            this._energyStint.Clear();
        }

        if (this._lap is int current && lap != current)
        {
            if (lap == current + 1 && this._start is { } start)
            {
                this.Finish(start, frame);
            }
            else if (lap != current + 1)
            {
                // Laps missed (or a lap number going back): nothing about the last lap is known.
                this.ForgetLastLap();
            }

            this.Begin(frame);
        }
        else if (this._lap is null)
        {
            // Joined mid-lap: this lap is not seen whole, so only the next one counts.
            this._lap = lap;
            this._start = null;
            this.ClearLap();
        }

        this._lapLowestFuel = Math.Min(this._lapLowestFuel, fuel);
        this._lapLowestEnergy = Math.Min(this._lapLowestEnergy, energy);

        if (frame.Car.InPitLane == true)
        {
            this._lapPitted = true;
        }

        if (frame.Car.PitState == PitState.Stopped || frame.Car.InGarage == true)
        {
            this._fuelStint.Clear();
            this._energyStint.Clear();
        }

        if (UnderYellow(frame))
        {
            this._lapYellow = true;
        }

        this._lapTopSpeed = Math.Max(this._lapTopSpeed, frame.Car.SpeedMetersPerSecond);

        foreach (TireState tire in frame.Tires)
        {
            if (Index(tire.Position) is int i && tire.TempSurfaceCelsius > 0)
            {
                this._tempSums[i] += tire.TempSurfaceCelsius;
                this._tempCounts[i]++;
            }
        }
    }

    // The lap just finished, read on the first frame of the next: what changed since its start.
    private void Finish(LapStart start, TelemetryFrame frame)
    {
        bool whole = !this._lapRefuelled;
        bool clean = whole && !this._lapPitted && !this._lapYellow;

        this._fuelLastLap = whole ? Used(start.Fuel, frame.Car.FuelLiters) : null;
        this._energyLastLap = whole ? Used(start.Energy, frame.Energy.VirtualEnergy) : null;
        this._topSpeedLastLap = this._lapTopSpeed > 0 ? this._lapTopSpeed : null;
        if (clean && this._fuelLastLap is float fuel)
        {
            this._fuelStint.Add(fuel);
        }

        if (clean && this._energyLastLap is float energy)
        {
            this._energyStint.Add(energy);
        }

        foreach (TireState tire in frame.Tires)
        {
            if (Index(tire.Position) is not int i)
            {
                continue;
            }

            // Wear going up means new tyres went on: the lap says nothing about wear.
            float worn = start.Wear[i] - tire.WearPercent;
            this._wearLastLap[i] = start.Wear[i] > 0 && worn >= 0 ? worn : null;
            this._tempLastLap[i] = this._tempCounts[i] > 0 ? (float)(this._tempSums[i] / this._tempCounts[i]) : null;
        }
    }

    private void Begin(TelemetryFrame frame)
    {
        float[] wear = new float[4];
        foreach (TireState tire in frame.Tires)
        {
            if (Index(tire.Position) is int i)
            {
                wear[i] = tire.WearPercent;
            }
        }

        this._lap = frame.Lap.CurrentLap;
        this._start = new LapStart(frame.Car.FuelLiters, frame.Energy.VirtualEnergy, wear);
        this.ClearLap();
    }

    private void ClearLap()
    {
        Array.Clear(this._tempSums);
        Array.Clear(this._tempCounts);
        this._lapPitted = false;
        this._lapYellow = false;
        this._lapRefuelled = false;
        this._lapTopSpeed = 0;
        this._lapLowestFuel = float.MaxValue;
        this._lapLowestEnergy = float.MaxValue;
    }

    private void ForgetLastLap()
    {
        this._fuelLastLap = null;
        this._energyLastLap = null;
        this._topSpeedLastLap = null;
        Array.Clear(this._wearLastLap);
        Array.Clear(this._tempLastLap);
    }

    private void StartOverOnNewSession(SessionInfo session)
    {
        if (this._session.StartedOver(session))
        {
            this._lap = null;
            this._start = null;
            this.ForgetLastLap();
            this._fuelStint.Clear();
            this._energyStint.Clear();
        }
    }

    /// <summary>What went from <paramref name="start"/> to <paramref name="end"/>; null for a reading the car does not have (0) or a rise.</summary>
    private static float? Used(float start, float end) =>
        start > 0 && end <= start ? start - end : null;

    private static bool UnderYellow(TelemetryFrame frame) =>
        frame.Flags.Yellow || frame.Flags.DoubleYellow || frame.Flags.SafetyCar || frame.Flags.VirtualSafetyCar
        || frame.Session.Phase == SessionPhase.FullCourseYellow;

    private static int? Index(TirePosition position) => position switch
    {
        TirePosition.FrontLeft => 0,
        TirePosition.FrontRight => 1,
        TirePosition.RearLeft => 2,
        TirePosition.RearRight => 3,
        _ => null,
    };

    /// <summary>The readings a lap started with; wear in <see cref="TirePosition"/> order.</summary>
    private sealed record LapStart(float Fuel, float Energy, float[] Wear);

    /// <summary>The clean laps of a stint: their total and count.</summary>
    private sealed class Stint
    {
        private double _total;
        private int _laps;

        public float? Average => this._laps > 0 ? (float)(this._total / this._laps) : null;

        public void Add(float used)
        {
            this._total += used;
            this._laps++;
        }

        public void Clear()
        {
            this._total = 0;
            this._laps = 0;
        }
    }
}
