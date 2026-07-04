using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games;

/// <summary>
/// In-process simulation used for dev/test only — a pure <em>healthy-link</em>
/// source: once connected it always reports <see cref="TelemetryConnectionState.Connected"/>
/// and produces a fresh frame on every <see cref="TryRead"/>. It never fakes
/// stale/disconnected/fault states; those are exercised by freshness derivation
/// and by scripted test fakes, not here. Single-threaded, so the
/// <see cref="ITelemetrySource"/> thread-safety contract holds trivially.
/// It drives a synthetic lap cycle (advancing track position + lap number +
/// last-lap time, alternating pace) so the engine's <c>DeltaTracker</c> actually
/// adopts a reference and computes a live delta under <c>make dev-app</c> — the demo
/// deliberately does NOT fake <see cref="LapState.Delta"/> itself.
/// </summary>
internal sealed class DemoTelemetrySource : ITelemetrySource
{
    // ~9s synthetic laps at the engine's ~15ms read pacing: enough samples to build a
    // delta reference and visibly cycle laps under `make dev-app`.
    private const int TicksPerLap = 600;
    private const int StartLap = 18;

    private readonly Random _random = new(14);
    private int _tick;
    private int _lap = StartLap;
    private double _lapPace = PaceFor(StartLap);
    private double _lastLapTime;
    private double _bestLapTime;
    private bool _connected;
    private bool _disposed;

    private TelemetryFrame _current = CreateFrame(
        speedKph: 0,
        gear: 0,
        rpm: 0,
        throttle: 0f,
        brake: 0f,
        trackPosition: 0f,
        currentLap: StartLap,
        currentLapTime: 0,
        lastLapTime: 0,
        bestLapTime: 0,
        fuelLiters: 42,
        sector: 1,
        tireBase: 84);

    private TelemetryStatus _status = TelemetryStatus.Disconnected("Sprint Demo");

    public string Name => "Sprint Demo";

    public TelemetryStatus Status => _status;

    public TelemetryFrame Current => _current;

    public void Connect()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _connected = true;
        _status = _status with { State = TelemetryConnectionState.Connected, SourceName = Name };
    }

    public void Disconnect()
    {
        if (_disposed)
        {
            return;
        }

        _connected = false;
        _status = TelemetryStatus.Disconnected(Name);
    }

    public bool TryRead(out TelemetryFrame frame)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (!_connected)
        {
            frame = _current;
            return false;
        }

        _current = Step();
        _status = _status with
        {
            State = TelemetryConnectionState.Connected,
            SourceName = Name,
            LastFrameAt = _current.Timestamp,
            LastFrameValid = true
        };
        frame = _current;
        return true;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _connected = false;
        _status = TelemetryStatus.Disconnected(Name);
    }

    private TelemetryFrame Step()
    {
        _tick += 1;
        var lapTick = _tick % TicksPerLap;
        if (lapTick == 0)
        {
            // Crossed the line: bank the just-completed lap and start a fresh one.
            _lastLapTime = _lapPace;
            if (_bestLapTime <= 0 || _lastLapTime < _bestLapTime)
            {
                _bestLapTime = _lastLapTime;
            }

            _lap += 1;
            _lapPace = PaceFor(_lap);
        }

        var progress = (double)lapTick / TicksPerLap; // track position 0..1
        var phase = _tick / 6.0;
        var speed = 215 + (int)(Math.Sin(phase) * 38) + _random.Next(-3, 4);
        var rpm = 5600 + (int)((Math.Sin(phase * 1.7) + 1) * 1200);
        var gear = Math.Clamp(1 + speed / 58, 1, 6);

        return CreateFrame(
            speedKph: Math.Max(42, speed),
            gear: gear,
            rpm: rpm,
            throttle: (float)Math.Clamp(0.56 + Math.Sin(phase) * 0.42, 0, 1),
            brake: (float)Math.Clamp(Math.Sin(phase + 2.2) * 0.56, 0, 1),
            trackPosition: (float)progress,
            currentLap: _lap,
            currentLapTime: progress * _lapPace,
            lastLapTime: _lastLapTime,
            bestLapTime: _bestLapTime,
            fuelLiters: Math.Max(1, 42 - _tick / 240),
            sector: 1 + (int)(progress * 3) % 3,
            tireBase: 84 + _tick % 4);
    }

    // Alternate lap pace so a faster lap is adopted as the delta reference.
    private static double PaceFor(int lap) => lap % 2 == 0 ? 91.8 : 92.4;

    private static TelemetryFrame CreateFrame(
        int speedKph,
        int gear,
        int rpm,
        float throttle,
        float brake,
        float trackPosition,
        int currentLap,
        double currentLapTime,
        double lastLapTime,
        double bestLapTime,
        int fuelLiters,
        int sector,
        int tireBase)
    {
        return new TelemetryFrame
        {
            Timestamp = DateTimeOffset.UtcNow,
            Session = new SessionInfo
            {
                Game = "Sprint Demo",
                Track = "Portimao",
                Car = "LMDh Prototype",
                SessionType = SessionType.Race,
                BestLapTime = bestLapTime,
                InCar = true
            },
            Car = new CarState
            {
                SpeedMetersPerSecond = speedKph / 3.6f,
                Gear = gear,
                Rpm = rpm,
                MaxRpm = 8000,
                Throttle = throttle,
                Brake = brake,
                FuelLiters = fuelLiters,
                FuelPerLapLiters = 2.6f
            },
            Tires =
            [
                Tire(TirePosition.FrontLeft, tireBase + 2),
                Tire(TirePosition.FrontRight, tireBase + 4),
                Tire(TirePosition.RearLeft, tireBase),
                Tire(TirePosition.RearRight, tireBase + 1)
            ],
            Lap = new LapState
            {
                CurrentLap = currentLap,
                CurrentLapTime = currentLapTime,
                LastLapTime = lastLapTime,
                BestLapTime = bestLapTime,
                // Delta + TargetLapTime are computed by the engine's DeltaTracker, not faked here.
                Sector = sector,
                IsValid = true,
                TrackPosition = trackPosition
            },
            Electronics = new ElectronicsState
            {
                TractionControl = 4,
                TractionControlMax = 12,
                Abs = 7,
                AbsMax = 12,
                MotorMap = 3,
                MotorMapMax = 8
            },
            Race = new RaceState
            {
                Position = 4,
                TotalPositions = 28,
                GapAhead = 1.2f,
                GapBehind = 0.8f
            }
        };
    }

    private static TireState Tire(TirePosition position, int temp)
    {
        return new TireState
        {
            Position = position,
            TempSurfaceCelsius = temp,
            TempCoreCelsius = temp - 2,
            PressureKPa = 188,
            WearPercent = 4,
            Compound = "Medium"
        };
    }
}
