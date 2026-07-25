namespace Sprint.Desktop.Features.Dashes;

public sealed record DashWidgetDefinition(
    string Type,
    string Name,
    IReadOnlyList<string> Bindings,
    bool IdleCapable = true,
    IReadOnlyList<DashConfigDef>? Config = null)
{
    public IReadOnlyList<DashConfigDef> Config { get; init; } = Config ?? [];
}

public enum DashConfigKind
{
    Text,
    Select,
}

/// <summary>A per-widget-type configurable field surfaced in the editor inspector.</summary>
public sealed record DashConfigDef(string Key, string Label, DashConfigKind Kind, string? Default = null, IReadOnlyList<DashConfigOption>? Options = null)
{
    public IReadOnlyList<DashConfigOption> Options { get; init; } = Options ?? [];
}

public sealed record DashConfigOption(string Value, string Label);

public static class DashWidgetCatalog
{
    // The text widget reads config["content"] (literal) and config["binding"]
    // (live telemetry value, wins over content) in DashPainter.DrawText.
    private static readonly IReadOnlyList<DashConfigDef> TextConfig =
    [
        new DashConfigDef("content", "Text", DashConfigKind.Text, Default: ""),
        new DashConfigDef("binding", "Live value", DashConfigKind.Select, Default: "", Options:
        [
            new DashConfigOption("", "None (static text)"),
            new DashConfigOption("profile.driverName", "Driver name"),
            new DashConfigOption("profile.driverNumber", "Driver number"),
            new DashConfigOption("session.track", "Track"),
            new DashConfigOption("session.car", "Car"),
            new DashConfigOption("car.speed", "Speed (km/h)"),
            new DashConfigOption("car.gear", "Gear"),
            new DashConfigOption("lap.current", "Current lap time"),
            new DashConfigOption("lap.delta", "Delta"),
        ]),
    ];

    // The virtual_energy widget reads config["mode"] in DashPainter.DrawVirtualEnergy
    // to switch between an endurance budget readout, a bare percentage, and a power view.
    private static readonly IReadOnlyList<DashConfigDef> VirtualEnergyConfig =
    [
        new DashConfigDef("mode", "Display", DashConfigKind.Select, Default: "budget", Options:
        [
            new DashConfigOption("budget", "Budget (%, per lap, laps left)"),
            new DashConfigOption("percent", "Percentage only"),
            new DashConfigOption("power", "Percentage + power (kW)"),
        ]),
    ];

    // Horizontal placement for the gear/speed stack (DashPainter.HorizontalAnchor).
    // Centre is the default; the setting exists so a widget parked at a screen edge can
    // be flushed to that edge instead.
    private static readonly IReadOnlyList<DashConfigDef> AlignConfig =
    [
        new DashConfigDef("align", "Alignment", DashConfigKind.Select, Default: "center", Options:
        [
            new DashConfigOption("center", "Centre"),
            new DashConfigOption("left", "Left"),
            new DashConfigOption("right", "Right"),
        ]),
    ];

    // Which tyre channel the tyre_temp widget reads (DashPainter.DrawTyreTemp). Surface
    // is the tread average the driver sees in-game; core is the carcass, which runs
    // cooler and moves far more slowly.
    private static readonly IReadOnlyList<DashConfigDef> TyreTempConfig =
    [
        new DashConfigDef("channel", "Reading", DashConfigKind.Select, Default: "surface", Options:
        [
            new DashConfigOption("surface", "Surface (tread average)"),
            new DashConfigOption("core", "Core (carcass)"),
        ]),
    ];

    // IdleCapable marks widgets meaningful on the idle (parked/pre-session) page.
    // Live-timing/telemetry widgets are hidden from the idle palette.
    private static readonly IReadOnlyDictionary<string, DashWidgetDefinition> Definitions =
        new Dictionary<string, DashWidgetDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            ["header"] = Definition("header", "Header", idleCapable: true, "session.name", "flags.summary"),
            ["text"] = Definition("text", "Text", idleCapable: true, config: TextConfig, "profile.driverName", "profile.driverNumber"),
            ["rpm_bar"] = Definition("rpm_bar", "RPM Bar", idleCapable: false, "car.rpm", "car.maxRpm"),
            ["gear_speed"] = Definition("gear_speed", "Gear + Speed", idleCapable: true, AlignConfig, "car.gear", "car.speed"),
            ["input_trace"] = Definition("input_trace", "Input Trace", idleCapable: false, "inputs.throttle", "inputs.brake", "inputs.clutch", "inputs.steering"),
            ["sector"] = Definition("sector", "Sectors", idleCapable: false, "lap.sector", "lap.current", "lap.best"),
            ["lap_time"] = Definition("lap_time", "Lap Time", idleCapable: false, "lap.current", "lap.last", "lap.best"),
            ["delta"] = Definition("delta", "Delta", idleCapable: false, "lap.delta", "lap.target"),
            ["fuel"] = Definition("fuel", "Fuel", idleCapable: true, "car.fuelLiters", "car.fuelPerLapLiters"),
            ["tyre_temp"] = Definition("tyre_temp", "Tyre Temperature", idleCapable: true, TyreTempConfig, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            ["flag"] = Definition("flag", "Flags", idleCapable: true, "flags.yellow", "flags.red", "flags.safetyCar"),
            ["tc"] = Definition("tc", "Traction Control", idleCapable: false, "electronics.tc", "electronics.tcActive"),
            ["abs"] = Definition("abs", "ABS", idleCapable: false, "electronics.abs"),
            ["engine_map"] = Definition("engine_map", "Engine Map", idleCapable: false, "electronics.motorMap"),
            ["brake_bias"] = Definition("brake_bias", "Brake Bias", idleCapable: false, "car.brakeBiasRear"),
            ["fuel_target"] = Definition("fuel_target", "Fuel Target", idleCapable: false, "car.fuelPerLapLiters"),
            // Race-context and hybrid readouts real dashboards expose (US30). Each binds to
            // the unified TelemetryFrame and degrades to "--" when its channel is absent.
            ["position"] = Definition("position", "Position", idleCapable: false, "race.position", "race.totalPositions"),
            ["gaps"] = Definition("gaps", "Gaps", idleCapable: false, "race.gapAhead", "race.gapBehind"),
            ["predictive_lap"] = Definition("predictive_lap", "Predictive Lap", idleCapable: false, "lap.target", "lap.best"),
            ["tyre_pressure"] = Definition("tyre_pressure", "Tyre Pressure", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            // LMU virtual-energy budget (replaces the former "ers" widget; legacy layouts
            // are migrated to this type on load). Configurable via VirtualEnergyConfig.
            ["virtual_energy"] = Definition("virtual_energy", "Virtual Energy", idleCapable: false, VirtualEnergyConfig, "energy.virtual", "energy.perLap", "energy.deploy")
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

    private static DashWidgetDefinition Definition(string type, string name, bool idleCapable, IReadOnlyList<DashConfigDef> config, params string[] bindings)
    {
        return new DashWidgetDefinition(type, name, bindings, idleCapable, config);
    }
}
