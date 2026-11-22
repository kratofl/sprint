// Pure value formatters for dash widgets. Port of `packages/dashboard/src/format.ts` (itself
// ported from the desktop client's `DashFormat.cs`). Every string here must match what the
// TypeScript prints, so JavaScript's number-to-string rules are reproduced where they differ
// from Rust's (`to_fixed`, integer printing of `-0`).

use crate::grid::js_round;

/// JavaScript's `Number.prototype.toFixed(digits)` for `digits` <= 20 and |value| < 1e21: the
/// exact value rounded to `digits` places, an exact tie going to the larger magnitude. Rust's
/// `{:.N}` breaks exact ties to even instead (`0.25` -> `0.2`, where JS prints `0.3`).
pub fn to_fixed(value: f64, digits: usize) -> String {
    if value.is_nan() {
        return "NaN".to_owned();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.to_owned();
    }
    // `x < 0` is false for -0, so JavaScript prints "0.0" for it.
    let (sign, magnitude) = if value < 0.0 { ("-", -value) } else { ("", value.abs()) };
    // A double is an exact tie at `digits` places iff magnitude * 2^(digits+1) is an odd integer
    // (multiplying by a power of two is exact).
    let doubled = magnitude * f64::powi(2.0, digits as i32 + 1);
    let is_tie = doubled.fract() == 0.0 && doubled % 2.0 == 1.0;
    let body = if is_tie { round_tie_up(magnitude, digits) } else { format!("{magnitude:.digits$}") };
    format!("{sign}{body}")
}

/// Rounds an exact tie up: prints the exact value one digit longer (it ends in 5), drops the 5
/// and carries one into the last kept digit.
fn round_tie_up(magnitude: f64, digits: usize) -> String {
    let exact = format!("{magnitude:.prec$}", prec = digits + 1);
    let mut chars: Vec<u8> = exact.into_bytes();
    chars.pop();
    if digits == 0 {
        chars.pop(); // the '.'
    }
    let mut i = chars.len();
    loop {
        if i == 0 {
            chars.insert(0, b'1');
            break;
        }
        i -= 1;
        match chars[i] {
            b'.' => continue,
            b'9' => chars[i] = b'0',
            digit => {
                chars[i] = digit + 1;
                break;
            }
        }
    }
    String::from_utf8(chars).unwrap_or_default()
}

/// Rounds to the nearest integer, an exact `.5` tie to the even neighbour — .NET's
/// `Math.Round(double)` default, which the C# dash bindings rely on.
pub fn round_to_even(value: f64) -> f64 {
    let floor = value.floor();
    let diff = value - floor;
    if diff < 0.5 {
        floor
    } else if diff > 0.5 {
        floor + 1.0
    } else if floor % 2.0 == 0.0 {
        floor
    } else {
        floor + 1.0
    }
}

/// Rounds to `decimals` places, an exact tie away from zero (`MidpointRounding.AwayFromZero`).
fn round_away_from_zero(value: f64, decimals: i32) -> f64 {
    let factor = 10f64.powi(decimals);
    let scaled = value * factor;
    let rounded = if value >= 0.0 { js_round(scaled) } else { -js_round(-scaled) };
    rounded / factor
}

/// Lap/best/last time in seconds -> `m:ss.mmm`, or a placeholder when not set.
pub fn format_lap(seconds: f64) -> String {
    if seconds <= 0.0 || !seconds.is_finite() {
        return "--:--.---".to_owned();
    }
    // Round to whole milliseconds first, then split, so 59.9996 never prints ":60.000".
    let total_ms = js_round(seconds * 1000.0);
    let minutes = (total_ms / 60_000.0).floor();
    let secs = ((total_ms % 60_000.0) / 1000.0).floor();
    let millis = total_ms % 1000.0;
    format!("{}:{:02}.{:03}", js_number_string(minutes), secs as i64, millis as i64)
}

/// Signed lap delta in seconds at `decimals` places -> `+0.00` / `-0.00` / `0.00`, rounded away
/// from zero; anything that rounds to zero prints unsigned. The live Delta widget uses 2 places,
/// a finished lap's review 3.
pub fn format_delta(seconds: f64, decimals: usize) -> String {
    let zero = to_fixed(0.0, decimals);
    if !seconds.is_finite() {
        return zero;
    }
    let rounded = round_away_from_zero(seconds, decimals as i32);
    if rounded == 0.0 {
        return zero;
    }
    if rounded > 0.0 { format!("+{}", to_fixed(rounded, decimals)) } else { to_fixed(rounded, decimals) }
}

/// The driver's measurement system (`AppSettings.Units` on the host, sent by name in the scene's
/// settings): every speed, temperature, pressure and fuel volume a dash prints is in it. Frames
/// always carry metric values (m/s, °C, kPa, litres); only the printing converts, so thresholds
/// and colours keep reading the frame's own numbers. Imperial is US customary: mph, °F, psi and
/// US gallons.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Units {
    #[default]
    Metric,
    Imperial,
}

impl Units {
    /// The host's name for it; anything else, or nothing, is metric.
    pub fn parse(name: Option<&str>) -> Units {
        if name == Some("Imperial") { Units::Imperial } else { Units::Metric }
    }

    /// What a speed is printed in: `km/h` or `mph`.
    pub fn speed_unit(self) -> &'static str {
        match self {
            Units::Metric => "km/h",
            Units::Imperial => "mph",
        }
    }

    /// What a tyre pressure is printed in: `kPa` or `psi`.
    pub fn pressure_unit(self) -> &'static str {
        match self {
            Units::Metric => "kPa",
            Units::Imperial => "psi",
        }
    }

    /// What a fuel volume is printed in: `L` or `gal`.
    pub fn fuel_unit(self) -> &'static str {
        match self {
            Units::Metric => "L",
            Units::Imperial => "gal",
        }
    }

    /// m/s in km/h or mph.
    pub fn speed(self, meters_per_second: f64) -> f64 {
        match self {
            Units::Metric => meters_per_second * 3.6,
            Units::Imperial => meters_per_second * 3600.0 / 1609.344,
        }
    }

    /// °C in °C or °F.
    pub fn temperature(self, celsius: f64) -> f64 {
        match self {
            Units::Metric => celsius,
            Units::Imperial => celsius * 1.8 + 32.0,
        }
    }

    /// kPa in kPa or psi.
    pub fn pressure(self, kpa: f64) -> f64 {
        match self {
            Units::Metric => kpa,
            Units::Imperial => kpa / 6.894_757_293_168_361,
        }
    }

    /// Litres in litres or US gallons.
    pub fn fuel(self, liters: f64) -> f64 {
        match self {
            Units::Metric => liters,
            Units::Imperial => liters / 3.785_411_784,
        }
    }
}

/// Speed in m/s -> an integer in the driver's unit (km/h or mph).
pub fn format_speed(meters_per_second: f64, units: Units) -> String {
    js_number_string(round_to_even(units.speed(meters_per_second)))
}

/// Celsius -> up to one decimal place, trimming a trailing `.0`; in °F whole degrees, which keeps
/// a tyre's three digits inside the width its widgets size for (`000°`).
pub fn format_temp(celsius: f64, units: Units) -> String {
    if units == Units::Imperial {
        return to_fixed(units.temperature(celsius), 0);
    }
    let fixed = to_fixed(celsius, 1);
    match fixed.strip_suffix(".0") {
        Some(trimmed) => trimmed.to_owned(),
        None => fixed,
    }
}

/// Celsius -> whole degrees in the driver's unit, as "104°".
pub fn format_degrees(celsius: f64, units: Units) -> String {
    format!("{}°", js_number_string(units.temperature(celsius).round()))
}

/// Gear index -> driver-facing glyph (N neutral, R reverse, otherwise the number).
pub fn format_gear(gear: f64) -> String {
    if gear == 0.0 {
        "N".to_owned()
    } else if gear < 0.0 {
        "R".to_owned()
    } else {
        js_number_string(gear)
    }
}

/// JavaScript's `String(n)`: the shortest round-trip digits (Rust's `{}`/`{:e}` produce the same
/// digits), in exponent form below 1e-6 and from 1e21 on, `-0` as `0`.
pub fn js_number_string(value: f64) -> String {
    if !value.is_finite() {
        return to_fixed(value, 0);
    }
    if value == 0.0 {
        return "0".to_owned();
    }
    let magnitude = value.abs();
    if (1e-6..1e21).contains(&magnitude) {
        return format!("{value}");
    }
    let exp = format!("{value:e}");
    match exp.split_once('e') {
        Some((mantissa, power)) if !power.starts_with('-') => format!("{mantissa}e+{power}"),
        _ => exp,
    }
}

/// Truncates toward zero, matching a C# `(long)` cast.
pub fn format_int(value: f64) -> String {
    js_number_string(value.trunc())
}

/// Time gap in seconds -> `0.000`, or `--` when there is no car (non-positive/NaN).
pub fn format_gap(seconds: f64) -> String {
    if seconds <= 0.0 || !seconds.is_finite() { "--".to_owned() } else { to_fixed(seconds, 3) }
}

/// Tyre pressure in kPa -> one decimal place in the driver's unit, or `--` when not reported.
pub fn format_pressure(kpa: f64, units: Units) -> String {
    if kpa <= 0.0 || !kpa.is_finite() { "--".to_owned() } else { to_fixed(units.pressure(kpa), 1) }
}

/// Litres -> one decimal place in the driver's unit.
pub fn format_fuel(liters: f64, units: Units) -> String {
    to_fixed(units.fuel(liters), 1)
}

/// Litres per lap -> two decimal places in the driver's unit.
pub fn format_fuel_per_lap(liters: f64, units: Units) -> String {
    to_fixed(units.fuel(liters), 2)
}

/// A planned fuel figure -> `0.00`, or `--` when nothing was planned (absent is not zero).
pub fn format_fuel_per_lap_target(liters: Option<f64>, units: Units) -> String {
    match liters {
        Some(l) if l.is_finite() => format_fuel_per_lap(l, units),
        _ => "--".to_owned(),
    }
}

/// Front brake bias as a percentage with one decimal, from the frame's rear 0-1 fraction.
pub fn format_front_brake_bias(rear_fraction: f64) -> String {
    to_fixed((1.0 - rear_fraction) * 100.0, 1)
}

/// A driver-adjustable setting's step as its widget and popup print it: the whole step, and `OFF`
/// at 0 for the assists (`off_at_zero`). Never with the highest step.
pub fn format_setting(value: f64, off_at_zero: bool) -> String {
    let step = value.trunc();
    if off_at_zero && step == 0.0 { "OFF".to_owned() } else { js_number_string(step) }
}

/// Signed liters -> `+0.10` / `-0.05` / `0.00`, for fuel against a target.
pub fn format_signed_liters(liters: f64) -> String {
    let fixed = to_fixed(liters, 2);
    if liters > 0.0 && fixed != "0.00" {
        format!("+{fixed}")
    } else if fixed == "-0.00" {
        "0.00".to_owned()
    } else {
        fixed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_fixed_matches_javascript_on_exact_ties_and_negative_zero() {
        assert_eq!(to_fixed(0.25, 1), "0.3");
        assert_eq!(to_fixed(2.5, 0), "3");
        assert_eq!(to_fixed(-2.5, 0), "-3");
        assert_eq!(to_fixed(9.95, 1), "9.9"); // 9.95 is really 9.9499999...
        assert_eq!(to_fixed(9.75, 1), "9.8");
        assert_eq!(to_fixed(99.5, 0), "100");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(-0.0, 1), "0.0");
        assert_eq!(to_fixed(-0.04, 1), "-0.0");
    }

    #[test]
    fn round_to_even_breaks_exact_ties_toward_the_even_neighbor() {
        assert_eq!(round_to_even(2.5), 2.0);
        assert_eq!(round_to_even(3.5), 4.0);
        assert_eq!(round_to_even(2.4), 2.0);
        assert_eq!(round_to_even(2.6), 3.0);
        assert_eq!(round_to_even(-2.5), -2.0);
    }

    #[test]
    fn a_setting_prints_its_whole_step_and_an_assist_at_zero_prints_off() {
        assert_eq!(format_setting(4.9, true), "4");
        assert_eq!(format_setting(0.4, true), "OFF");
        assert_eq!(format_setting(0.0, false), "0");
    }

    #[test]
    fn format_lap_shows_a_placeholder_for_non_positive_or_non_finite_times() {
        for value in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert_eq!(format_lap(value), "--:--.---");
        }
    }

    #[test]
    fn format_lap_rounds_milliseconds_before_splitting() {
        assert_eq!(format_lap(59.9996), "1:00.000");
        assert_eq!(format_lap(92.345), "1:32.345");
        assert_eq!(format_lap(5.007), "0:05.007");
    }

    #[test]
    fn format_delta_is_zero_for_non_finite_input_and_applies_a_dead_band_around_zero() {
        assert_eq!(format_delta(f64::NAN, 3), "0.000");
        assert_eq!(format_delta(0.0001, 3), "0.000");
        assert_eq!(format_delta(-0.0001, 3), "0.000");
        assert_eq!(format_delta(-0.004, 2), "0.00");
    }

    #[test]
    fn format_delta_signs_positive_deltas_and_rounds_away_from_zero() {
        assert_eq!(format_delta(0.5, 3), "+0.500");
        assert_eq!(format_delta(-0.5, 3), "-0.500");
        assert_eq!(format_delta(1.2346, 3), "+1.235");
        assert_eq!(format_delta(-1.2346, 3), "-1.235");
        assert_eq!(format_delta(1.235, 2), "+1.24");
        assert_eq!(format_delta(-0.184, 2), "-0.18");
    }

    #[test]
    fn format_speed_converts_m_s_to_an_integer_in_the_drivers_unit() {
        assert_eq!(format_speed(50.0, Units::Metric), "180");
        assert_eq!(format_speed(0.0, Units::Metric), "0");
        assert_eq!(format_speed(-0.01, Units::Metric), "0");
        assert_eq!(format_speed(50.0, Units::Imperial), "112"); // 111.85 mph
    }

    #[test]
    fn format_temp_keeps_at_most_one_decimal_and_trims_a_trailing_zero() {
        assert_eq!(format_temp(70.0, Units::Metric), "70");
        assert_eq!(format_temp(70.5, Units::Metric), "70.5");
        assert_eq!(format_temp(70.04, Units::Metric), "70");
        assert_eq!(format_temp(70.0, Units::Imperial), "158");
        assert_eq!(format_temp(70.5, Units::Imperial), "159", "whole °F");
    }

    #[test]
    fn format_degrees_prints_whole_degrees_in_the_drivers_unit() {
        assert_eq!(format_degrees(104.4, Units::Metric), "104°");
        assert_eq!(format_degrees(118.0, Units::Imperial), "244°"); // 244.4 °F
        assert_eq!(format_degrees(-40.0, Units::Imperial), "-40°");
    }

    #[test]
    fn format_gear_maps_neutral_and_reverse_to_letters_everything_else_to_its_number() {
        assert_eq!(format_gear(0.0), "N");
        assert_eq!(format_gear(-1.0), "R");
        assert_eq!(format_gear(4.0), "4");
    }

    #[test]
    fn format_int_truncates_toward_zero() {
        assert_eq!(format_int(4.9), "4");
        assert_eq!(format_int(-4.9), "-4");
        assert_eq!(format_int(-0.4), "0");
    }

    #[test]
    fn format_gap_shows_a_placeholder_when_there_is_no_car() {
        assert_eq!(format_gap(0.0), "--");
        assert_eq!(format_gap(-1.0), "--");
        assert_eq!(format_gap(f64::NAN), "--");
        assert_eq!(format_gap(1.2), "1.200");
    }

    #[test]
    fn format_pressure_shows_a_placeholder_when_not_reported() {
        assert_eq!(format_pressure(0.0, Units::Metric), "--");
        assert_eq!(format_pressure(0.0, Units::Imperial), "--");
        assert_eq!(format_pressure(180.26, Units::Metric), "180.3");
        assert_eq!(format_pressure(180.26, Units::Imperial), "26.1");
    }

    #[test]
    fn format_fuel_and_format_fuel_per_lap_use_fixed_decimal_places() {
        assert_eq!(format_fuel(42.5, Units::Metric), "42.5");
        assert_eq!(format_fuel_per_lap(2.756, Units::Metric), "2.76");
        assert_eq!(format_fuel(42.5, Units::Imperial), "11.2"); // US gallons
        assert_eq!(format_fuel_per_lap(2.756, Units::Imperial), "0.73");
    }

    #[test]
    fn format_fuel_per_lap_target_distinguishes_no_plan_from_plan_for_0() {
        assert_eq!(format_fuel_per_lap_target(None, Units::Metric), "--");
        assert_eq!(format_fuel_per_lap_target(Some(0.0), Units::Metric), "0.00");
        assert_eq!(format_fuel_per_lap_target(Some(2.4), Units::Metric), "2.40");
        assert_eq!(format_fuel_per_lap_target(Some(2.4), Units::Imperial), "0.63");
    }

    #[test]
    fn units_are_metric_unless_the_host_names_imperial() {
        assert_eq!(Units::parse(Some("Imperial")), Units::Imperial);
        assert_eq!(Units::parse(Some("Metric")), Units::Metric);
        assert_eq!(Units::parse(Some("imperial")), Units::Metric);
        assert_eq!(Units::parse(None), Units::Metric);
    }

    #[test]
    fn format_signed_liters_signs_positive_values_and_never_prints_negative_zero() {
        assert_eq!(format_signed_liters(0.1), "+0.10");
        assert_eq!(format_signed_liters(-0.05), "-0.05");
        assert_eq!(format_signed_liters(-0.001), "0.00");
        assert_eq!(format_signed_liters(0.001), "0.00");
    }

    #[test]
    fn js_number_string_prints_like_string_of_a_number() {
        assert_eq!(js_number_string(92.345), "92.345");
        assert_eq!(js_number_string(7450.0), "7450");
        assert_eq!(js_number_string(-0.0), "0");
        assert_eq!(js_number_string(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(js_number_string(1e21), "1e+21");
        assert_eq!(js_number_string(1.5e-7), "1.5e-7");
        assert_eq!(js_number_string(0.000001), "0.000001");
        assert_eq!(js_number_string(f64::NAN), "NaN");
    }

    #[test]
    fn format_front_brake_bias_shows_the_front_share() {
        assert_eq!(format_front_brake_bias(0.455), "54.5");
    }
}
