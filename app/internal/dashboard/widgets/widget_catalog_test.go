package widgets

import (
	"testing"

	"github.com/kratofl/sprint/pkg/dto"
)

func TestWidgetCatalog(t *testing.T) {
	catalog := WidgetCatalog()

	if len(catalog) < 20 {
		t.Errorf("expected at least 20 registered widgets, got %d", len(catalog))
	}

	// Index by type for quick lookup.
	byType := make(map[WidgetType]WidgetMeta, len(catalog))
	for _, m := range catalog {
		byType[m.Type] = m
	}

	t.Run("tc widget has tcMode configDef", func(t *testing.T) {
		m, ok := byType[WidgetTC]
		if !ok {
			t.Fatal("tc widget not in catalog")
		}
		var found bool
		for _, def := range m.ConfigDefs {
			if def.Key == "tcMode" {
				found = true
				break
			}
		}
		if !found {
			t.Error("tc widget missing configDef with key 'tcMode'")
		}
	})

	t.Run("text widget has binding and format configDefs", func(t *testing.T) {
		m, ok := byType[WidgetText]
		if !ok {
			t.Fatal("text widget not in catalog")
		}
		keys := make(map[string]bool)
		for _, def := range m.ConfigDefs {
			keys[def.Key] = true
		}
		for _, want := range []string{"content", "binding", "format", "color", "font_scale"} {
			if !keys[want] {
				t.Errorf("text widget missing configDef with key %q", want)
			}
		}
	})

	t.Run("flags widget is idle-capable", func(t *testing.T) {
		m, ok := byType[WidgetFlags]
		if !ok {
			t.Fatal("flags widget not in catalog")
		}
		if !m.IdleCapable {
			t.Error("flags widget should have IdleCapable=true")
		}
	})

	t.Run("all widgets have positive default spans", func(t *testing.T) {
		for _, m := range catalog {
			if m.DefaultColSpan <= 0 {
				t.Errorf("widget %q has DefaultColSpan=%d, want > 0", m.Type, m.DefaultColSpan)
			}
			if m.DefaultRowSpan <= 0 {
				t.Errorf("widget %q has DefaultRowSpan=%d, want > 0", m.Type, m.DefaultRowSpan)
			}
		}
	})

	t.Run("all widgets have non-empty label and category", func(t *testing.T) {
		for _, m := range catalog {
			if m.Label == "" {
				t.Errorf("widget %q has empty label", m.Type)
			}
			if m.Category == "" {
				t.Errorf("widget %q has empty category", m.Type)
			}
		}
	})

	t.Run("all widgets have positive DefaultUpdateHz", func(t *testing.T) {
		for _, m := range catalog {
			if m.DefaultUpdateHz <= 0 {
				t.Errorf("widget %q has DefaultUpdateHz=%.1f, want > 0", m.Type, m.DefaultUpdateHz)
			}
		}
	})

	t.Run("all widgets have update_rate configDef", func(t *testing.T) {
		for _, m := range catalog {
			var found bool
			for _, def := range m.ConfigDefs {
				if def.Key == "update_rate" {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("widget %q missing auto-injected update_rate configDef", m.Type)
			}
		}
	})

	t.Run("all widgets are dispatchable via registry", func(t *testing.T) {
		for _, m := range catalog {
			if _, ok := widgetRegistry[m.Type]; !ok {
				t.Errorf("widget %q is in catalog metadata but missing from registry", m.Type)
			}
		}
	})

	t.Run("all widgets return non-nil Definition", func(t *testing.T) {
		frame := &dto.TelemetryFrame{}
		for _, m := range catalog {
			w, ok := Get(m.Type)
			if !ok {
				t.Errorf("widget %q missing from registry", m.Type)
				continue
			}
			elems := w.Definition(nil)
			if elems == nil {
				t.Errorf("widget %q returned nil from Definition(nil)", m.Type)
			}
			_ = frame
		}
	})

	t.Run("tc widget Definition with config", func(t *testing.T) {
		w, ok := Get(WidgetTC)
		if !ok {
			t.Fatal("tc widget not in registry")
		}
		for _, mode := range []string{"tc1", "tc2_cut", "tc3_slip"} {
			elems := w.Definition(map[string]any{"tcMode": mode})
			if len(elems) == 0 {
				t.Errorf("tc widget mode=%q returned no elements", mode)
			}
		}
	})
}

func TestResolve(t *testing.T) {
	frame := &dto.TelemetryFrame{
		Car: dto.CarState{SpeedMS: 30, Gear: 3, RPM: 8000},
		Lap: dto.LapState{CurrentLap: 5, CurrentLapTime: 90.123, BestLapTime: 88.456},
		Race: dto.RaceState{Position: 2, GapAhead: 0.321},
		Electronics: dto.Electronics{TC: 4, ABS: 2},
		Session: dto.Session{Track: "Monza", Car: "Ferrari"},
		Energy: dto.EnergyState{SoC: 0.75},
		Penalties: dto.Penalties{Incidents: 1},
		Flags: dto.Flags{Yellow: true},
	}

	cases := []struct {
		path string
		want any
	}{
		{"car.speedMS", float32(30)},
		{"car.gear", int8(3)},
		{"car.rpm", float32(8000)},
		{"lap.currentLap", 5},
		{"lap.currentLapTime", 90.123},
		{"lap.bestLapTime", 88.456},
		{"race.position", uint8(2)},
		{"race.gapAhead", float32(0.321)},
		{"electronics.tc", uint8(4)},
		{"electronics.abs", uint8(2)},
		{"session.track", "Monza"},
		{"session.car", "Ferrari"},
		{"energy.soc", float32(0.75)},
		{"penalties.incidents", int16(1)},
		{"flags.yellow", true},
	}

	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			got, ok := Resolve(frame, tc.path)
			if !ok {
				t.Fatalf("Resolve(%q) returned ok=false", tc.path)
			}
			if got != tc.want {
				t.Errorf("Resolve(%q) = %v (%T), want %v (%T)", tc.path, got, got, tc.want, tc.want)
			}
		})
	}

	t.Run("derived car.speedKPH", func(t *testing.T) {
		got, ok := Resolve(frame, "car.speedKPH")
		if !ok {
			t.Fatal("Resolve(car.speedKPH) returned ok=false")
		}
		want := float32(30) * 3.6
		if got != want {
			t.Errorf("car.speedKPH = %v, want %v", got, want)
		}
	})

	t.Run("unknown path returns false", func(t *testing.T) {
		if _, ok := Resolve(frame, "does.not.exist"); ok {
			t.Error("expected ok=false for unknown path")
		}
	})
}

func TestFormatValue(t *testing.T) {
	cases := []struct {
		name   string
		val    any
		format string
		want   string
	}{
		{"lap named", 90.0, "lap", "1:30.000"},
		{"sector named", 30.5, "sector", "30.500"},
		{"speed named", 30.0, "speed", "108"},
		{"int named", 42.0, "int", "42"},
		{"float named", 1.2345, "float", "1.23"},
		{"float1 named", 1.2345, "float1", "1.2"},
		{"float2 named", 1.2345, "float2", "1.23"},
		{"bool true", true, "bool", "true"},
		{"bool false", false, "bool", "false"},
		{"sprintf pattern", 42.0, "%.0f km/h", "42 km/h"},
		{"empty format", "hello", "", "hello"},
		{"int via sprint", 7, "", "7"},
		{"delta positive", 1.234, "delta", "+1.234"},
		{"delta negative", -0.456, "delta", "-0.456"},
		{"gap nonzero", float32(1.5), "gap", "+1.500"},
		{"gap zero", float32(0), "gap", "---"},
		{"session hours", 3661.0, "session", "1:01:01"},
		{"session minutes", 90.0, "session", "01:30"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := FormatValue(tc.val, tc.format)
			if got != tc.want {
				t.Errorf("FormatValue(%v, %q) = %q, want %q", tc.val, tc.format, got, tc.want)
			}
		})
	}
}
