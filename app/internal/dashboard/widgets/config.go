package widgets

// ConfigDef describes one configurable parameter for a widget or alert instance.
type ConfigDef struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Type    string   `json:"type"` // "select", "number", "boolean", "text"
	Options []Option `json:"options,omitempty"`
	Default string   `json:"default"` // string representation of default value
}

// Option is one choice in a "select" ConfigDef.
type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}
