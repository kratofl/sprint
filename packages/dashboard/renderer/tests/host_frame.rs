// The renderer reads the host's telemetry JSON. `fixtures/host-frame.json` is the host's own
// serialization of a frame in which every field the renderer reads has a value of its own
// (written and kept current by app/Sprint.Desktop.Host/Tests/HostFrameFixtureTests.cs). The
// frame narrowing is lenient, so a field whose name no longer matches would quietly read as its
// neutral value; here every model field must come out as the value the host put in. The expected
// frame is a full struct literal on purpose: a new model field must be added here too.

use sprint_dash::model::{
    CarState, Electronics, EnergyState, Flags, LapState, Penalties, RaceState, Session, SessionConditions, TelemetryFrame, TireState, parse_frame,
};

const HOST_FRAME: &[u8] = include_bytes!("fixtures/host-frame.json");

/// Tyre `n` of the four (front left = 0), as the host test builds it.
fn tire(n: f64, compound: &str) -> TireState {
    TireState {
        position: n,
        temp_inner: 81.0 + 10.0 * n,
        temp_middle: 82.0 + 10.0 * n,
        temp_outer: 83.0 + 10.0 * n,
        temp_surface: 84.0 + 10.0 * n,
        temp_core: 85.0 + 10.0 * n,
        pressure_kpa: 160.5 + 10.0 * n,
        wear_percent: 10.25 + n,
        compound: compound.to_owned(),
    }
}

#[test]
fn every_field_of_the_hosts_frame_reaches_the_model() {
    let frame = parse_frame(HOST_FRAME).expect("the fixture is a frame");
    let expected = TelemetryFrame {
        session: Session {
            game: "Fixture Game".to_owned(),
            track: "Fixture Track".to_owned(),
            track_length_meters: Some(5001.5),
            car: "Fixture Car".to_owned(),
            car_class: "Fixture Class".to_owned(),
            session_type: "qualify".to_owned(),
            session_time: 101.5,
            total_session_time: Some(3600.5),
            session_time_remaining: Some(1800.25),
            best_lap_time: 99.25,
            max_laps: 27.0,
            in_car: true,
        },
        car: CarState {
            speed_ms: 61.5,
            gear: 1.0,
            rpm: 7250.0,
            max_rpm: 8750.0,
            throttle: 0.75,
            brake: 0.25,
            clutch: 0.125,
            steering: -0.375,
            fuel: 42.5,
            fuel_per_lap: 2.75,
            position_x: 11.5,
            position_y: 12.5,
            position_z: 13.5,
            brake_bias_rear: 0.5625,
            in_garage: Some(true),
            in_pit_lane: Some(true),
            pit_state: Some("stopped".to_owned()),
            pit_limiter: Some(true),
        },
        // Listed RearRight, FrontLeft, RearLeft, FrontRight on the wire: placed by name.
        tires: [tire(0.0, "Compound FrontLeft"), tire(1.0, "Compound FrontRight"), tire(2.0, "Compound RearLeft"), tire(3.0, "Compound RearRight")],
        lap: LapState {
            current_lap: 26.0,
            current_lap_time: 48.5,
            last_lap_time: 104.25,
            best_lap_time: 103.75,
            target_lap_time: 103.5,
            delta: -0.125,
            sector: 2.0,
            last_lap_sectors_seconds: vec![31.5, 35.25, 37.5],
            is_valid: false,
            track_position: 0.4375,
            // Not published by the host: neutral, as parseHostFrame makes them.
            position_lap_time: 0.0,
            sector1_time: 0.0,
            sector2_time: 0.0,
            is_in_lap: false,
            is_out_lap: false,
        },
        flags: Flags { yellow: true, double_yellow: true, red: true, safety_car: true, vsc: true, checkered: true },
        electronics: Electronics {
            tc_active: true,
            tc: 3.0,
            tc_max: 11.0,
            tc_slip: 4.0,
            tc_slip_max: 12.0,
            tc_cut: 5.0,
            tc_cut_max: 13.0,
            abs: 6.0,
            abs_max: 14.0,
            motor_map: 7.0,
            motor_map_max: 15.0,
            migration: 8.0,
            migration_max: 16.0,
            front_anti_roll_bar: 9.0,
            front_anti_roll_bar_max: 17.0,
            rear_anti_roll_bar: 10.0,
            rear_anti_roll_bar_max: 18.0,
            drs_active: true,
            // Not published: ABS active is neutral, availability follows the maxima.
            abs_active: false,
            abs_available: true,
            tc_available: true,
            tc_cut_available: true,
            tc_slip_available: true,
            motor_map_available: true,
        },
        race: RaceState { position: 25.0, total_positions: 31.0, gap_ahead: 1.5, gap_behind: 2.25 },
        energy: EnergyState { virtual_energy: 68.5, virtual_energy_per_lap: 3.375, soc: 0.625, regen_power: 18.5, deploy_power: 92.5 },
        penalties: Penalties { incidents: 19.0, track_limit_steps: 20.0, pit_stops: 22.0 },
        conditions: SessionConditions {
            path_wetness: Some(0.3125),
            track_grip_level: Some(0.875),
            fuel_multiplier: Some(1.75),
            tire_multiplier: Some(2.125),
            fixed_setup: Some(true),
        },
    };
    assert_eq!(frame, expected);
}

#[test]
fn the_fixture_holds_no_other_cars() {
    let value: serde_json::Value = serde_json::from_slice(HOST_FRAME).expect("JSON");
    assert_eq!(value.get("field"), Some(&serde_json::Value::Null), "dash outputs leave the other cars out");
}
