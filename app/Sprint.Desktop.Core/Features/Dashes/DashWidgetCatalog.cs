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

    /// <summary>On or off, stored as <c>"on"</c> / <c>"off"</c>; the default is not written.</summary>
    Switch,
}

/// <summary>A per-widget-type configurable field surfaced in the editor inspector.</summary>
public sealed record DashConfigDef(string Key, string Label, DashConfigKind Kind, string? Default = null, IReadOnlyList<DashConfigOption>? Options = null)
{
    public IReadOnlyList<DashConfigOption> Options { get; init; } = Options ?? [];
}

public sealed record DashConfigOption(string Value, string Label);

public static class DashWidgetCatalog
{
    // The text widget reads config["content"] (literal) and config["binding"] (who drives and where,
    // wins over content; TEXT_BINDINGS in the renderer). Live values have widgets of their own.
    private static readonly IReadOnlyList<DashConfigDef> TextConfig =
    [
        new DashConfigDef("content", "Text", DashConfigKind.Text, Default: ""),
        new DashConfigDef("binding", "Shows instead", DashConfigKind.Select, Default: "", Options:
        [
            new DashConfigOption("", "Nothing (the text)"),
            new DashConfigOption("profile.driverName", "Driver name"),
            new DashConfigOption("profile.driverNumber", "Driver number"),
            new DashConfigOption("session.track", "Track"),
            new DashConfigOption("session.car", "Car"),
        ]),
    ];

    // The gear reads what it shows round its digit (GearParts in the renderer): the inputs and the
    // revs and speed unless switched off, the speed above the revs when flipped.
    private static readonly IReadOnlyList<DashConfigDef> GearConfig =
    [
        new DashConfigDef("inputs", "Throttle, brake and clutch", DashConfigKind.Switch, Default: "on"),
        new DashConfigDef("readouts", "RPM and speed", DashConfigKind.Switch, Default: "on"),
        new DashConfigDef("flip", "Speed above, RPM below", DashConfigKind.Switch, Default: "off"),
    ];

    // The tyre widget reads config["corner"]: which of the four it shows.
    private static readonly IReadOnlyList<DashConfigDef> TyreConfig =
    [
        new DashConfigDef("corner", "Tyre", DashConfigKind.Select, Default: "fl", Options:
        [
            new DashConfigOption("fl", "Front left"),
            new DashConfigOption("fr", "Front right"),
            new DashConfigOption("rl", "Rear left"),
            new DashConfigOption("rr", "Rear right"),
        ]),
    ];

    // IdleCapable marks widgets meaningful on the idle (parked/pre-session) page.
    // Live-timing/telemetry widgets are hidden from the idle palette.
    private static readonly IReadOnlyDictionary<string, DashWidgetDefinition> Definitions =
        new Dictionary<string, DashWidgetDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            ["text"] = Definition("text", "Text", idleCapable: true, config: TextConfig, "profile.driverName", "profile.driverNumber"),
            ["rpm_bar"] = Definition("rpm_bar", "RPM Bar", idleCapable: false, "car.rpm", "car.maxRpm"),
            ["gear"] = Definition("gear", "Gear", idleCapable: true, GearConfig, "car.gear", "car.rpm", "car.maxRpm", "car.speed", "inputs.throttle", "inputs.brake", "inputs.clutch"),
            ["gear_speed"] = Definition("gear_speed", "Gear + Speed", idleCapable: true, "car.gear", "car.speed"),
            ["input_trace"] = Definition("input_trace", "Input Trace", idleCapable: false, "inputs.throttle", "inputs.brake", "inputs.clutch", "inputs.steering"),
            // One lap time each. A current or last lap that does not count shows "-:--.---".
            ["current_lap"] = Definition("current_lap", "Current Lap", idleCapable: false, "lap.current", "lap.isValid"),
            ["last_lap"] = Definition("last_lap", "Last Lap", idleCapable: false, "lap.last", "lap.lastLapValid", "lap.best", "lap.sessionBest", "lap.classBest"),
            ["best_lap"] = Definition("best_lap", "Best Lap", idleCapable: false, "lap.best"),
            ["session_best"] = Definition("session_best", "Session Best", idleCapable: false, "lap.sessionBest"),
            ["class_best"] = Definition("class_best", "Class Best", idleCapable: false, "lap.classBest"),
            ["delta"] = Definition("delta", "Delta", idleCapable: false, "lap.delta", "lap.target"),
            // The fuel in the tank alone; its laps are fuel_laps. It warns from the app-wide fuel warning.
            ["fuel"] = Definition("fuel", "Fuel", idleCapable: true, "car.fuelLiters", "car.fuelPerLapLiters"),
            // The tread temperature (surface) per corner, coloured against the compound's ideal.
            ["tyre_temp"] = Definition("tyre_temp", "Tyre Temperature", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            // The car's settings: the step alone, "-" when the car lacks the setting, "OFF" at 0 for
            // the assists; TC and ABS light up while they work.
            ["tc"] = Definition("tc", "TC", idleCapable: false, "electronics.tc", "electronics.tcActive"),
            ["tc2"] = Definition("tc2", "TC 2", idleCapable: false, "electronics.tcCut"),
            ["tc_slip"] = Definition("tc_slip", "TC Slip", idleCapable: false, "electronics.tcSlip"),
            ["abs"] = Definition("abs", "ABS", idleCapable: false, "electronics.abs", "electronics.absActive"),
            ["engine_map"] = Definition("engine_map", "Engine Map", idleCapable: false, "electronics.motorMap"),
            ["brake_bias"] = Definition("brake_bias", "Brake Bias", idleCapable: false, "car.brakeBiasRear"),
            ["migration"] = Definition("migration", "Brake Migration", idleCapable: false, "electronics.migration"),
            ["arb_front"] = Definition("arb_front", "ARB Front", idleCapable: false, "electronics.frontAntiRollBar"),
            ["arb_rear"] = Definition("arb_rear", "ARB Rear", idleCapable: false, "electronics.rearAntiRollBar"),
            ["lights"] = Definition("lights", "Lights", idleCapable: false, "car.headlights", "car.wiperState"),
            // The plan's figure, not the car's: actual consumption is what the "fuel" widget
            // already shows, and a target that followed it could never be missed (#189).
            ["fuel_target"] = Definition("fuel_target", "Fuel Target", idleCapable: false, "target.fuelPerLapLiters"),
            // Race-context and hybrid readouts real dashboards expose (US30). Each binds to
            // the unified TelemetryFrame and degrades to "--" when its channel is absent.
            ["position"] = Definition("position", "Position", idleCapable: false, "race.position", "race.totalPositions"),
            ["class_position"] = Definition("class_position", "Class Position", idleCapable: false, "field.classPlace", "field.carClass"),
            // One gap each, unsigned; the host times every one from where the cars were when.
            ["gap_ahead"] = Definition("gap_ahead", "Gap Ahead", idleCapable: false, "race.gapAhead"),
            ["gap_behind"] = Definition("gap_behind", "Gap Behind", idleCapable: false, "race.gapBehind"),
            ["class_gap_ahead"] = Definition("class_gap_ahead", "Class Gap Ahead", idleCapable: false, "race.classGapAhead"),
            ["class_gap_behind"] = Definition("class_gap_behind", "Class Gap Behind", idleCapable: false, "race.classGapBehind"),
            ["position_gap_ahead"] = Definition("position_gap_ahead", "Position Gap Ahead", idleCapable: false, "race.positionGapAhead"),
            ["position_gap_behind"] = Definition("position_gap_behind", "Position Gap Behind", idleCapable: false, "race.positionGapBehind"),
            ["gap_to_leader"] = Definition("gap_to_leader", "Gap to Leader", idleCapable: false, "race.gapToLeader"),
            ["gap_to_class_leader"] = Definition("gap_to_class_leader", "Gap to Class Leader", idleCapable: false, "race.gapToClassLeader"),
            // Track-limit steps towards the next penalty ("2/4"), incidents, and pit stops against the
            // stops the game's strategy plans ("1/2").
            ["track_limits"] = Definition("track_limits", "Track Limits", idleCapable: false, "penalties.trackLimitSteps", "penalties.trackLimitStepsPerPenalty"),
            ["incidents"] = Definition("incidents", "Incidents", idleCapable: false, "penalties.incidents"),
            ["pit_stops"] = Definition("pit_stops", "Pit Stops", idleCapable: false, "penalties.pitStops", "penalties.scheduledPitStops"),
            // The lap the driver is on course for (the target plus the delta), and the driver's best
            // sectors added up.
            ["predictive_lap"] = Definition("predictive_lap", "Predicted Lap", idleCapable: false, "lap.target", "lap.delta"),
            ["optimal_lap"] = Definition("optimal_lap", "Optimal Lap", idleCapable: false, "lap.personalBestSectors"),
            // The host works these out: averages of the driver's valid laps, the stored best at
            // this track in this car, and what a stop costs.
            ["lap_avg_5"] = Definition("lap_avg_5", "5 Lap Average", idleCapable: false, "lap.lastFiveLapsAverage"),
            ["lap_avg_10"] = Definition("lap_avg_10", "10 Lap Average", idleCapable: false, "lap.lastTenLapsAverage"),
            ["all_time_best"] = Definition("all_time_best", "All-Time Best", idleCapable: false, "lap.allTimeBest"),
            ["session_name"] = Definition("session_name", "Session", idleCapable: false, "session.type"),
            ["session_time"] = Definition("session_time", "Session Time", idleCapable: false, "session.time"),
            ["pit_loss"] = Definition("pit_loss", "Pit Loss", idleCapable: false, "lap.pitLoss"),
            ["tyre_pressure"] = Definition("tyre_pressure", "Tyre Pressure", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            // The four corners each: the carcass temperature, last lap's average tread temperature and
            // wear (the host measures those), the brakes; and the laps the most worn tyre lasts.
            ["tyre_core_temp"] = Definition("tyre_core_temp", "Tyre Core Temperature", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            ["tyre_avg"] = Definition("tyre_avg", "Tyre Average Temperature", idleCapable: false, "tires.averageTempLastLap"),
            ["brake_temp"] = Definition("brake_temp", "Brake Temperature", idleCapable: true, "tires.brakeTemp"),
            // The same four corners as bare coloured numbers, the motorsport look.
            ["tyre_temp_numbers"] = Definition("tyre_temp_numbers", "Tyre Temp Numbers", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            ["brake_temp_numbers"] = Definition("brake_temp_numbers", "Brake Temp Numbers", idleCapable: true, "tires.brakeTemp"),
            ["tyre_brake_temp_numbers"] = Definition("tyre_brake_temp_numbers", "Tyre + Brake Numbers", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr", "tires.brakeTemp"),
            ["tyre_wear_lap"] = Definition("tyre_wear_lap", "Wear Per Lap", idleCapable: false, "tires.wearLastLap"),
            ["tyre_laps_left"] = Definition("tyre_laps_left", "Tyre Laps Left", idleCapable: false, "tires.wear", "tires.wearLastLap"),
            // LMU's virtual energy, one figure each (legacy "ers" widgets migrate to ve_percent). The
            // level and its laps warn from the app-wide fuel warning; the refuel splits over the
            // stops the game's strategy still plans.
            ["ve_percent"] = Definition("ve_percent", "Virtual Energy", idleCapable: false, "energy.virtual"),
            ["ve_per_lap"] = Definition("ve_per_lap", "VE Per Lap", idleCapable: false, "energy.perLap"),
            ["ve_last_lap"] = Definition("ve_last_lap", "VE Last Lap", idleCapable: false, "energy.lastLap"),
            ["ve_stint_avg"] = Definition("ve_stint_avg", "VE Stint Average", idleCapable: false, "energy.stintPerLap"),
            ["ve_refuel"] = Definition("ve_refuel", "VE Refuel", idleCapable: false, "energy.virtual", "energy.perLap", "penalties.scheduledPitStops"),
            // The hybrid: the battery's charge, what the motor deploys and regenerates and what it is
            // doing (lit while deploying or regenerating), and the game's lift-and-coast cue.
            ["battery"] = Definition("battery", "Battery", idleCapable: false, "energy.soc"),
            ["deploy"] = Definition("deploy", "Deploy", idleCapable: false, "energy.deploy"),
            ["regen"] = Definition("regen", "Regen", idleCapable: false, "energy.regen"),
            ["motor_state"] = Definition("motor_state", "Motor State", idleCapable: false, "energy.motorState"),
            ["lift_coast"] = Definition("lift_coast", "Lift & Coast", idleCapable: false, "energy.liftAndCoast"),
            // The cars round ours on the road and the car's bodywork: the renderer reads the frame's
            // other cars (field) and damage for these.
            ["relative"] = Definition("relative", "Relative", idleCapable: false, "race.position"),
            ["damage"] = Definition("damage", "Damage", idleCapable: false),
            // The bars, one widget each (no label or value: a meter; standing in a side spot, lying
            // across the top), then one tyre with its stripes and brake, the sectors as coloured
            // times and single values.
            ["fuel_bar"] = Definition("fuel_bar", "Fuel Bar", idleCapable: false, "car.fuelLiters", "car.fuelCapacityLiters"),
            ["ve_bar"] = Definition("ve_bar", "VE Bar", idleCapable: false, "energy.virtual"),
            ["battery_bar"] = Definition("battery_bar", "Battery Bar", idleCapable: false, "energy.soc"),
            ["fuel_ve_bar"] = Definition("fuel_ve_bar", "Fuel + VE Bar", idleCapable: false, "car.fuelLiters", "car.fuelCapacityLiters", "energy.virtual"),
            ["delta_bar"] = Definition("delta_bar", "Delta Bar", idleCapable: false, "lap.delta"),
            ["gap_bar"] = Definition("gap_bar", "Gap Bar", idleCapable: false, "race.gapAhead", "race.gapBehind"),
            ["class_gap_bar"] = Definition("class_gap_bar", "Class Gap Bar", idleCapable: false, "race.classGapAhead", "race.classGapBehind"),
            ["sector_bar"] = Definition("sector_bar", "Sector Bar", idleCapable: false, "lap.sectors", "lap.sectorBests"),
            ["inputs_bar"] = Definition("inputs_bar", "Inputs Bar", idleCapable: false, "inputs.throttle", "inputs.brake"),
            ["throttle_bar"] = Definition("throttle_bar", "Throttle Bar", idleCapable: false, "inputs.throttle"),
            ["brake_bar"] = Definition("brake_bar", "Brake Bar", idleCapable: false, "inputs.brake"),
            ["clutch_bar"] = Definition("clutch_bar", "Clutch Bar", idleCapable: false, "inputs.clutch"),
            ["spotter_bar"] = Definition("spotter_bar", "Spotter", idleCapable: false, "race.carLeft", "race.carRight"),
            ["relative_bar"] = Definition("relative_bar", "Relative Bar", idleCapable: false, "field.lapDistance"),
            ["tyre"] = Definition("tyre", "Tyre", idleCapable: true, TyreConfig, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            ["sectors"] = Definition("sectors", "Sectors", idleCapable: false, "lap.sectors", "lap.sectorBests"),
            ["speed"] = Definition("speed", "Speed", idleCapable: true, "car.speed"),
            ["laps"] = Definition("laps", "Lap", idleCapable: false, "lap.number", "session.maxLaps", "session.timeRemaining"),
            ["fuel_laps"] = Definition("fuel_laps", "Fuel Laps Left", idleCapable: false, "car.fuelLiters", "car.fuelPerLapLiters"),
            ["ve_laps"] = Definition("ve_laps", "Energy Laps Left", idleCapable: false, "energy.virtual", "energy.perLap"),
            ["time_left"] = Definition("time_left", "Time Left", idleCapable: false, "session.timeRemaining"),
            // Strategy, conditions and timing beyond the driver's own laps.
            ["fuel_avg"] = Definition("fuel_avg", "Fuel Average (5 Laps)", idleCapable: false, "car.fuelPerLapLiters"),
            ["fuel_stint_avg"] = Definition("fuel_stint_avg", "Fuel Stint Average", idleCapable: false, "car.fuelStintPerLapLiters"),
            ["fuel_last_lap"] = Definition("fuel_last_lap", "Fuel Last Lap", idleCapable: false, "car.fuelLastLapLiters"),
            ["fuel_this_lap"] = Definition("fuel_this_lap", "Fuel This Lap", idleCapable: false, "car.fuelThisLapLiters"),
            ["fuel_percent"] = Definition("fuel_percent", "Fuel Percent", idleCapable: true, "car.fuelLiters", "car.fuelCapacityLiters"),
            // Laps until the fuel or the virtual energy runs out, whichever first (its title says
            // which); the two side by side; and the lap from which one stop reaches the flag.
            ["range"] = Definition("range", "Range", idleCapable: false, "car.fuelLiters", "car.fuelPerLapLiters", "energy.virtual", "energy.perLap"),
            ["fuel_ve"] = Definition("fuel_ve", "Fuel + VE", idleCapable: false, "car.fuelLiters", "energy.virtual"),
            ["pit_window"] = Definition("pit_window", "Pit Window", idleCapable: false, "car.fuelLiters", "car.fuelCapacityLiters", "car.fuelPerLapLiters", "energy.virtual", "energy.perLap", "session.maxLaps", "session.timeRemaining"),
            ["fuel_time"] = Definition("fuel_time", "Fuel Time Left", idleCapable: false, "car.fuelLiters", "car.fuelPerLapLiters", "lap.last"),
            ["laps_left"] = Definition("laps_left", "Race Laps Left", idleCapable: false, "session.maxLaps", "session.timeRemaining", "lap.last"),
            ["refuel"] = Definition("refuel", "Refuel", idleCapable: false, "car.fuelLiters", "car.fuelPerLapLiters", "session.timeRemaining", "penalties.scheduledPitStops"),
            ["clock"] = Definition("clock", "Clock", idleCapable: true, "frame.timestamp"),
            ["air_temp"] = Definition("air_temp", "Air Temperature", idleCapable: true, "conditions.airTemperature"),
            ["track_temp"] = Definition("track_temp", "Track Temperature", idleCapable: true, "conditions.trackTemperature"),
            ["rain"] = Definition("rain", "Rain", idleCapable: true, "conditions.raining", "conditions.pathWetness"),
            ["oil_temp"] = Definition("oil_temp", "Oil Temperature", idleCapable: true, "car.oilTemp"),
            ["water_temp"] = Definition("water_temp", "Water Temperature", idleCapable: true, "car.waterTemp"),
            // The turbo's boost as the game reports it, torque and RPM, and the hybrid motor's and its
            // cooling water's temperatures ("-" without a turbo or a hybrid).
            ["boost"] = Definition("boost", "Boost", idleCapable: false, "car.turboBoostPressure"),
            ["torque"] = Definition("torque", "Torque", idleCapable: false, "car.engineTorqueNewtonMeters"),
            ["rpm"] = Definition("rpm", "RPM", idleCapable: false, "car.rpm"),
            ["motor_temp"] = Definition("motor_temp", "Motor Temperature", idleCapable: true, "energy.motorTemp"),
            ["motor_water_temp"] = Definition("motor_water_temp", "Motor Water Temperature", idleCapable: true, "energy.motorWaterTemp"),
            ["penalty"] = Definition("penalty", "Penalties", idleCapable: false, "field.penalties"),
            ["tyre_wear"] = Definition("tyre_wear", "Tyre Wear", idleCapable: true, "tires.fl", "tires.fr", "tires.rl", "tires.rr"),
            ["sector_time"] = Definition("sector_time", "Sector Time", idleCapable: false, "lap.sectors", "lap.sectorBests"),
            // Not dash widgets: only the built-in screens of a device's purpose place these
            // (DevicePurposeLayouts), so the designer never offers them (widgetTypes.ts).
            ["flag"] = Definition("flag", "Flags", idleCapable: true, "flags.yellow", "flags.red", "flags.safetyCar"),
            ["racelogic_lap_timer"] = Definition(
                "racelogic_lap_timer",
                "RaceLogic Lap Timer",
                idleCapable: false,
                "lap.current",
                "lap.last",
                "lap.best",
                "lap.target",
                "lap.delta",
                "car.speed"),
        };

    public static IReadOnlyCollection<DashWidgetDefinition> All => Definitions.Values.ToArray();

    public static bool IsKnown(string type)
    {
        return Definitions.ContainsKey(type);
    }

    public static DashWidgetDefinition Get(string type)
    {
        if (Definitions.TryGetValue(type, out DashWidgetDefinition? definition))
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
