namespace Sprint.Desktop.Features.Dashes;

public sealed record DashWidgetDefinition(string Type, string Name, IReadOnlyList<string> Bindings);

public static class DashWidgetCatalog
{
    private static readonly IReadOnlyDictionary<string, DashWidgetDefinition> Definitions =
        new Dictionary<string, DashWidgetDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            ["header"] = Definition("header", "Header", "session.name", "flags.summary"),
            ["text"] = Definition("text", "Text", "profile.driverName", "profile.driverNumber"),
            ["rpm_bar"] = Definition("rpm_bar", "RPM Bar", "car.rpm", "car.maxRpm"),
            ["gear_speed"] = Definition("gear_speed", "Gear + Speed", "car.gear", "car.speed"),
            ["input_trace"] = Definition("input_trace", "Input Trace", "inputs.throttle", "inputs.brake", "inputs.clutch", "inputs.steering"),
            ["sector"] = Definition("sector", "Sectors", "lap.sector", "lap.current", "lap.best"),
            ["lap_time"] = Definition("lap_time", "Lap Time", "lap.current", "lap.last", "lap.best"),
            ["delta"] = Definition("delta", "Delta", "lap.delta", "lap.target"),
            ["fuel"] = Definition("fuel", "Fuel", "car.fuelLiters", "car.fuelPerLapLiters"),
            ["tyre_temp"] = Definition("tyre_temp", "Tyre Temperature", "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            ["flag"] = Definition("flag", "Flags", "flags.yellow", "flags.red", "flags.safetyCar"),
            ["tc"] = Definition("tc", "Traction Control", "electronics.tc", "electronics.tcActive")
        };

    public static IReadOnlyCollection<DashWidgetDefinition> All => Definitions.Values.ToArray();

    public static bool IsKnown(string type)
    {
        return Definitions.ContainsKey(type);
    }

    public static DashWidgetDefinition Get(string type)
    {
        if (Definitions.TryGetValue(type, out var definition))
        {
            return definition;
        }

        throw new KeyNotFoundException($"Unknown dash widget type '{type}'.");
    }

    private static DashWidgetDefinition Definition(string type, string name, params string[] bindings)
    {
        return new DashWidgetDefinition(type, name, bindings);
    }
}
