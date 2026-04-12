// Package alerts defines the alert registry and types for dashboard overlay alerts.
// Alert types are registered via RegisterAlert in init() of each alert_*.go file.
// The dashboard painter evaluates all configured AlertInstances on every frame
// and shows a full-screen overlay when a trigger fires.
package alerts

import (
	"fmt"

	"github.com/kratofl/sprint/app/internal/dashboard/config"
	"github.com/kratofl/sprint/pkg/dto"
)

// AlertType is the canonical string identifier for a registered alert kind.
type AlertType string

// Alert is the interface implemented by every alert type.
// Definition and trigger logic live in alert_*.go files; no rendering code
// should appear here — the painter resolves colours and draws the overlay.
//
// # Adding a new alert type
//
//  1. Create app/internal/dashboard/alerts/alert_<name>.go.
//  2. Define an AlertType constant and a struct implementing Alert.
//  3. Call RegisterAlert in init(). No other files need to change.
type Alert interface {
	Meta() AlertMeta
	// Check compares the current frame against the previous frame.
	// Returns a non-nil AlertEvent when the alert should fire, nil otherwise.
	Check(curr, prev *dto.TelemetryFrame, cfg map[string]any) *AlertEvent
}

// AlertMeta holds the alert type, display label, description, default overlay
// colour (a ColorRef string), and the per-instance config schema.
type AlertMeta struct {
	Type         AlertType          `json:"type"`
	Label        string             `json:"label"`
	Description  string             `json:"description"`
	DefaultColor string             `json:"defaultColor"` // ColorRef string e.g. "tc", "abs", "motor"
	ConfigDefs   []config.ConfigDef `json:"configDefs,omitempty"`
}

// AlertEvent is returned by Alert.Check when the alert fires.
type AlertEvent struct {
	Text  string // display text shown on the overlay (e.g. "TC  3")
	Color string // ColorRef string resolved by the painter at render time
}

// AlertInstance is a user-configured alert stored in DashLayout.Alerts.
type AlertInstance struct {
	ID     string         `json:"id"`
	Type   AlertType      `json:"type"`
	Config map[string]any `json:"config,omitempty"`
}

var alertRegistry = map[AlertType]Alert{}

// RegisterAlert registers an Alert implementation.
// The duration ConfigDef is automatically appended to the alert's ConfigDefs.
// Call from init() in alert_*.go files.
func RegisterAlert(a Alert) {
	m := a.Meta()
	m.ConfigDefs = append(m.ConfigDefs, alertDurationConfigDef())
	alertRegistry[m.Type] = a
}

// GetAlert returns the registered Alert for the given type, or (nil, false).
func GetAlert(t AlertType) (Alert, bool) {
	a, ok := alertRegistry[t]
	return a, ok
}

// AlertCatalog returns metadata for every registered alert type.
func AlertCatalog() []AlertMeta {
	out := make([]AlertMeta, 0, len(alertRegistry))
	for t := range alertRegistry {
		a := alertRegistry[t]
		m := a.Meta()
		m.ConfigDefs = append(m.ConfigDefs, alertDurationConfigDef())
		out = append(out, m)
	}
	return out
}

// ConfigFloat returns a float64 config value by key, falling back to defaultVal.
func ConfigFloat(cfg map[string]any, key string, defaultVal float64) float64 {
	if cfg == nil {
		return defaultVal
	}
	v, ok := cfg[key]
	if !ok {
		return defaultVal
	}
	switch n := v.(type) {
	case float64:
		return n
	case string:
		var f float64
		if _, err := fmt.Sscanf(n, "%f", &f); err == nil {
			return f
		}
	}
	return defaultVal
}

// ConfigString returns a string config value by key, falling back to defaultVal.
func ConfigString(cfg map[string]any, key, defaultVal string) string {
	if cfg == nil {
		return defaultVal
	}
	if v, ok := cfg[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return defaultVal
}

func alertDurationConfigDef() config.ConfigDef {
	return config.ConfigDef{
		Key:     "duration",
		Label:   "Duration (s)",
		Type:    "number",
		Default: "1.5",
	}
}
