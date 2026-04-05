package widgets

import (
	"testing"
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

	t.Run("all widgets have draw function", func(t *testing.T) {
		for _, m := range catalog {
			if m.Fn == nil {
				t.Errorf("widget %q has nil draw function", m.Type)
			}
		}
	})
}
