using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Dashes;

public sealed record DashBindingContext(TelemetryFrame Frame, AppSettings Settings);

public static class DashBindingResolver
{
    public static object? Resolve(DashBindingContext context, string path)
    {
        return path switch
        {
            "session.name" => context.Frame.Session.SessionType.ToString(),
            "session.game" => context.Frame.Session.Game,
            "session.track" => context.Frame.Session.Track,
            "session.car" => context.Frame.Session.Car,
            "car.speed" => (int)Math.Round(context.Frame.Car.SpeedMetersPerSecond * 3.6f),
            "car.gear" => context.Frame.Car.Gear,
            "car.rpm" => (int)Math.Round(context.Frame.Car.Rpm),
            "car.maxRpm" => (int)Math.Round(context.Frame.Car.MaxRpm),
            "car.fuelLiters" => context.Frame.Car.FuelLiters,
            "car.fuelPerLapLiters" => context.Frame.Car.FuelPerLapLiters,
            "car.brakeBiasRear" => context.Frame.Car.BrakeBiasRear,
            "inputs.throttle" => context.Frame.Car.Throttle,
            "inputs.brake" => context.Frame.Car.Brake,
            "inputs.clutch" => context.Frame.Car.Clutch,
            "inputs.steering" => context.Frame.Car.Steering,
            "lap.current" => context.Frame.Lap.CurrentLapTime,
            "lap.last" => context.Frame.Lap.LastLapTime,
            "lap.best" => context.Frame.Lap.BestLapTime,
            "lap.target" => context.Frame.Lap.TargetLapTime,
            "lap.delta" => context.Frame.Lap.Delta,
            "lap.sector" => context.Frame.Lap.Sector,
            "flags.summary" => FlagSummary(context.Frame.Flags),
            "flags.yellow" => context.Frame.Flags.Yellow,
            "flags.red" => context.Frame.Flags.Red,
            "flags.safetyCar" => context.Frame.Flags.SafetyCar,
            "electronics.tc" => (int)context.Frame.Electronics.TractionControl,
            "electronics.tcActive" => context.Frame.Electronics.TractionControlActive,
            "electronics.abs" => (int)context.Frame.Electronics.Abs,
            "electronics.motorMap" => (int)context.Frame.Electronics.MotorMap,
            "energy.virtual" => context.Frame.Energy.VirtualEnergy,
            "energy.perLap" => context.Frame.Energy.VirtualEnergyPerLap,
            "energy.soc" => context.Frame.Energy.StateOfCharge,
            "energy.regen" => context.Frame.Energy.RegenPower,
            "energy.deploy" => context.Frame.Energy.DeployPower,
            "tires.fl" => Tire(context.Frame, TirePosition.FrontLeft),
            "tires.fr" => Tire(context.Frame, TirePosition.FrontRight),
            "tires.rl" => Tire(context.Frame, TirePosition.RearLeft),
            "tires.rr" => Tire(context.Frame, TirePosition.RearRight),
            "tires.fl.surfaceTemp" => TireSurfaceTemp(context.Frame, TirePosition.FrontLeft),
            "tires.fr.surfaceTemp" => TireSurfaceTemp(context.Frame, TirePosition.FrontRight),
            "tires.rl.surfaceTemp" => TireSurfaceTemp(context.Frame, TirePosition.RearLeft),
            "tires.rr.surfaceTemp" => TireSurfaceTemp(context.Frame, TirePosition.RearRight),
            "profile.driverName" => context.Settings.DriverName,
            "profile.driverNumber" => context.Settings.DriverNumber,
            _ => null
        };
    }

    private static TireState? Tire(TelemetryFrame frame, TirePosition position)
    {
        return frame.Tires.FirstOrDefault(tire => tire.Position == position);
    }

    private static int? TireSurfaceTemp(TelemetryFrame frame, TirePosition position)
    {
        var tire = Tire(frame, position);
        return tire is null ? null : (int)Math.Round(tire.TempSurfaceCelsius);
    }

    private static string FlagSummary(RaceFlags flags)
    {
        if (flags.Red)
        {
            return "RED";
        }

        if (flags.SafetyCar)
        {
            return "SC";
        }

        if (flags.VirtualSafetyCar)
        {
            return "VSC";
        }

        if (flags.Yellow || flags.DoubleYellow)
        {
            return "YELLOW";
        }

        return flags.Checkered ? "CHECKERED" : "GREEN";
    }
}
