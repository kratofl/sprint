package widgets

import "testing"

func TestPanelBorderEnabled(t *testing.T) {
	on := true
	off := false

	cases := []struct {
		name  string
		panel PanelConfig
		style WidgetStyle
		want  bool
	}{
		{"metadata default border on, no override", PanelConfig{}, WidgetStyle{}, true},
		{"metadata default border off via NoBorder, no override", PanelConfig{NoBorder: true}, WidgetStyle{}, false},
		{"metadata panel disabled, no override", PanelConfig{Disabled: true}, WidgetStyle{}, false},
		{"override disables a default-on border", PanelConfig{}, WidgetStyle{Border: &off}, false},
		{"override enables a default-off border", PanelConfig{NoBorder: true}, WidgetStyle{Border: &on}, true},
		{"override enables a border even when metadata disables the panel", PanelConfig{Disabled: true}, WidgetStyle{Border: &on}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := PanelBorderEnabled(tc.panel, tc.style); got != tc.want {
				t.Fatalf("PanelBorderEnabled = %v, want %v", got, tc.want)
			}
		})
	}
}
