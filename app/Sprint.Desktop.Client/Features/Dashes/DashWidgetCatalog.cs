namespace Sprint.Desktop.Features.Dashes;

public sealed record DashWidgetDefinition(string Type, string Name, IReadOnlyList<string> Bindings, bool IdleCapable = true);

public static class DashWidgetCatalog
{
    // IdleCapable marks widgets meaningful on the idle (parked/pre-session) page.
    // Live-timing/telemetry widgets are hidden from the idle palette.
    private static readonly IReadOnlyDictionary<string, DashWidgetDefinition> Definitions =
        new Dictionary<string, DashWidgetDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            ["header"] = Definition("header", "Header", idleCapable: true, "session.name", "flags.summary"),
            ["text"] = Definition("text", "Text", idleCapable: true, "profile.driverName", "profile.driverNumber"),
            ["rpm_bar"] = Definition("rpm_bar", "RPM Bar", idleCapable: false, "car.rpm", "car.maxRpm"),
            ["gear_speed"] = Definition("gear_speed", "Gear + Speed", idleCapable: true, "car.gear", "car.speed"),
            ["input_trace"] = Definition("input_trace", "Input Trace", idleCapable: false, "inputs.throttle", "inputs.brake", "inputs.clutch", "inputs.steering"),
            ["sector"] = Definition("sector", "Sectors", idleCapable: false, "lap.sector", "lap.current", "lap.best"),
            ["lap_time"] = Definition("lap_time", "Lap Time", idleCapable: false, "lap.current", "lap.last", "lap.best"),
            ["delta"] = Definition("delta", "Delta", idleCapable: false, "lap.delta", "lap.target"),
            ["fuel"] = Definition("fuel", "Fuel", idleCapable: true, "car.fuelLiters", "car.fuelPerLapLiters"),
            ["tyre_temp"] = Definition("tyre_temp", "Tyre Temperature", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            ["flag"] = Definition("flag", "Flags", idleCapable: true, "flags.yellow", "flags.red", "flags.safetyCar"),
            ["tc"] = Definition("tc", "Traction Control", idleCapable: false, "electronics.tc", "electronics.tcActive")
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

    private static DashWidgetDefinition Definition(string type, string name, bool idleCapable, params string[] bindings)
    {
        return new DashWidgetDefinition(type, name, bindings, idleCapable);
    }
}
