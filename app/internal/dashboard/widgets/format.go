package widgets

import (
	"fmt"
	"strings"
)

// namedFormatters maps format names to formatting functions.
// When the "format" config key matches one of these names, the corresponding
// function is used instead of treating the value as an fmt.Sprintf pattern.
var namedFormatters = map[string]func(any) string{
	"lap":     fmtAnyLap,
	"sector":  fmtAnySector,
	"speed":   fmtAnySpeed,
	"int":     fmtAnyInt,
	"float":   fmtAnyFloat2,
	"float1":  fmtAnyFloat1,
	"float2":  fmtAnyFloat2,
	"bool":    fmtAnyBool,
	"delta":   fmtAnyDelta,
	"gap":     fmtAnyGap,
	"session": fmtAnySession,
}

// FormatValue converts val to a display string using the format hint.
//
// Resolution order:
//  1. If format is a named formatter key (e.g. "lap", "speed"), apply it.
//  2. If format contains a '%', use it as an fmt.Sprintf pattern.
//  3. If format is empty, fall back to fmt.Sprint(val).
func FormatValue(val any, format string) string {
	if format != "" {
		if fn, ok := namedFormatters[format]; ok {
			return fn(val)
		}
		if strings.ContainsRune(format, '%') {
			return fmt.Sprintf(format, val)
		}
	}
	return fmt.Sprint(val)
}

// toFloat64 converts common numeric types to float64.
func toFloat64(v any) (float64, bool) {
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

func fmtAnyLap(v any) string {
	f, ok := toFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return FmtLap(f)
}

func fmtAnySector(v any) string {
	f, ok := toFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return FmtSector(f)
}

func fmtAnySpeed(v any) string {
	f, ok := toFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return fmt.Sprintf("%.0f", f*3.6)
}

func fmtAnyInt(v any) string {
	f, ok := toFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return fmt.Sprintf("%d", int64(f))
}

func fmtAnyFloat1(v any) string {
	f, ok := toFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	return fmt.Sprintf("%.1f", f)
}

func fmtAnyFloat2(v any) string {
	f, ok := toFloat64(v)
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

// fmtAnyDelta formats a signed float64 as "+0.123" or "-0.123".
func fmtAnyDelta(v any) string {
	f, ok := toFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	if f >= 0 {
		return fmt.Sprintf("+%.3f", f)
	}
	return fmt.Sprintf("%.3f", f) // negative sign from Sprintf
}

// fmtAnyGap formats a gap value as "+0.000" or "---" when zero.
func fmtAnyGap(v any) string {
	f, ok := toFloat64(v)
	if !ok {
		return fmt.Sprint(v)
	}
	if f == 0 {
		return "---"
	}
	return fmt.Sprintf("+%.3f", f)
}

// fmtAnySession formats a session time (seconds) as "H:MM:SS" or "MM:SS".
func fmtAnySession(v any) string {
	f, ok := toFloat64(v)
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
