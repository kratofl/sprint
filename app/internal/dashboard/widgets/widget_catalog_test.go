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

	t.Run("all widgets have non-empty name and category", func(t *testing.T) {
		for _, m := range catalog {
			if m.Name == "" {
				t.Errorf("widget %q has empty name", m.Type)
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
		cases := []struct {
			mode        string
			wantLabel   string
			wantBinding string
		}{
			{mode: "tc1", wantLabel: "TC1", wantBinding: "electronics.tc"},
			{mode: "tc2_cut", wantLabel: "TC2", wantBinding: "electronics.tcCut"},
			{mode: "tc3_slip", wantLabel: "TC3", wantBinding: "electronics.tcSlip"},
		}
		for _, tc := range cases {
			elems := w.Definition(map[string]any{"tcMode": tc.mode})
			if len(elems) == 0 {
				t.Errorf("tc widget mode=%q returned no elements", tc.mode)
				continue
			}
			if len(elems) < 2 {
				t.Errorf("tc widget mode=%q returned %d elements, want >= 2", tc.mode, len(elems))
				continue
			}
			if elems[0].(Text).Text != tc.wantLabel {
				t.Errorf("tc widget mode=%q label = %q, want %q", tc.mode, elems[0].(Text).Text, tc.wantLabel)
			}
			if elems[1].(Text).Binding != tc.wantBinding {
				t.Errorf("tc widget mode=%q binding = %q, want %q", tc.mode, elems[1].(Text).Binding, tc.wantBinding)
			}
		}
	})
}

func TestResolve(t *testing.T) {
	frame := &dto.TelemetryFrame{
		Car:         dto.CarState{SpeedMS: 30, Gear: 3, RPM: 8000},
		Lap:         dto.LapState{CurrentLap: 5, CurrentLapTime: 90.123, BestLapTime: 88.456},
		Race:        dto.RaceState{Position: 2, GapAhead: 0.321},
		Electronics: dto.Electronics{TC: 4, ABS: 2},
		Session:     dto.Session{Track: "Monza", Car: "Ferrari"},
		Energy:      dto.EnergyState{SoC: 0.75},
		Penalties:   dto.Penalties{Incidents: 1},
		Flags:       dto.Flags{Yellow: true},
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
	def := DefaultFormatPreferences()
	cases := []struct {
		name   string
		val    any
		format string
		prefs  FormatPreferences
		want   string
	}{
		{"lap named", 90.0, "lap", def, "1:30.000"},
		{"lap M:SS.mm", 90.0, "lap", FormatPreferences{LapFormat: LapFormatMSSmm}, "1:30.00"},
		{"lap SS.mmm", 90.5, "lap", FormatPreferences{LapFormat: LapFormatSSmmm}, "90.500"},
		{"sector named", 30.5, "sector", def, "30.500"},
		{"speed kph", 30.0, "speed", def, "108"},
		{"speed mph", 30.0, "speed", FormatPreferences{SpeedUnit: SpeedMPH}, "67"},
		{"int named", 42.0, "int", def, "42"},
		{"float named", 1.2345, "float", def, "1.23"},
		{"float1 named", 1.2345, "float1", def, "1.2"},
		{"float2 named", 1.2345, "float2", def, "1.23"},
		{"bool true", true, "bool", def, "true"},
		{"bool false", false, "bool", def, "false"},
		{"sprintf pattern", 42.0, "%.0f km/h", def, "42 km/h"},
		{"empty format", "hello", "", def, "hello"},
		{"int via sprint", 7, "", def, "7"},
		{"delta positive 3dp", 1.234, "delta", def, "+1.234"},
		{"delta negative 3dp", -0.456, "delta", def, "-0.456"},
		{"delta positive 2dp", 1.234, "delta", FormatPreferences{DeltaPrecision: DeltaPrec2}, "+1.23"},
		{"delta rounds positive near zero to zero", 0.004, "delta", FormatPreferences{DeltaPrecision: DeltaPrec2}, "0.00"},
		{"delta rounds negative zero to zero", -0.0004, "delta", def, "0.000"},
		{"gap nonzero", float32(1.5), "gap", def, "+1.500"},
		{"gap zero", float32(0), "gap", def, "---"},
		{"gap rounds near zero to placeholder", 0.0004, "gap", def, "---"},
		{"session hours", 3661.0, "session", def, "1:01:01"},
		{"session minutes", 90.0, "session", def, "01:30"},
		{"temp celsius", 85.0, "temp", def, "85.0"},
		{"temp fahrenheit", 100.0, "temp", FormatPreferences{TempUnit: TempFahrenheit}, "212.0"},
		{"pressure kpa", 165.0, "pressure", def, "165.0"},
		{"pressure psi", 165.0, "pressure", FormatPreferences{PressureUnit: PressurePSI}, "23.9"},
		{"pressure bar", 165.0, "pressure", FormatPreferences{PressureUnit: PressureBar}, "1.650"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := FormatValue(tc.val, tc.format, tc.prefs)
			if got != tc.want {
				t.Errorf("FormatValue(%v, %q, prefs) = %q, want %q", tc.val, tc.format, got, tc.want)
			}
		})
	}
}

func TestFmtLapWithRoundingBoundaries(t *testing.T) {
	t.Run("MSSmmm carries to next minute cleanly", func(t *testing.T) {
		got := FmtLapWith(59.9996, LapFormatMSSmmm)
		if got != "1:00.000" {
			t.Errorf("FmtLapWith(59.9996, MSSmmm) = %q, want %q", got, "1:00.000")
		}
	})

	t.Run("MSSmm carries to next minute cleanly", func(t *testing.T) {
		got := FmtLapWith(59.996, LapFormatMSSmm)
		if got != "1:00.00" {
			t.Errorf("FmtLapWith(59.996, MSSmm) = %q, want %q", got, "1:00.00")
		}
	})
}

func TestResolveWithPrefsDeltaSign(t *testing.T) {
	frame := &dto.TelemetryFrame{Lap: dto.LapState{Delta: 0.0}}

	t.Run("precision 2 rounds near zero to neutral", func(t *testing.T) {
		frame.Lap.Delta = 0.004
		pos, ok := ResolveWithPrefs(frame, "lap.deltaPositive", FormatPreferences{DeltaPrecision: DeltaPrec2})
		if !ok {
			t.Fatal("ResolveWithPrefs(lap.deltaPositive) returned ok=false")
		}
		neg, ok := ResolveWithPrefs(frame, "lap.deltaNegative", FormatPreferences{DeltaPrecision: DeltaPrec2})
		if !ok {
			t.Fatal("ResolveWithPrefs(lap.deltaNegative) returned ok=false")
		}
		if pos.(bool) || neg.(bool) {
			t.Fatalf("expected neutral sign at 2dp for delta=0.004, got pos=%v neg=%v", pos, neg)
		}
	})

	t.Run("precision 2 keeps slower/faster away from zero", func(t *testing.T) {
		frame.Lap.Delta = 0.006
		pos, _ := ResolveWithPrefs(frame, "lap.deltaPositive", FormatPreferences{DeltaPrecision: DeltaPrec2})
		neg, _ := ResolveWithPrefs(frame, "lap.deltaNegative", FormatPreferences{DeltaPrecision: DeltaPrec2})
		if !pos.(bool) || neg.(bool) {
			t.Fatalf("expected slower sign for delta=0.006 at 2dp, got pos=%v neg=%v", pos, neg)
		}

		frame.Lap.Delta = -0.006
		pos, _ = ResolveWithPrefs(frame, "lap.deltaPositive", FormatPreferences{DeltaPrecision: DeltaPrec2})
		neg, _ = ResolveWithPrefs(frame, "lap.deltaNegative", FormatPreferences{DeltaPrecision: DeltaPrec2})
		if pos.(bool) || !neg.(bool) {
			t.Fatalf("expected faster sign for delta=-0.006 at 2dp, got pos=%v neg=%v", pos, neg)
		}
	})

	t.Run("precision 3 uses tighter zero band", func(t *testing.T) {
		frame.Lap.Delta = 0.0004
		pos, _ := ResolveWithPrefs(frame, "lap.deltaPositive", FormatPreferences{DeltaPrecision: DeltaPrec3})
		if pos.(bool) {
			t.Fatalf("expected neutral sign for delta=0.0004 at 3dp, got pos=%v", pos)
		}

		frame.Lap.Delta = 0.0006
		pos, _ = ResolveWithPrefs(frame, "lap.deltaPositive", FormatPreferences{DeltaPrecision: DeltaPrec3})
		if !pos.(bool) {
			t.Fatalf("expected slower sign for delta=0.0006 at 3dp, got pos=%v", pos)
		}
	})
}
