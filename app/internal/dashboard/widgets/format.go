package widgets

import (
	"fmt"
	"math"
	"strings"
)

// namedFormatters maps format names to formatting functions.
// Each function receives the raw value and the resolved FormatPreferences so
// that user-configured units and precision are honoured at render time.
// When the "format" config key matches one of these names, the corresponding
// function is used instead of treating the value as an fmt.Sprintf pattern.
var namedFormatters = map[string]func(any, FormatPreferences) string{
	"lap":      fmtAnyLap,
	"sector":   fmtAnySector,
	"speed":    fmtAnySpeed,
	"int":      ignorePrefs(fmtAnyInt),
	"float":    ignorePrefs(fmtAnyFloat2),
	"float1":   ignorePrefs(fmtAnyFloat1),
	"float2":   ignorePrefs(fmtAnyFloat2),
	"bool":     ignorePrefs(fmtAnyBool),
	"delta":    fmtAnyDelta,
	"gap":      fmtAnyGap,
	"session":  ignorePrefs(fmtAnySession),
	"temp":     fmtAnyTemp,
	"pressure": fmtAnyPressure,
}

// ignorePrefs wraps a pref-agnostic formatter so it fits the prefs-aware signature.
func ignorePrefs(fn func(any) string) func(any, FormatPreferences) string {
	return func(v any, _ FormatPreferences) string { return fn(v) }
}

// FormatValue converts val to a display string using the format hint and the
// active FormatPreferences.
//
// Resolution order:
//  1. If format is a named formatter key (e.g. "lap", "speed"), apply it with prefs.
//  2. If format contains a '%', use it as an fmt.Sprintf pattern.
//  3. If format is empty, fall back to fmt.Sprint(val).
func FormatValue(val any, format string, prefs FormatPreferences) string {
	prefs = resolvedFormatPreferences(prefs)
	if format != "" {
		if fn, ok := namedFormatters[format]; ok {
			return fn(val, prefs)
		}
		if strings.ContainsRune(format, '%') {
			return fmt.Sprintf(format, val)
		}
	}
	return fmt.Sprint(val)
}

// ToFloat64 converts common numeric types to float64.
func ToFloat64(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	}
	return 0, false
}

func fmtAnyLap(v any, prefs FormatPreferences) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return FmtLapWith(f, prefs.LapFormat)
}

func fmtAnySector(v any, prefs FormatPreferences) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return FmtSectorWith(f, prefs.LapFormat)
}

func fmtAnySpeed(v any, prefs FormatPreferences) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	switch prefs.SpeedUnit {
	case SpeedMPH:
		return fmt.Sprintf("%.0f", f*2.23694)
	default:
		return fmt.Sprintf("%.0f", f*3.6)
	}
}

func fmtAnyInt(v any) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return fmt.Sprintf("%d", int64(f))
}

func fmtAnyFloat1(v any) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return fmt.Sprintf("%.1f", f)
}

func fmtAnyFloat2(v any) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return fmt.Sprintf("%.2f", f)
}

func fmtAnyBool(v any) string {
	if b, ok := v.(bool); ok {
		if b {
			return "true"
		}
		return "false"
	}
	return fmt.Sprint(v)
}

// fmtAnyDelta formats a signed float64 as e.g. "+0.123" or "-0.456".
// Precision is controlled by prefs.DeltaPrecision.
func fmtAnyDelta(v any, prefs FormatPreferences) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	rounded := roundDeltaValue(f, prefs.DeltaPrecision)
	pattern := deltaPattern(prefs.DeltaPrecision)
	if rounded > 0 {
		return fmt.Sprintf("+"+pattern, rounded)
	}
	if rounded == 0 {
		return fmt.Sprintf(pattern, rounded)
	}
	return fmt.Sprintf(pattern, rounded)
}

// fmtAnyGap formats a gap value as e.g. "+1.234" or "---" when zero.
// Precision is controlled by prefs.DeltaPrecision.
func fmtAnyGap(v any, prefs FormatPreferences) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	rounded := roundDeltaValue(f, prefs.DeltaPrecision)
	if rounded == 0 {
		return "---"
	}
	pattern := deltaPattern(prefs.DeltaPrecision)
	return fmt.Sprintf("+"+pattern, rounded)
}

// fmtAnySession formats a session time (seconds) as "H:MM:SS" or "MM:SS".
func fmtAnySession(v any) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	t := int(f)
	if t < 0 {
		t = 0
	}
	h := t / 3600
	m := (t % 3600) / 60
	s := t % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%02d:%02d", m, s)
}

// fmtAnyTemp formats a Celsius temperature value according to prefs.TempUnit.
func fmtAnyTemp(v any, prefs FormatPreferences) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	switch prefs.TempUnit {
	case TempFahrenheit:
		return fmt.Sprintf("%.1f", f*9/5+32)
	default:
		return fmt.Sprintf("%.1f", f)
	}
}

// fmtAnyPressure formats a kPa pressure value according to prefs.PressureUnit.
func fmtAnyPressure(v any, prefs FormatPreferences) string {
	f, ok := ToFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	switch prefs.PressureUnit {
	case PressurePSI:
		return fmt.Sprintf("%.1f", f*0.14504)
	case PressureBar:
		return fmt.Sprintf("%.3f", f/100)
	default:
		return fmt.Sprintf("%.1f", f)
	}
}

// deltaPattern returns the fmt.Sprintf precision pattern for the given DeltaPrecision.
func deltaPattern(dp DeltaPrecision) string {
	switch dp {
	case DeltaPrec2:
		return "%.2f"
	default:
		return "%.3f"
	}
}

func roundDeltaValue(v float64, dp DeltaPrecision) float64 {
	factor := 1000.0
	if dp == DeltaPrec2 {
		factor = 100.0
	}
	rounded := math.Round(v*factor) / factor
	if math.Abs(rounded) < 1.0/factor {
		return 0
	}
	return rounded
}
