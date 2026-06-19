package widgets

// LapFormat controls how lap and sector times are displayed.
type LapFormat string

const (
	LapFormatMSSmmm LapFormat = "M:SS.mmm" // 1:23.456 — default
	LapFormatMSSmm  LapFormat = "M:SS.mm"  // 1:23.45
	LapFormatSSmmm  LapFormat = "SS.mmm"   // 83.456 (total seconds, 3 dp)
)

// SpeedUnit controls the display unit for speed values.
type SpeedUnit string

const (
	SpeedKPH SpeedUnit = "kph" // km/h — default
	SpeedMPH SpeedUnit = "mph" // mi/h
)

// TempUnit controls the display unit for temperature values.
type TempUnit string

const (
	TempCelsius    TempUnit = "c" // °C — default
	TempFahrenheit TempUnit = "f" // °F
)

// PressureUnit controls the display unit for pressure values.
type PressureUnit string

const (
	PressureKPa PressureUnit = "kpa" // kPa — default
	PressurePSI PressureUnit = "psi" // PSI
	PressureBar PressureUnit = "bar" // bar
)

// DeltaPrecision controls the number of decimal places shown for delta and gap values.
type DeltaPrecision string

const (
	DeltaPrec2 DeltaPrecision = "2" // +0.12 — default
	DeltaPrec3 DeltaPrecision = "3" // +0.123
)

// FormatPreferences holds per-data-type display format choices.
// Zero values are treated as "use the default" so existing saved layouts
// load cleanly without any migration.
type FormatPreferences struct {
	LapFormat      LapFormat      `json:"lapFormat,omitempty"`
	SpeedUnit      SpeedUnit      `json:"speedUnit,omitempty"`
	TempUnit       TempUnit       `json:"tempUnit,omitempty"`
	PressureUnit   PressureUnit   `json:"pressureUnit,omitempty"`
	DeltaPrecision DeltaPrecision `json:"deltaPrecision,omitempty"`
}

// DefaultFormatPreferences returns the compile-time defaults.
func DefaultFormatPreferences() FormatPreferences {
	return FormatPreferences{
		LapFormat:      LapFormatMSSmmm,
		SpeedUnit:      SpeedKPH,
		TempUnit:       TempCelsius,
		PressureUnit:   PressureKPa,
		DeltaPrecision: DeltaPrec3,
	}
}

// resolvedFormatPreferences returns p with any zero-value fields replaced by
// the compile-time defaults. It never mutates the receiver.
func resolvedFormatPreferences(p FormatPreferences) FormatPreferences {
	d := DefaultFormatPreferences()
	if p.LapFormat == "" {
		p.LapFormat = d.LapFormat
	}
	if p.SpeedUnit == "" {
		p.SpeedUnit = d.SpeedUnit
	}
	if p.TempUnit == "" {
		p.TempUnit = d.TempUnit
	}
	if p.PressureUnit == "" {
		p.PressureUnit = d.PressureUnit
	}
	if p.DeltaPrecision == "" {
		p.DeltaPrecision = d.DeltaPrecision
	}
	return p
}

// MergeFormatPreferences returns a new FormatPreferences where every non-zero
// field in overlay overwrites the corresponding field in base.
// Use this to apply dash-level or widget-level overrides over the global defaults.
func MergeFormatPreferences(base, overlay FormatPreferences) FormatPreferences {
	if overlay.LapFormat != "" {
		base.LapFormat = overlay.LapFormat
	}
	if overlay.SpeedUnit != "" {
		base.SpeedUnit = overlay.SpeedUnit
	}
	if overlay.TempUnit != "" {
		base.TempUnit = overlay.TempUnit
	}
	if overlay.PressureUnit != "" {
		base.PressureUnit = overlay.PressureUnit
	}
	if overlay.DeltaPrecision != "" {
		base.DeltaPrecision = overlay.DeltaPrecision
	}
	return base
}

// FormatPreferencesFromConfig extracts widget-level format overrides from a
// DashWidget.Config map. Keys: "lap_format", "speed_unit", "temp_unit",
// "pressure_unit", "delta_precision". Unknown or absent keys are left zero
// (i.e., inherit from the dash/global level).
func FormatPreferencesFromConfig(cfg map[string]any) FormatPreferences {
	if cfg == nil {
		return FormatPreferences{}
	}
	var p FormatPreferences
	if v, ok := cfg["lap_format"].(string); ok {
		p.LapFormat = LapFormat(v)
	}
	if v, ok := cfg["speed_unit"].(string); ok {
		p.SpeedUnit = SpeedUnit(v)
	}
	if v, ok := cfg["temp_unit"].(string); ok {
		p.TempUnit = TempUnit(v)
	}
	if v, ok := cfg["pressure_unit"].(string); ok {
		p.PressureUnit = PressureUnit(v)
	}
	if v, ok := cfg["delta_precision"].(string); ok {
		p.DeltaPrecision = DeltaPrecision(v)
	}
	return p
}
