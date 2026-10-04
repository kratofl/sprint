using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

public static class LiveTelemetryPresenter
{
    public static TelemetrySnapshot ToSnapshot(TelemetryFrame frame)
    {
        return new TelemetrySnapshot
        {
            SpeedKph = (int)Math.Round(frame.Car.SpeedMetersPerSecond * 3.6f),
            Gear = frame.Car.Gear,
            Rpm = (int)Math.Round(frame.Car.Rpm),
            RpmMax = Math.Max(1, (int)Math.Round(frame.Car.MaxRpm)),
            Throttle = frame.Car.Throttle,
            Brake = frame.Car.Brake,
            Delta = frame.Lap.Delta,
            LapTime = FormatLapTime(frame.Lap.CurrentLapTime),
            BestLap = FormatLapTime(frame.Lap.BestLapTime),
            FuelLiters = (int)Math.Round(frame.Car.FuelLiters),
            TireFrontLeft = TireTemp(frame, TirePosition.FrontLeft),
            TireFrontRight = TireTemp(frame, TirePosition.FrontRight),
            TireRearLeft = TireTemp(frame, TirePosition.RearLeft),
            TireRearRight = TireTemp(frame, TirePosition.RearRight),
            Sector = frame.Lap.Sector
        };
    }

    private static int TireTemp(TelemetryFrame frame, TirePosition position)
    {
        var tire = frame.Tires.FirstOrDefault(t => t.Position == position);
        return (int)Math.Round(tire?.TempSurfaceCelsius ?? 0);
    }

    private static string FormatLapTime(double seconds)
    {
        if (seconds <= 0)
        {
            return "--:--.---";
        }

        var minutes = (int)(seconds / 60);
        var remainder = seconds - minutes * 60;
        return $"{minutes}:{remainder:00.000}";
    }
}
