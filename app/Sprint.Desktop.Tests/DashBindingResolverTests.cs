using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashBindingResolverTests
{
    [Fact]
    public void ResolvesCriticalTelemetryBindings()
    {
        var frame = new TelemetryFrame
        {
            Session = new SessionInfo { Game = "LMU", Track = "Le Mans", Car = "Hypercar", InCar = true },
            Car = new CarState
            {
                SpeedMetersPerSecond = 80,
                Gear = 4,
                Rpm = 9225,
                MaxRpm = 10000,
                Throttle = 0.75f,
                Brake = 0.15f,
                Clutch = 0.05f,
                Steering = -0.2f,
                FuelLiters = 41.2f,
                FuelPerLapLiters = 2.7f
            },
            Lap = new LapState
            {
                CurrentLap = 12,
                CurrentLapTime = 83.456,
                LastLapTime = 84.1,
                BestLapTime = 82.9,
                TargetLapTime = 82.5,
                Delta = -0.321,
                Sector = 2
            },
            Flags = new RaceFlags { Yellow = true, Red = false, SafetyCar = true },
            Electronics = new ElectronicsState
            {
                TractionControl = 4,
                TractionControlActive = true,
                Abs = 6,
                MotorMap = 2
            },
            Tires =
            [
                new() { Position = TirePosition.FrontLeft, TempSurfaceCelsius = 91, PressureKPa = 184 },
                new() { Position = TirePosition.FrontRight, TempSurfaceCelsius = 92, PressureKPa = 185 },
                new() { Position = TirePosition.RearLeft, TempSurfaceCelsius = 88, PressureKPa = 181 },
                new() { Position = TirePosition.RearRight, TempSurfaceCelsius = 89, PressureKPa = 182 }
            ]
        };

        var settings = new AppSettings { DriverName = "Ada", DriverNumber = "77" };
        var context = new DashBindingContext(frame, settings);

        Assert.Equal(288, DashBindingResolver.Resolve(context, "car.speed"));
        Assert.Equal(4, DashBindingResolver.Resolve(context, "car.gear"));
        Assert.Equal(9225, DashBindingResolver.Resolve(context, "car.rpm"));
        Assert.Equal(0.75f, DashBindingResolver.Resolve(context, "inputs.throttle"));
        Assert.Equal(-0.321, DashBindingResolver.Resolve(context, "lap.delta"));
        Assert.Equal(2, DashBindingResolver.Resolve(context, "lap.sector"));
        Assert.True((bool)DashBindingResolver.Resolve(context, "flags.yellow")!);
        Assert.True((bool)DashBindingResolver.Resolve(context, "flags.safetyCar")!);
        Assert.Equal(4, DashBindingResolver.Resolve(context, "electronics.tc"));
        Assert.True((bool)DashBindingResolver.Resolve(context, "electronics.tcActive")!);
        Assert.Equal(91, DashBindingResolver.Resolve(context, "tires.fl.surfaceTemp"));
        Assert.Equal("Ada", DashBindingResolver.Resolve(context, "profile.driverName"));
        Assert.Equal("77", DashBindingResolver.Resolve(context, "profile.driverNumber"));
    }

    [Fact]
    public void UnknownBindingReturnsNull()
    {
        var context = new DashBindingContext(new TelemetryFrame(), new AppSettings());

        Assert.Null(DashBindingResolver.Resolve(context, "unknown.path"));
    }
}
