package alerts

import "slices"

// DefaultAlertDuration is the established shared alert duration in seconds.
const DefaultAlertDuration = 1.5

// AlertDisplayMode controls how an active alert occupies the dashboard.
type AlertDisplayMode string

const (
	// AlertDisplayFull covers the complete physical dashboard output.
	AlertDisplayFull AlertDisplayMode = "full"
	// AlertDisplayMiddle renders a wide rounded instrument centred on the screen,
	// leaving the rest of the dashboard visible.
	AlertDisplayMiddle AlertDisplayMode = "middle"
)

// AlertColorMode controls how an alert's semantic colour is applied.
type AlertColorMode string

const (
	// AlertColorNormal fills with the semantic colour and picks a contrasting
	// (black or white) foreground for text and iconography.
	AlertColorNormal AlertColorMode = "normal"
	// AlertColorInverted fills with black and uses the semantic colour for text,
	// iconography, and outline details.
	AlertColorInverted AlertColorMode = "inverted"
)

// AlertConfig is the dashboard-level shared alert configuration: one set of
// display controls plus the set of enabled alert types. It replaces the previous
// per-instance placement/configuration model.
type AlertConfig struct {
	DisplayMode  AlertDisplayMode `json:"displayMode,omitempty"`
	ColorMode    AlertColorMode   `json:"colorMode,omitempty"`
	Duration     float64          `json:"duration,omitempty"`
	EnabledTypes []AlertType      `json:"enabledTypes,omitempty"`
}

// HasType reports whether t is enabled.
func (c AlertConfig) HasType(t AlertType) bool {
	return slices.Contains(c.EnabledTypes, t)
}

// WithDefaults returns the config with display/color modes and duration filled in.
func (c AlertConfig) WithDefaults() AlertConfig {
	if c.DisplayMode == "" {
		c.DisplayMode = AlertDisplayFull
	}
	if c.ColorMode == "" {
		c.ColorMode = AlertColorNormal
	}
	if c.Duration <= 0 {
		c.Duration = DefaultAlertDuration
	}
	return c
}

// MigrateAlertConfig folds legacy per-instance AlertInstances into the shared
// dashboard alert config. It is idempotent: once the config already lists enabled
// types the legacy data is ignored, and missing display/color/duration values are
// filled with the established defaults. Per-instance durations collapse into one
// safe shared duration (the longest meaningful value, else the default).
func MigrateAlertConfig(legacy []AlertInstance, existing AlertConfig) AlertConfig {
	out := existing

	if len(out.EnabledTypes) == 0 && len(legacy) > 0 {
		seen := map[AlertType]bool{}
		types := make([]AlertType, 0, len(legacy))
		var maxDuration float64
		for _, inst := range legacy {
			if inst.Type == "" {
				continue
			}
			if !seen[inst.Type] {
				seen[inst.Type] = true
				types = append(types, inst.Type)
			}
			if d := ConfigFloat(inst.Config, "duration", 0); d > maxDuration {
				maxDuration = d
			}
		}
		slices.Sort(types)
		out.EnabledTypes = types
		if out.Duration <= 0 && maxDuration > 0 {
			out.Duration = maxDuration
		}
	}

	return out.WithDefaults()
}

// EnabledTypesSorted returns the enabled alert types in a stable order. The painter
// evaluates alerts in this order so simultaneous triggers resolve deterministically.
func (c AlertConfig) EnabledTypesSorted() []AlertType {
	out := append([]AlertType(nil), c.EnabledTypes...)
	slices.Sort(out)
	return out
}
