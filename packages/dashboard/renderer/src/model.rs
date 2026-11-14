// The renderer's input model: the scene (layout, page, size and the slow-changing inputs) and
// the telemetry frame. This is the boundary — everything inward assumes clean data.
//
// The scene is narrowed by hand from a JSON value, as a direct port of `parseDashRenderInput`
// in the retired React renderer, so it rejects and tolerates exactly what that TypeScript
// did. It changes rarely, so the extra `Value` pass costs nothing that matters.
// The frame is the host's telemetry JSON (`Sprint.Desktop.Api.Telemetry.TelemetryFrame` as
// `HostJson` writes it), narrowed field by field into the model below; the other cars (`field`)
// are skipped by serde without being built. `tests/fixtures/host-frame.json` pins the names.

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum DashStyle {
    #[default]
    Panels,
    Grid,
    Bars,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColorSystem {
    Functional,
    Styled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GroupMode {
    Together,
    OneAtATime,
}

/// A layout's theme overrides: theme key -> CSS color string (only string entries survive).
pub type DashTheme = BTreeMap<String, String>;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct DashWidgetStyle {
    pub text_color: Option<String>,
    pub label_color: Option<String>,
}

/// One widget, in page grid coordinates. `group` is the group it sits in; `hidden` keeps it off
/// the wheel (it still holds its cells).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DashWidget {
    pub id: String,
    pub widget_type: String,
    pub col: f64,
    pub row: f64,
    pub col_span: f64,
    pub row_span: f64,
    pub config: Map<String, Value>,
    pub style: Option<DashWidgetStyle>,
    pub group: Option<String>,
    pub hidden: bool,
}

impl DashWidget {
    /// A string config value by key (`configString`), or `None` when absent or not a string.
    pub fn config_string(&self, key: &str) -> Option<&str> {
        self.config.get(key).and_then(Value::as_str)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct DashWidgetGroup {
    pub id: String,
    pub name: String,
    pub parent: Option<String>,
    pub mode: GroupMode,
    pub shown_first: Option<String>,
    pub hidden: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct DashPage {
    pub id: String,
    pub name: String,
    pub widgets: Vec<DashWidget>,
    pub groups: Vec<DashWidgetGroup>,
}

/// One alert as the layout carries it. Only `id`/`type` are validated (as in the TypeScript);
/// the alert tracker (`alerts.rs`) narrows the rest from `fields`.
#[derive(Clone, Debug, PartialEq)]
pub struct DashAlert {
    pub id: String,
    pub alert_type: String,
    pub fields: Map<String, Value>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct DashLayout {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub mode: String,
    pub color_system: Option<ColorSystem>,
    pub dash_style: Option<DashStyle>,
    pub screen_profile: Option<String>,
    pub grid_cols: f64,
    pub grid_rows: f64,
    pub pages: Vec<DashPage>,
    pub idle_page: Option<DashPage>,
    pub alerts: Vec<DashAlert>,
    pub theme: Option<DashTheme>,
    pub alert_config: Option<Map<String, Value>>,
}

/// The settings a dash reads (`narrowSettings` in the retired React renderer).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DashSettings {
    pub driver_name: Option<String>,
    pub driver_number: Option<String>,
}

/// What the driver planned to be aiming at (`DashTargets` in bindings.ts). `None` is "no plan",
/// never a zero.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct DashTargets {
    pub lap_time_seconds: Option<f64>,
    pub fuel_per_lap_liters: Option<f64>,
}

/// Everything `set_scene` takes: the layout and the slow-changing inputs around it.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub layout: DashLayout,
    /// Logical canvas size; every layout number is in these units.
    pub width: f64,
    pub height: f64,
    /// Device pixel ratio: the pixmap is `round(width * scale) x round(height * scale)`.
    pub scale: f64,
    pub page_id: Option<String>,
    pub idle: bool,
    pub settings: Option<DashSettings>,
    pub targets: Option<DashTargets>,
    /// Leave the canvas background clear (alpha 0) instead of the palette background.
    pub transparent: bool,
}

impl Scene {
    /// The pixmap size for this scene, in device pixels.
    pub fn size_px(&self) -> (u32, u32) {
        let px = |logical: f64| (logical * self.scale).round().clamp(0.0, f64::from(u32::MAX)) as u32;
        (px(self.width), px(self.height))
    }
}

/// Parses and narrows a scene. An error names what made the layout undrawable.
pub fn parse_scene(json: &[u8]) -> Result<Scene, String> {
    let value: Value = serde_json::from_slice(json).map_err(|e| format!("scene is not valid JSON: {e}"))?;
    let root = value.as_object().ok_or("scene must be a JSON object")?;
    let layout = root.get("layout").and_then(Value::as_object).ok_or("scene has no layout object")?;
    let layout = parse_layout(layout)?;

    let width = root.get("width").and_then(Value::as_f64).ok_or("scene has no numeric width")?;
    let height = root.get("height").and_then(Value::as_f64).ok_or("scene has no numeric height")?;
    let scale = match root.get("scale") {
        None | Some(Value::Null) => 1.0,
        Some(v) => v.as_f64().ok_or("scene scale must be a number")?,
    };
    if !(scale.is_finite() && scale > 0.0) {
        return Err(format!("scene scale must be positive, got {scale}"));
    }
    if !(width.is_finite() && height.is_finite()) {
        return Err("scene size must be finite".to_owned());
    }

    let scene = Scene {
        layout,
        width,
        height,
        scale,
        page_id: root.get("pageId").and_then(Value::as_str).map(str::to_owned),
        idle: root.get("idle") == Some(&Value::Bool(true)),
        settings: root
            .get("settings")
            .and_then(Value::as_object)
            .map(|raw| DashSettings { driver_name: string_field(raw, "driverName"), driver_number: string_field(raw, "driverNumber") }),
        targets: root.get("targets").and_then(Value::as_object).map(|raw| DashTargets {
            lap_time_seconds: raw.get("lapTimeSeconds").and_then(Value::as_f64),
            fuel_per_lap_liters: raw.get("fuelPerLapLiters").and_then(Value::as_f64),
        }),
        transparent: root.get("transparent") == Some(&Value::Bool(true)),
    };
    let (w, h) = scene.size_px();
    if w == 0 || h == 0 {
        return Err(format!("scene size {width}x{height} at scale {scale} has no pixels"));
    }
    Ok(scene)
}

fn string_field(raw: &Map<String, Value>, key: &str) -> Option<String> {
    raw.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// `undefined` or the given type, as `isOptional` checks it.
fn optional_ok(raw: &Map<String, Value>, key: &str, check: fn(&Value) -> bool) -> bool {
    raw.get(key).is_none_or(check)
}

fn parse_layout(raw: &Map<String, Value>) -> Result<DashLayout, String> {
    let pages = raw.get("pages").and_then(Value::as_array).ok_or("layout has no pages array")?;
    let pages = pages.iter().map(|page| parse_page(page).ok_or_else(|| "layout has an invalid page".to_owned())).collect::<Result<Vec<_>, _>>()?;
    let id = raw.get("id").and_then(Value::as_str).ok_or("layout has no id")?;
    let name = raw.get("name").and_then(Value::as_str).ok_or("layout has no name")?;
    let grid_cols = raw.get("gridCols").and_then(Value::as_f64).ok_or("layout has no numeric gridCols")?;
    let grid_rows = raw.get("gridRows").and_then(Value::as_f64).ok_or("layout has no numeric gridRows")?;

    Ok(DashLayout {
        id: id.to_owned(),
        name: name.to_owned(),
        category: string_field(raw, "category"),
        mode: string_field(raw, "mode").unwrap_or_else(|| "basic".to_owned()),
        color_system: match raw.get("colorSystem").and_then(Value::as_str) {
            Some("functional") => Some(ColorSystem::Functional),
            Some("styled") => Some(ColorSystem::Styled),
            _ => None,
        },
        dash_style: match raw.get("dashStyle").and_then(Value::as_str) {
            Some("panels") => Some(DashStyle::Panels),
            Some("grid") => Some(DashStyle::Grid),
            Some("bars") => Some(DashStyle::Bars),
            _ => None,
        },
        screen_profile: string_field(raw, "screenProfile"),
        grid_cols,
        grid_rows,
        pages,
        idle_page: raw.get("idlePage").and_then(parse_page),
        alerts: raw.get("alerts").and_then(Value::as_array).map(|alerts| alerts.iter().filter_map(parse_alert).collect()).unwrap_or_default(),
        theme: raw
            .get("theme")
            .and_then(Value::as_object)
            .map(|theme| theme.iter().filter_map(|(key, value)| value.as_str().map(|v| (key.clone(), v.to_owned()))).collect()),
        alert_config: raw.get("alertConfig").and_then(Value::as_object).cloned(),
    })
}

fn parse_page(value: &Value) -> Option<DashPage> {
    let raw = value.as_object()?;
    let widgets = raw.get("widgets")?.as_array()?.iter().map(parse_widget).collect::<Option<Vec<_>>>()?;
    let groups = match raw.get("groups") {
        None => Vec::new(),
        Some(groups) => groups.as_array()?.iter().map(parse_group).collect::<Option<Vec<_>>>()?,
    };
    Some(DashPage { id: raw.get("id")?.as_str()?.to_owned(), name: raw.get("name")?.as_str()?.to_owned(), widgets, groups })
}

fn parse_widget(value: &Value) -> Option<DashWidget> {
    let raw = value.as_object()?;
    if !optional_ok(raw, "group", Value::is_string) || !optional_ok(raw, "hidden", Value::is_boolean) {
        return None;
    }
    let number = |key: &str| raw.get(key).and_then(Value::as_f64);
    Some(DashWidget {
        id: raw.get("id")?.as_str()?.to_owned(),
        widget_type: raw.get("type")?.as_str()?.to_owned(),
        col: number("col")?,
        row: number("row")?,
        col_span: number("colSpan")?,
        row_span: number("rowSpan")?,
        config: raw.get("config").and_then(Value::as_object).cloned().unwrap_or_default(),
        // The TypeScript passes `style` through unchecked; a non-string token there would
        // throw in `resolveStyleColor`. Here a non-string token is simply absent.
        style: raw
            .get("style")
            .and_then(Value::as_object)
            .map(|style| DashWidgetStyle { text_color: string_field(style, "textColor"), label_color: string_field(style, "labelColor") }),
        group: string_field(raw, "group"),
        hidden: raw.get("hidden") == Some(&Value::Bool(true)),
    })
}

fn parse_group(value: &Value) -> Option<DashWidgetGroup> {
    let raw = value.as_object()?;
    let ok = optional_ok(raw, "parent", Value::is_string) && optional_ok(raw, "shownFirst", Value::is_string) && optional_ok(raw, "hidden", Value::is_boolean);
    if !ok {
        return None;
    }
    Some(DashWidgetGroup {
        id: raw.get("id")?.as_str()?.to_owned(),
        name: raw.get("name")?.as_str()?.to_owned(),
        parent: string_field(raw, "parent"),
        mode: match raw.get("mode")?.as_str()? {
            "together" => GroupMode::Together,
            "oneAtATime" => GroupMode::OneAtATime,
            _ => return None,
        },
        shown_first: string_field(raw, "shownFirst"),
        hidden: raw.get("hidden") == Some(&Value::Bool(true)),
    })
}

fn parse_alert(value: &Value) -> Option<DashAlert> {
    let raw = value.as_object()?;
    Some(DashAlert { id: raw.get("id")?.as_str()?.to_owned(), alert_type: raw.get("type")?.as_str()?.to_owned(), fields: raw.clone() })
}

// ---------------------------------------------------------------------------------------------
// Telemetry frame. The input is the host's wire format: `Sprint.Desktop.Api.Telemetry.TelemetryFrame`
// serialized with `HostJson` (C# names in camelCase, enums as names), the repo's telemetry
// contract. The model keeps the names of the `@sprint/types` mirror the widgets were written
// against; the narrowing below is the one translation, and it applies the rules of
// `parseHostFrame` (packages/dashboard/src/hostFrame.ts), which makes the same mirror for the
// app's views: enum names to the mirror's lower-case values, tyres placed by their `position`
// name, the availability flags derived from the maxima, and the mirror fields the host does not
// publish at their neutral value. `field` (the other cars) is not read by any dash widget, so it
// is not modelled: serde skips it without building it.
//
// Every field is narrowed on its own: a field that is missing or has the wrong JSON type reads as
// its neutral value, so one bad field never costs the rest of the frame. That leniency would also
// hide a renamed host field, so `tests/fixtures/host-frame.json` (written by a host test from the
// real serializer) pins every name read here.

#[derive(Clone, Debug, PartialEq)]
pub struct Session {
    pub game: String,
    pub track: String,
    pub track_length_meters: Option<f64>,
    pub car: String,
    pub car_class: String,
    pub session_type: String,
    pub session_time: f64,
    pub total_session_time: Option<f64>,
    pub session_time_remaining: Option<f64>,
    pub best_lap_time: f64,
    pub max_laps: f64,
    pub in_car: bool,
}

impl Default for Session {
    fn default() -> Self {
        Session {
            game: String::new(),
            track: String::new(),
            track_length_meters: None,
            car: String::new(),
            car_class: String::new(),
            session_type: "unknown".to_owned(),
            session_time: 0.0,
            total_session_time: None,
            session_time_remaining: None,
            best_lap_time: 0.0,
            max_laps: 0.0,
            in_car: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CarState {
    pub speed_ms: f64,
    pub gear: f64,
    pub rpm: f64,
    pub max_rpm: f64,
    pub throttle: f64,
    pub brake: f64,
    pub clutch: f64,
    pub steering: f64,
    pub fuel: f64,
    pub fuel_per_lap: f64,
    pub position_x: f64,
    pub position_y: f64,
    pub position_z: f64,
    /// Rear brake bias fraction (0–1).
    pub brake_bias_rear: f64,
    pub in_garage: Option<bool>,
    pub in_pit_lane: Option<bool>,
    pub pit_state: Option<String>,
    pub pit_limiter: Option<bool>,
}

impl Default for CarState {
    fn default() -> Self {
        CarState {
            speed_ms: 0.0,
            gear: 0.0,
            rpm: 0.0,
            max_rpm: 0.0,
            throttle: 0.0,
            brake: 0.0,
            clutch: 0.0,
            steering: 0.0,
            fuel: 0.0,
            fuel_per_lap: 0.0,
            position_x: 0.0,
            position_y: 0.0,
            position_z: 0.0,
            brake_bias_rear: 0.5,
            in_garage: None,
            in_pit_lane: None,
            pit_state: None,
            pit_limiter: None,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TireState {
    pub position: f64,
    pub temp_inner: f64,
    pub temp_middle: f64,
    pub temp_outer: f64,
    pub temp_surface: f64,
    pub temp_core: f64,
    pub pressure_kpa: f64,
    pub wear_percent: f64,
    pub compound: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LapState {
    pub current_lap: f64,
    pub current_lap_time: f64,
    pub position_lap_time: f64,
    pub last_lap_time: f64,
    pub best_lap_time: f64,
    pub target_lap_time: f64,
    pub delta: f64,
    pub sector: f64,
    pub sector1_time: f64,
    pub sector2_time: f64,
    pub last_lap_sectors_seconds: Vec<f64>,
    pub is_in_lap: bool,
    pub is_out_lap: bool,
    pub is_valid: bool,
    pub track_position: f64,
}

impl Default for LapState {
    fn default() -> Self {
        LapState {
            current_lap: 0.0,
            current_lap_time: 0.0,
            position_lap_time: 0.0,
            last_lap_time: 0.0,
            best_lap_time: 0.0,
            target_lap_time: 0.0,
            delta: 0.0,
            sector: 0.0,
            sector1_time: 0.0,
            sector2_time: 0.0,
            last_lap_sectors_seconds: Vec::new(),
            is_in_lap: false,
            is_out_lap: false,
            is_valid: true,
            track_position: 0.0,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Flags {
    pub yellow: bool,
    pub double_yellow: bool,
    pub red: bool,
    pub safety_car: bool,
    pub vsc: bool,
    pub checkered: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Electronics {
    pub tc_active: bool,
    pub tc: f64,
    pub tc_max: f64,
    pub tc_cut: f64,
    pub tc_cut_max: f64,
    pub tc_slip: f64,
    pub tc_slip_max: f64,
    pub abs_active: bool,
    pub abs: f64,
    pub abs_max: f64,
    pub motor_map: f64,
    pub motor_map_max: f64,
    pub migration: f64,
    pub migration_max: f64,
    pub front_anti_roll_bar: f64,
    pub front_anti_roll_bar_max: f64,
    pub rear_anti_roll_bar: f64,
    pub rear_anti_roll_bar_max: f64,
    pub drs_active: bool,
    pub abs_available: bool,
    pub tc_available: bool,
    pub tc_cut_available: bool,
    pub tc_slip_available: bool,
    pub motor_map_available: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RaceState {
    pub position: f64,
    pub total_positions: f64,
    pub gap_ahead: f64,
    pub gap_behind: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct EnergyState {
    pub virtual_energy: f64,
    pub virtual_energy_per_lap: f64,
    pub soc: f64,
    pub regen_power: f64,
    pub deploy_power: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Penalties {
    pub incidents: f64,
    pub track_limit_steps: f64,
    pub pit_stops: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SessionConditions {
    pub path_wetness: Option<f64>,
    pub track_grip_level: Option<f64>,
    pub fuel_multiplier: Option<f64>,
    pub tire_multiplier: Option<f64>,
    pub fixed_setup: Option<bool>,
}

/// One telemetry frame. `tires` always holds the four corners in `TirePosition` order.
#[derive(Clone, Debug, PartialEq)]
pub struct TelemetryFrame {
    pub session: Session,
    pub car: CarState,
    pub tires: [TireState; 4],
    pub lap: LapState,
    pub flags: Flags,
    pub electronics: Electronics,
    pub race: RaceState,
    pub energy: EnergyState,
    pub penalties: Penalties,
    pub conditions: SessionConditions,
}

fn empty_tire(index: usize) -> TireState {
    TireState { position: index as f64, ..TireState::default() }
}

impl Default for TelemetryFrame {
    /// `EMPTY_TELEMETRY_FRAME`: what every widget reads before the game connects.
    fn default() -> Self {
        TelemetryFrame {
            session: Session::default(),
            car: CarState::default(),
            tires: std::array::from_fn(empty_tire),
            lap: LapState::default(),
            flags: Flags::default(),
            electronics: Electronics::default(),
            race: RaceState::default(),
            energy: EnergyState::default(),
            penalties: Penalties::default(),
            conditions: SessionConditions::default(),
        }
    }
}

/// The frame's top level as it arrives. Sections stay JSON values (built by serde; `field`, the
/// timestamp, which no widget reads, and other unknown keys skipped) and are narrowed below.
#[derive(Deserialize, Default)]
#[serde(default)]
struct RawFrame {
    session: Value,
    car: Value,
    tires: Value,
    lap: Value,
    flags: Value,
    electronics: Value,
    race: Value,
    energy: Value,
    penalties: Value,
    conditions: Value,
}

/// One JSON object's fields, each read as its type or else the given default (`None` reads
/// every field as its default).
#[derive(Clone, Copy)]
struct Fields<'a>(Option<&'a Map<String, Value>>);

impl<'a> Fields<'a> {
    fn of(value: &'a Value) -> Fields<'a> {
        Fields(value.as_object())
    }

    fn get(&self, key: &str) -> Option<&'a Value> {
        self.0.and_then(|map| map.get(key))
    }

    fn num(&self, key: &str, default: f64) -> f64 {
        self.get(key).and_then(Value::as_f64).unwrap_or(default)
    }

    fn flag(&self, key: &str, default: bool) -> bool {
        self.get(key).and_then(Value::as_bool).unwrap_or(default)
    }

    fn text(&self, key: &str, default: &str) -> String {
        self.get(key).and_then(Value::as_str).unwrap_or(default).to_owned()
    }

    fn opt_num(&self, key: &str) -> Option<f64> {
        self.get(key).and_then(Value::as_f64)
    }

    fn opt_flag(&self, key: &str) -> Option<bool> {
        self.get(key).and_then(Value::as_bool)
    }
}

/// `isRecord`: JavaScript calls arrays objects too, so an array passes (with no fields).
fn is_record(value: &Value) -> bool {
    value.is_object() || value.is_array()
}

/// A host enum name to the mirror's value, by a (host name, mirror value) table; `None` for any
/// other value.
fn enum_name<'t>(value: Option<&Value>, table: &[(&str, &'t str)]) -> Option<&'t str> {
    let name = value.and_then(Value::as_str)?;
    table.iter().find(|(host, _)| *host == name).map(|(_, mirror)| *mirror)
}

/// `SessionType`, by name. Anything else reads as "unknown".
const SESSION_TYPES: [(&str, &str); 5] = [("Practice", "practice"), ("Qualify", "qualify"), ("Race", "race"), ("Warmup", "warmup"), ("Unknown", "unknown")];

/// `PitState`, by name. Anything else (or null) reads as "the game did not say".
const PIT_STATES: [(&str, &str); 5] = [("None", "none"), ("Requested", "requested"), ("Entering", "entering"), ("Stopped", "stopped"), ("Exiting", "exiting")];

/// `TirePosition` names in index order: the model holds each tyre at its position's index.
const TIRE_POSITIONS: [&str; 4] = ["FrontLeft", "FrontRight", "RearLeft", "RearRight"];

fn narrow_session(f: Fields) -> Session {
    Session {
        game: f.text("game", ""),
        track: f.text("track", ""),
        track_length_meters: f.opt_num("trackLengthMeters"),
        car: f.text("car", ""),
        car_class: f.text("carClass", ""),
        session_type: enum_name(f.get("sessionType"), &SESSION_TYPES).unwrap_or("unknown").to_owned(),
        session_time: f.num("sessionTime", 0.0),
        total_session_time: f.opt_num("totalSessionTime"),
        session_time_remaining: f.opt_num("sessionTimeRemaining"),
        best_lap_time: f.num("bestLapTime", 0.0),
        max_laps: f.num("maxLaps", 0.0),
        in_car: f.flag("inCar", false),
    }
}

fn narrow_car(f: Fields) -> CarState {
    CarState {
        speed_ms: f.num("speedMetersPerSecond", 0.0),
        gear: f.num("gear", 0.0),
        rpm: f.num("rpm", 0.0),
        max_rpm: f.num("maxRpm", 0.0),
        throttle: f.num("throttle", 0.0),
        brake: f.num("brake", 0.0),
        clutch: f.num("clutch", 0.0),
        steering: f.num("steering", 0.0),
        fuel: f.num("fuelLiters", 0.0),
        fuel_per_lap: f.num("fuelPerLapLiters", 0.0),
        position_x: f.num("positionX", 0.0),
        position_y: f.num("positionY", 0.0),
        position_z: f.num("positionZ", 0.0),
        brake_bias_rear: f.num("brakeBiasRear", 0.0),
        in_garage: f.opt_flag("inGarage"),
        in_pit_lane: f.opt_flag("inPitLane"),
        pit_state: enum_name(f.get("pitState"), &PIT_STATES).map(str::to_owned),
        pit_limiter: f.opt_flag("pitLimiter"),
    }
}

fn narrow_tire(f: Fields, index: usize) -> TireState {
    TireState {
        position: index as f64,
        temp_inner: f.num("tempInnerCelsius", 0.0),
        temp_middle: f.num("tempMiddleCelsius", 0.0),
        temp_outer: f.num("tempOuterCelsius", 0.0),
        temp_surface: f.num("tempSurfaceCelsius", 0.0),
        temp_core: f.num("tempCoreCelsius", 0.0),
        pressure_kpa: f.num("pressureKPa", 0.0),
        wear_percent: f.num("wearPercent", 0.0),
        compound: f.text("compound", ""),
    }
}

/// Each tyre at its position's index, whatever order the host lists them in (the last one wins
/// a position named twice); a corner the host does not send is an empty tyre.
fn narrow_tires(value: &Value) -> [TireState; 4] {
    let mut by_position: [Option<&Value>; 4] = [None; 4];
    for tire in value.as_array().map(Vec::as_slice).unwrap_or_default() {
        let name = tire.get("position").and_then(Value::as_str);
        if let Some(index) = TIRE_POSITIONS.iter().position(|position| Some(*position) == name) {
            by_position[index] = Some(tire);
        }
    }
    std::array::from_fn(|i| narrow_tire(Fields(by_position[i].and_then(Value::as_object)), i))
}

/// The host publishes no position lap time, sector times or in/out lap: those read as neutral.
fn narrow_lap(f: Fields) -> LapState {
    LapState {
        current_lap: f.num("currentLap", 0.0),
        current_lap_time: f.num("currentLapTime", 0.0),
        position_lap_time: 0.0,
        last_lap_time: f.num("lastLapTime", 0.0),
        best_lap_time: f.num("bestLapTime", 0.0),
        target_lap_time: f.num("targetLapTime", 0.0),
        delta: f.num("delta", 0.0),
        sector: f.num("sector", 0.0),
        sector1_time: 0.0,
        sector2_time: 0.0,
        last_lap_sectors_seconds: f
            .get("lastLapSectorsSeconds")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(|item| item.as_f64().unwrap_or(0.0)).collect())
            .unwrap_or_default(),
        is_in_lap: false,
        is_out_lap: false,
        is_valid: f.flag("isValid", true),
        track_position: f.num("trackPosition", 0.0),
    }
}

fn narrow_flags(f: Fields) -> Flags {
    Flags {
        yellow: f.flag("yellow", false),
        double_yellow: f.flag("doubleYellow", false),
        red: f.flag("red", false),
        safety_car: f.flag("safetyCar", false),
        vsc: f.flag("virtualSafetyCar", false),
        checkered: f.flag("checkered", false),
    }
}

/// The host publishes no ABS-active channel; a setting counts as available when the car reports
/// a non-zero maximum for it.
fn narrow_electronics(f: Fields) -> Electronics {
    let tc_max = f.num("tractionControlMax", 0.0);
    let tc_cut_max = f.num("tractionControlCutMax", 0.0);
    let tc_slip_max = f.num("tractionControlSlipMax", 0.0);
    let abs_max = f.num("absMax", 0.0);
    let motor_map_max = f.num("motorMapMax", 0.0);
    Electronics {
        tc_active: f.flag("tractionControlActive", false),
        tc: f.num("tractionControl", 0.0),
        tc_max,
        tc_cut: f.num("tractionControlCut", 0.0),
        tc_cut_max,
        tc_slip: f.num("tractionControlSlip", 0.0),
        tc_slip_max,
        abs_active: false,
        abs: f.num("abs", 0.0),
        abs_max,
        motor_map: f.num("motorMap", 0.0),
        motor_map_max,
        migration: f.num("migration", 0.0),
        migration_max: f.num("migrationMax", 0.0),
        front_anti_roll_bar: f.num("frontAntiRollBar", 0.0),
        front_anti_roll_bar_max: f.num("frontAntiRollBarMax", 0.0),
        rear_anti_roll_bar: f.num("rearAntiRollBar", 0.0),
        rear_anti_roll_bar_max: f.num("rearAntiRollBarMax", 0.0),
        drs_active: f.flag("drsActive", false),
        abs_available: abs_max > 0.0,
        tc_available: tc_max > 0.0,
        tc_cut_available: tc_cut_max > 0.0,
        tc_slip_available: tc_slip_max > 0.0,
        motor_map_available: motor_map_max > 0.0,
    }
}

fn narrow_race(f: Fields) -> RaceState {
    RaceState {
        position: f.num("position", 0.0),
        total_positions: f.num("totalPositions", 0.0),
        gap_ahead: f.num("gapAhead", 0.0),
        gap_behind: f.num("gapBehind", 0.0),
    }
}

fn narrow_energy(f: Fields) -> EnergyState {
    EnergyState {
        virtual_energy: f.num("virtualEnergy", 0.0),
        virtual_energy_per_lap: f.num("virtualEnergyPerLap", 0.0),
        soc: f.num("stateOfCharge", 0.0),
        regen_power: f.num("regenPower", 0.0),
        deploy_power: f.num("deployPower", 0.0),
    }
}

fn narrow_penalties(f: Fields) -> Penalties {
    Penalties { incidents: f.num("incidents", 0.0), track_limit_steps: f.num("trackLimitSteps", 0.0), pit_stops: f.num("pitStops", 0.0) }
}

fn narrow_conditions(f: Fields) -> SessionConditions {
    SessionConditions {
        path_wetness: f.opt_num("pathWetness"),
        track_grip_level: f.opt_num("trackGripLevel"),
        fuel_multiplier: f.opt_num("fuelMultiplier"),
        tire_multiplier: f.opt_num("tireMultiplier"),
        fixed_setup: f.opt_flag("fixedSetup"),
    }
}

/// Parses a frame. Empty input, `null`, anything but an object, or an object missing one of
/// the sections every host frame carries is "no data" (the empty frame); malformed JSON is an
/// error.
pub fn parse_frame(json: &[u8]) -> Result<TelemetryFrame, String> {
    parse_frame_data(json).map(Option::unwrap_or_default)
}

/// `parse_frame`, with "no data" as `None` (the TypeScript's `frame: null`), for the callers that
/// treat it differently from a frame (the live alert tracker resets on it).
pub fn parse_frame_data(json: &[u8]) -> Result<Option<TelemetryFrame>, String> {
    let invalid = |e: serde_json::Error| format!("frame is not valid JSON: {e}");
    let Some(first) = json.iter().find(|b| !b.is_ascii_whitespace()) else {
        return Ok(None);
    };
    if *first != b'{' {
        // Still checked as JSON, but no other top level is a frame.
        serde_json::from_slice::<serde::de::IgnoredAny>(json).map_err(invalid)?;
        return Ok(None);
    }
    let raw: RawFrame = serde_json::from_slice(json).map_err(invalid)?;
    let required = [&raw.session, &raw.car, &raw.lap, &raw.flags, &raw.electronics, &raw.race, &raw.energy];
    if !required.into_iter().all(is_record) {
        return Ok(None);
    }
    Ok(Some(TelemetryFrame {
        session: narrow_session(Fields::of(&raw.session)),
        car: narrow_car(Fields::of(&raw.car)),
        tires: narrow_tires(&raw.tires),
        lap: narrow_lap(Fields::of(&raw.lap)),
        flags: narrow_flags(Fields::of(&raw.flags)),
        electronics: narrow_electronics(Fields::of(&raw.electronics)),
        race: narrow_race(Fields::of(&raw.race)),
        energy: narrow_energy(Fields::of(&raw.energy)),
        penalties: narrow_penalties(Fields::of(&raw.penalties)),
        conditions: narrow_conditions(Fields::of(&raw.conditions)),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAYOUT: &str = r#"{"id":"l1","name":"Layout","gridCols":20,"gridRows":12,"pages":[{"id":"p1","name":"P","widgets":[{"id":"w","type":"gear_speed","col":0,"row":0,"colSpan":4,"rowSpan":3,"config":{"align":"left"},"style":{"textColor":5}}]}]}"#;

    fn scene(extra: &str) -> Result<Scene, String> {
        parse_scene(format!(r#"{{"layout":{LAYOUT},"width":800,"height":480{extra}}}"#).as_bytes())
    }

    #[test]
    fn a_scene_narrows_like_parse_dash_render_input() {
        let s = scene(r#","dashStyle":"x","pageId":"p1","idle":true,"targets":{"fuelPerLapLiters":2.5,"lapTimeSeconds":"x"}"#).unwrap();
        assert_eq!(s.layout.mode, "basic");
        assert_eq!(s.layout.dash_style, None);
        assert_eq!(s.scale, 1.0);
        assert!(s.idle);
        assert_eq!(s.targets, Some(DashTargets { lap_time_seconds: None, fuel_per_lap_liters: Some(2.5) }));
        let widget = &s.layout.pages[0].widgets[0];
        assert_eq!(widget.config_string("align"), Some("left"));
        assert_eq!(widget.style.as_ref().and_then(|st| st.text_color.clone()), None);
    }

    #[test]
    fn an_undrawable_scene_is_an_error() {
        assert!(parse_scene(b"{").is_err());
        assert!(parse_scene(br#"{"width":800,"height":480}"#).is_err());
        assert!(scene(r#","scale":0"#).is_err());
        assert!(parse_scene(format!(r#"{{"layout":{LAYOUT},"width":0,"height":480}}"#).as_bytes()).is_err());
        let bad_widget = LAYOUT.replace(r#""col":0"#, r#""col":"0""#);
        assert!(parse_scene(format!(r#"{{"layout":{bad_widget},"width":800,"height":480}}"#).as_bytes()).is_err());
    }

    #[test]
    fn a_missing_or_partial_frame_is_the_empty_frame() {
        assert_eq!(parse_frame(b"").unwrap(), TelemetryFrame::default());
        assert_eq!(parse_frame(b"null").unwrap(), TelemetryFrame::default());
        assert_eq!(parse_frame(br#"{"car":{"gear":3}}"#).unwrap(), TelemetryFrame::default());
        assert!(parse_frame(b"{nope").is_err());
        assert_eq!(parse_frame(b" 5 ").unwrap(), TelemetryFrame::default());
        assert_eq!(parse_frame(b"[1, 2]").unwrap(), TelemetryFrame::default());
        assert!(parse_frame(b"[1, ").is_err());
        let not_a_section = br#"{"session":{},"car":5,"lap":{},"flags":{},"electronics":{},"race":{},"energy":{}}"#;
        assert_eq!(parse_frame(not_a_section).unwrap(), TelemetryFrame::default());
    }

    #[test]
    fn a_field_of_the_wrong_type_reads_as_its_neutral_value_and_keeps_the_rest() {
        let frame = parse_frame(
            br#"{"timestamp":"x","session":{"track":7,"car":"963","sessionType":"race"},"car":{"gear":"3","rpm":7000,"brakeBiasRear":null,"pitState":4},
                "tires":[{"position":"FrontLeft","tempSurfaceCelsius":"hot","pressureKPa":170},"nope",{"position":"Middle","pressureKPa":1}],
                "lap":{"isValid":"no","lastLapSectorsSeconds":[1,"x",2]},
                "flags":{"red":1,"yellow":true},"electronics":[],"race":{},"energy":{},"penalties":5}"#,
        )
        .unwrap();
        assert_eq!((frame.session.track.as_str(), frame.session.car.as_str()), ("", "963"));
        assert_eq!(frame.session.session_type, "unknown", "only the host's enum names map");
        assert_eq!((frame.car.gear, frame.car.rpm, frame.car.brake_bias_rear), (0.0, 7000.0, 0.0));
        assert_eq!(frame.car.pit_state, None);
        assert_eq!((frame.tires[0].temp_surface, frame.tires[0].pressure_kpa), (0.0, 170.0));
        assert_eq!(frame.tires[1], TireState { position: 1.0, ..TireState::default() }, "an unnamed corner is an empty tyre");
        assert!(frame.lap.is_valid);
        assert_eq!(frame.lap.last_lap_sectors_seconds, vec![1.0, 0.0, 2.0], "as parseHostFrame: a non-number reads as 0");
        assert!(!frame.flags.red && frame.flags.yellow);
        assert_eq!(frame.electronics, Electronics::default(), "an array is a record with no fields, as in JavaScript");
    }

    #[test]
    fn tyres_are_placed_by_their_position_name() {
        let frame = parse_frame(
            br#"{"session":{},"car":{},"lap":{},"flags":{},"electronics":{},"race":{},"energy":{},
                "tires":[{"position":"RearRight","tempSurfaceCelsius":92},{"position":"FrontLeft","tempSurfaceCelsius":86}]}"#,
        )
        .unwrap();
        assert_eq!(frame.tires.map(|t| (t.position, t.temp_surface)), [(0.0, 86.0), (1.0, 0.0), (2.0, 0.0), (3.0, 92.0)]);
    }

    #[test]
    fn a_frame_fills_absent_fields_with_their_neutral_values() {
        let frame = parse_frame(
            br#"{"session":{"sessionType":"Qualify"},"car":{"gear":3,"speedMetersPerSecond":50,"pitState":"Stopped"},"lap":{},"flags":{},
                "electronics":{"tractionControlMax":9},"race":{},"energy":{},"field":[{"id":1}]}"#,
        )
        .unwrap();
        assert_eq!((frame.car.gear, frame.car.speed_ms, frame.car.pit_state.as_deref()), (3.0, 50.0, Some("stopped")));
        assert_eq!(frame.session.session_type, "qualify");
        assert!(frame.lap.is_valid);
        assert!(frame.electronics.tc_available && !frame.electronics.abs_available, "a setting is available when its maximum is not 0");
        assert_eq!(frame.tires[3].position, 3.0);
    }
}
