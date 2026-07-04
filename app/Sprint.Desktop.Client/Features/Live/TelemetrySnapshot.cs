namespace Sprint.Desktop.Features.Live;

public sealed class TelemetrySnapshot
{
    public int SpeedKph { get; init; }
    public int Gear { get; init; }
    public int Rpm { get; init; }
    public int RpmMax { get; init; } = 8000;
    public double Throttle { get; init; }
    public double Brake { get; init; }
    public double Delta { get; init; }
    public string LapTime { get; init; } = "1:32.418";
    public string BestLap { get; init; } = "1:31.982";
    public int FuelLiters { get; init; }
    public int TireFrontLeft { get; init; }
    public int TireFrontRight { get; init; }
    public int TireRearLeft { get; init; }
    public int TireRearRight { get; init; }
    public int Sector { get; init; }
}
