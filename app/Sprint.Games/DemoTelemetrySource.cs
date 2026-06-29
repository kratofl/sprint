using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games;

internal sealed class DemoTelemetrySource : ITelemetrySource
{
    private readonly Random _random = new(14);
    private int _tick;

    public string Name => "Sprint Demo";

    public TelemetryFrame Current { get; private set; } = CreateFrame(
        speedKph: 238,
        gear: 5,
        rpm: 6420,
        throttle: 0.84f,
        brake: 0.0f,
        delta: -0.126,
        fuelLiters: 42,
        sector: 2,
        tireBase: 84);

    public TelemetryFrame Advance()
    {
        _tick += 1;
        var phase = _tick / 6.0;
        var speed = 215 + (int)(Math.Sin(phase) * 38) + _random.Next(-3, 4);
        var rpm = 5600 + (int)((Math.Sin(phase * 1.7) + 1) * 1200);
        var gear = Math.Clamp(1 + speed / 58, 1, 6);
        var delta = -0.18 + Math.Sin(phase * 0.8) * 0.19;

        Current = CreateFrame(
            speedKph: Math.Max(42, speed),
            gear: gear,
            rpm: rpm,
            throttle: (float)Math.Clamp(0.56 + Math.Sin(phase) * 0.42, 0, 1),
            brake: (float)Math.Clamp(Math.Sin(phase + 2.2) * 0.56, 0, 1),
            delta: delta,
            fuelLiters: Math.Max(1, 42 - _tick / 24),
            sector: 1 + _tick / 12 % 3,
            tireBase: 84 + _tick % 4);
        return Current;
    }

    private static TelemetryFrame CreateFrame(
        int speedKph,
        int gear,
        int rpm,
        float throttle,
        float brake,
        double delta,
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
                BestLapTime = 91.982,
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
                CurrentLap = 18,
                CurrentLapTime = 92.420 + sector / 1000.0,
                BestLapTime = 91.982,
                Delta = delta,
                Sector = sector,
                IsValid = true,
                TrackPosition = 0.42f
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
