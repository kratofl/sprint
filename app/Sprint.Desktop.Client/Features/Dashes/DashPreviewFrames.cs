using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// A deliberate dash state the editor can simulate for testing (PRD #122 Preview
/// menu, US26). <see cref="Live"/> uses the real telemetry frame; every other state
/// overrides the render frame with a representative canned frame so a user can verify
/// the dash looks right in each condition without being in a live session.
/// </summary>
public enum DashPreviewState
{
    Live,
    Idle,
    MidLap,
    Redline,
    LowFuel,
    YellowFlag,
    RedFlag,
    Pit,
}

/// <summary>
/// Builds representative telemetry frames for each <see cref="DashPreviewState"/>.
/// Pure and deterministic so preview rendering and the controller seam are unit-testable.
/// </summary>
public static class DashPreviewFrames
{
    public static readonly IReadOnlyList<(DashPreviewState State, string Label)> Menu =
    [
        (DashPreviewState.Live, "Live / demo"),
        (DashPreviewState.Idle, "Idle"),
        (DashPreviewState.MidLap, "Mid-lap"),
        (DashPreviewState.Redline, "Redline"),
        (DashPreviewState.LowFuel, "Low fuel"),
        (DashPreviewState.YellowFlag, "Yellow flag"),
        (DashPreviewState.RedFlag, "Red flag"),
        (DashPreviewState.Pit, "Pit"),
    ];

    /// <summary>The frame to render for a preview state; <see cref="DashPreviewState.Live"/> passes the live frame through.</summary>
    public static TelemetryFrame Resolve(DashPreviewState state, TelemetryFrame live) =>
        state == DashPreviewState.Live ? live : For(state);

    /// <summary>The canned frame for a simulated state (never called for <see cref="DashPreviewState.Live"/>).</summary>
    public static TelemetryFrame For(DashPreviewState state) => state switch
    {
        DashPreviewState.Idle => Base() with
        {
            Car = Base().Car with { Gear = 0, Rpm = 1100, SpeedMetersPerSecond = 0, Throttle = 0, Brake = 0 },
            Lap = Base().Lap with { CurrentLapTime = 0, Sector = 0 },
            Session = Base().Session with { InCar = false },
        },
        DashPreviewState.Redline => Base() with
        {
            Car = Base().Car with { Gear = 5, Rpm = 8850, MaxRpm = 9000, SpeedMetersPerSecond = 78, Throttle = 1f },
        },
        DashPreviewState.LowFuel => Base() with
        {
            Car = Base().Car with { FuelLiters = 2.4f, FuelPerLapLiters = 2.6f },
        },
        DashPreviewState.YellowFlag => Base() with
        {
            Flags = new RaceFlags { Yellow = true },
        },
        DashPreviewState.RedFlag => Base() with
        {
            Flags = new RaceFlags { Red = true },
            Car = Base().Car with { Gear = 0, Rpm = 1200, SpeedMetersPerSecond = 0, Throttle = 0, Brake = 1f },
        },
        DashPreviewState.Pit => Base() with
        {
            Car = Base().Car with { Gear = 1, Rpm = 3200, SpeedMetersPerSecond = 16, Throttle = 0.3f },
            Lap = Base().Lap with { Sector = 3 },
        },
        _ => Base(), // MidLap and any future state fall back to the representative base frame.
    };

    // A healthy mid-lap racing frame used directly for MidLap and as the base every
    // other simulated state tweaks.
    private static TelemetryFrame Base() => new()
    {
        Session = new SessionInfo
        {
            Game = "Preview",
            Track = "Preview Circuit",
            Car = "GT3",
            SessionType = SessionType.Race,
            BestLapTime = 103.412,
            MaxLaps = 24,
            InCar = true,
        },
        Car = new CarState
        {
            SpeedMetersPerSecond = 61f,
            Gear = 4,
            Rpm = 7200,
            MaxRpm = 9000,
            Throttle = 0.82f,
            Brake = 0f,
            FuelLiters = 42f,
            FuelPerLapLiters = 2.6f,
            BrakeBiasRear = 43.5f,
        },
        Lap = new LapState
        {
            CurrentLap = 7,
            CurrentLapTime = 48.317,
            LastLapTime = 104.021,
            BestLapTime = 103.412,
            TargetLapTime = 103.900,
            Delta = -0.184,
            Sector = 2,
            IsValid = true,
            TrackPosition = 0.46f,
        },
        Flags = new RaceFlags(),
        Electronics = new ElectronicsState
        {
            TractionControl = 4,
            TractionControlMax = 12,
            Abs = 3,
            AbsMax = 12,
            MotorMap = 3,
            MotorMapMax = 8,
        },
        Energy = new EnergyState
        {
            VirtualEnergy = 68,
            VirtualEnergyPerLap = 3.4f,
            RegenPower = 18,
            DeployPower = 92,
        },
        Race = new RaceState { Position = 4, TotalPositions = 20, GapAhead = -1.2f, GapBehind = 0.8f },
        Tires =
        [
            new() { Position = TirePosition.FrontLeft, TempSurfaceCelsius = 86, PressureKPa = 165 },
            new() { Position = TirePosition.FrontRight, TempSurfaceCelsius = 88, PressureKPa = 166 },
            new() { Position = TirePosition.RearLeft, TempSurfaceCelsius = 91, PressureKPa = 162 },
            new() { Position = TirePosition.RearRight, TempSurfaceCelsius = 92, PressureKPa = 163 },
        ],
    };
}
