// Resolves a dash widget's binding key (e.g. "car.rpm", "lap.delta", "tires.fl") against a
// telemetry frame. Port of `packages/dashboard/src/bindings.ts` (itself ported from the desktop
// client's `DashBindingResolver.cs`); the match below mirrors its switch case for case.
//
// `narrowDashTargets` is the scene parser's `targets` narrowing (`model::parse_scene`), so it
// does not appear here again.

use crate::format::{js_number_string, round_to_even};
use crate::model::{DashSettings, DashTargets, Flags, TelemetryFrame, TireState};

/// Everything a binding can be resolved against: the car, the driver, and their plan.
#[derive(Clone, Copy)]
pub struct BindingContext<'a> {
    pub frame: &'a TelemetryFrame,
    pub settings: Option<&'a DashSettings>,
    pub targets: Option<&'a DashTargets>,
}

/// A resolved binding: the JavaScript values `resolveBinding` can return.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BindingValue<'a> {
    /// An unknown key, or a profile field that is not set.
    Undefined,
    /// A target that was not planned.
    Null,
    Number(f64),
    Bool(bool),
    Text(&'a str),
    /// A whole tyre reading (`tires.fl` and friends).
    Tire(&'a TireState),
}

impl BindingValue<'_> {
    /// The value as the text widget prints it (`stringifyBindingValue`): numbers, booleans and
    /// strings as `String(value)`, anything else as an empty string.
    pub fn to_display(&self) -> String {
        match self {
            BindingValue::Number(n) => js_number_string(*n),
            BindingValue::Bool(b) => b.to_string(),
            BindingValue::Text(s) => (*s).to_owned(),
            BindingValue::Undefined | BindingValue::Null | BindingValue::Tire(_) => String::new(),
        }
    }
}

fn optional_number<'a>(value: Option<f64>) -> BindingValue<'a> {
    value.map_or(BindingValue::Null, BindingValue::Number)
}

fn optional_text(value: Option<&str>) -> BindingValue<'_> {
    value.map_or(BindingValue::Undefined, BindingValue::Text)
}

/// Resolves a binding key to its current value, or `Undefined` when the key is unknown.
pub fn resolve_binding<'a>(context: BindingContext<'a>, path: &str) -> BindingValue<'a> {
    use BindingValue::{Bool, Number, Text};
    let frame = context.frame;
    let tire = |i: usize| &frame.tires[i];
    match path {
        "session.name" => Text(&frame.session.session_type),
        "session.game" => Text(&frame.session.game),
        "session.track" => Text(&frame.session.track),
        "session.car" => Text(&frame.session.car),
        "car.speed" => Number(round_to_even(frame.car.speed_ms * 3.6)),
        "car.gear" => Number(frame.car.gear),
        "car.rpm" => Number(round_to_even(frame.car.rpm)),
        "car.maxRpm" => Number(round_to_even(frame.car.max_rpm)),
        "car.fuelLiters" => Number(frame.car.fuel),
        "car.fuelPerLapLiters" => Number(frame.car.fuel_per_lap),
        // The frame's rear bias is a 0-1 fraction; the binding means a percentage.
        "car.brakeBiasRear" => Number(frame.car.brake_bias_rear * 100.0),
        "inputs.throttle" => Number(frame.car.throttle),
        "inputs.brake" => Number(frame.car.brake),
        "inputs.clutch" => Number(frame.car.clutch),
        "inputs.steering" => Number(frame.car.steering),
        "lap.current" => Number(frame.lap.current_lap_time),
        "lap.last" => Number(frame.lap.last_lap_time),
        "lap.best" => Number(frame.lap.best_lap_time),
        "lap.target" => Number(frame.lap.target_lap_time),
        "lap.delta" => Number(frame.lap.delta),
        "lap.sector" => Number(frame.lap.sector),
        // The plan's targets: null when none was set, never zero.
        "target.lapTime" => optional_number(context.targets.and_then(|t| t.lap_time_seconds)),
        "target.fuelPerLapLiters" => optional_number(context.targets.and_then(|t| t.fuel_per_lap_liters)),
        "flags.summary" => Text(flag_summary(&frame.flags)),
        "flags.yellow" => Bool(frame.flags.yellow),
        "flags.red" => Bool(frame.flags.red),
        "flags.safetyCar" => Bool(frame.flags.safety_car),
        "electronics.tc" => Number(frame.electronics.tc.trunc()),
        "electronics.tcActive" => Bool(frame.electronics.tc_active),
        "electronics.abs" => Number(frame.electronics.abs.trunc()),
        "electronics.motorMap" => Number(frame.electronics.motor_map.trunc()),
        "energy.virtual" => Number(frame.energy.virtual_energy),
        "energy.perLap" => Number(frame.energy.virtual_energy_per_lap),
        "energy.soc" => Number(frame.energy.soc),
        "energy.regen" => Number(frame.energy.regen_power),
        "energy.deploy" => Number(frame.energy.deploy_power),
        "race.position" => Number(frame.race.position),
        "race.totalPositions" => Number(frame.race.total_positions),
        "race.gapAhead" => Number(frame.race.gap_ahead),
        "race.gapBehind" => Number(frame.race.gap_behind),
        "tires.fl" => BindingValue::Tire(tire(0)),
        "tires.fr" => BindingValue::Tire(tire(1)),
        "tires.rl" => BindingValue::Tire(tire(2)),
        "tires.rr" => BindingValue::Tire(tire(3)),
        "tires.fl.surfaceTemp" => Number(round_to_even(tire(0).temp_surface)),
        "tires.fr.surfaceTemp" => Number(round_to_even(tire(1).temp_surface)),
        "tires.rl.surfaceTemp" => Number(round_to_even(tire(2).temp_surface)),
        "tires.rr.surfaceTemp" => Number(round_to_even(tire(3).temp_surface)),
        "profile.driverName" => optional_text(context.settings.and_then(|s| s.driver_name.as_deref())),
        "profile.driverNumber" => optional_text(context.settings.and_then(|s| s.driver_number.as_deref())),
        _ => BindingValue::Undefined,
    }
}

/// The highest-priority active flag: RED > SC > VSC > YELLOW > CHECKERED > GREEN.
pub fn flag_summary(flags: &Flags) -> &'static str {
    if flags.red {
        "RED"
    } else if flags.safety_car {
        "SC"
    } else if flags.vsc {
        "VSC"
    } else if flags.yellow || flags.double_yellow {
        "YELLOW"
    } else if flags.checkered {
        "CHECKERED"
    } else {
        "GREEN"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse_scene;

    fn base_frame() -> TelemetryFrame {
        let mut f = TelemetryFrame::default();
        f.session.game = "LMU".to_owned();
        f.session.track = "Le Mans".to_owned();
        f.session.car = "Hypercar".to_owned();
        f.session.session_type = "race".to_owned();
        f.car.speed_ms = 50.0;
        f.car.gear = 4.0;
        f.car.rpm = 8000.0;
        f.car.max_rpm = 9000.0;
        f.car.brake_bias_rear = 0.5;
        for (tire, temp) in f.tires.iter_mut().zip([85.4, 86.1, 90.6, 91.5]) {
            tire.temp_surface = temp;
        }
        f.lap.current_lap_time = 92.345;
        f.lap.delta = -0.5;
        f.electronics.tc = 3.9;
        f.electronics.abs = 2.9;
        f.electronics.motor_map = 5.1;
        f.race.position = 4.0;
        f.race.gap_ahead = 1.234;
        f
    }

    fn resolve<'a>(frame: &'a TelemetryFrame, path: &str) -> BindingValue<'a> {
        resolve_binding(BindingContext { frame, settings: None, targets: None }, path)
    }

    #[test]
    fn resolves_simple_session_car_lap_fields_directly() {
        let f = base_frame();
        assert_eq!(resolve(&f, "session.track"), BindingValue::Text("Le Mans"));
        assert_eq!(resolve(&f, "session.car"), BindingValue::Text("Hypercar"));
        assert_eq!(resolve(&f, "session.game"), BindingValue::Text("LMU"));
        assert_eq!(resolve(&f, "session.name"), BindingValue::Text("race"));
        assert_eq!(resolve(&f, "car.gear"), BindingValue::Number(4.0));
        assert_eq!(resolve(&f, "lap.current"), BindingValue::Number(92.345));
        assert_eq!(resolve(&f, "lap.delta"), BindingValue::Number(-0.5));
    }

    #[test]
    fn rounds_car_speed_rpm_max_rpm_to_the_nearest_integer_ties_to_even() {
        let mut f = base_frame();
        f.car.speed_ms = 12.5;
        f.car.rpm = 7500.5;
        f.car.max_rpm = 8999.5;
        assert_eq!(resolve(&f, "car.speed"), BindingValue::Number(45.0));
        assert_eq!(resolve(&f, "car.rpm"), BindingValue::Number(7500.0));
        assert_eq!(resolve(&f, "car.maxRpm"), BindingValue::Number(9000.0));
    }

    #[test]
    fn car_brake_bias_rear_scales_the_fraction_to_a_percentage() {
        assert_eq!(resolve(&base_frame(), "car.brakeBiasRear"), BindingValue::Number(50.0));
    }

    #[test]
    fn target_resolves_to_null_when_nothing_was_planned_and_to_the_plan_otherwise() {
        let f = base_frame();
        let none = DashTargets::default();
        let plan = DashTargets { lap_time_seconds: Some(88.5), fuel_per_lap_liters: Some(2.4) };
        let with = |targets| BindingContext { frame: &f, settings: None, targets };
        assert_eq!(resolve(&f, "target.lapTime"), BindingValue::Null);
        assert_eq!(resolve_binding(with(Some(&none)), "target.fuelPerLapLiters"), BindingValue::Null);
        assert_eq!(resolve_binding(with(Some(&plan)), "target.lapTime"), BindingValue::Number(88.5));
        assert_eq!(resolve_binding(with(Some(&plan)), "target.fuelPerLapLiters"), BindingValue::Number(2.4));
    }

    #[test]
    fn flags_summary_picks_the_highest_priority_active_flag() {
        let summary = |set: fn(&mut Flags)| {
            let mut f = base_frame();
            set(&mut f.flags);
            resolve(&f, "flags.summary").to_display()
        };
        assert_eq!(summary(|_| {}), "GREEN");
        assert_eq!(summary(|f| f.checkered = true), "CHECKERED");
        assert_eq!(
            summary(|f| {
                f.yellow = true;
                f.checkered = true
            }),
            "YELLOW"
        );
        assert_eq!(
            summary(|f| {
                f.vsc = true;
                f.yellow = true
            }),
            "VSC"
        );
        assert_eq!(
            summary(|f| {
                f.safety_car = true;
                f.vsc = true
            }),
            "SC"
        );
        assert_eq!(
            summary(|f| {
                f.red = true;
                f.safety_car = true
            }),
            "RED"
        );
        assert_eq!(summary(|f| f.double_yellow = true), "YELLOW");
    }

    #[test]
    fn electronics_truncate_toward_zero_rather_than_rounding() {
        let f = base_frame();
        assert_eq!(resolve(&f, "electronics.tc"), BindingValue::Number(3.0));
        assert_eq!(resolve(&f, "electronics.abs"), BindingValue::Number(2.0));
        assert_eq!(resolve(&f, "electronics.motorMap"), BindingValue::Number(5.0));
    }

    #[test]
    fn tires_return_the_full_reading_and_the_surface_temp_variant_rounds_it() {
        let f = base_frame();
        assert_eq!(resolve(&f, "tires.fl"), BindingValue::Tire(&f.tires[0]));
        assert_eq!(resolve(&f, "tires.rr.surfaceTemp"), BindingValue::Number(92.0));
        assert_eq!(resolve(&f, "tires.fl.surfaceTemp"), BindingValue::Number(85.0));
    }

    #[test]
    fn race_reads_the_race_state_directly() {
        let f = base_frame();
        assert_eq!(resolve(&f, "race.position"), BindingValue::Number(4.0));
        assert_eq!(resolve(&f, "race.gapAhead"), BindingValue::Number(1.234));
    }

    #[test]
    fn profile_reads_from_settings_and_is_undefined_when_settings_are_absent() {
        let f = base_frame();
        let settings = DashSettings { driver_name: Some("Alex".to_owned()), driver_number: Some("7".to_owned()) };
        let with = BindingContext { frame: &f, settings: Some(&settings), targets: None };
        assert_eq!(resolve(&f, "profile.driverName"), BindingValue::Undefined);
        assert_eq!(resolve_binding(with, "profile.driverName"), BindingValue::Text("Alex"));
        assert_eq!(resolve_binding(with, "profile.driverNumber"), BindingValue::Text("7"));
    }

    #[test]
    fn an_unknown_binding_path_resolves_to_undefined() {
        assert_eq!(resolve(&base_frame(), "not.a.real.binding"), BindingValue::Undefined);
    }

    #[test]
    fn a_binding_prints_like_string_of_its_value_and_objects_print_nothing() {
        let f = base_frame();
        assert_eq!(resolve(&f, "lap.current").to_display(), "92.345");
        assert_eq!(resolve(&f, "flags.red").to_display(), "false");
        assert_eq!(resolve(&f, "tires.fl").to_display(), "");
        assert_eq!(resolve(&f, "target.lapTime").to_display(), "");
    }

    #[test]
    fn narrow_dash_targets_keeps_numbers_and_nulls_the_rest() {
        // `narrowDashTargets` lives in the scene parser: absent bag -> no targets, else each field.
        let scene = |targets: &str| {
            let json = format!(r#"{{"layout":{{"id":"l","name":"L","gridCols":20,"gridRows":12,"pages":[]}},"width":10,"height":10{targets}}}"#);
            parse_scene(json.as_bytes()).expect("scene").targets
        };
        assert_eq!(scene(""), None);
        assert_eq!(scene(r#","targets":5"#), None);
        assert_eq!(
            scene(r#","targets":{"lapTimeSeconds":88.5,"fuelPerLapLiters":"x"}"#),
            Some(DashTargets { lap_time_seconds: Some(88.5), fuel_per_lap_liters: None })
        );
    }
}
