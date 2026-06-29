package alerts

import (
	"slices"
	"testing"
)

func TestEnabledTypesSortedIsDeterministic(t *testing.T) {
	// The painter evaluates alerts in EnabledTypesSorted order, so the priority of
	// simultaneous triggers must not depend on stored/insertion order (PRD #39).
	a := AlertConfig{EnabledTypes: []AlertType{"tc_change", "abs_change", "engine_map"}}
	b := AlertConfig{EnabledTypes: []AlertType{"engine_map", "tc_change", "abs_change"}}

	if !slices.Equal(a.EnabledTypesSorted(), b.EnabledTypesSorted()) {
		t.Fatalf("priority order is not deterministic: %v vs %v", a.EnabledTypesSorted(), b.EnabledTypesSorted())
	}
}

func TestMigrateAlertConfigFoldsLegacyInstances(t *testing.T) {
	legacy := []AlertInstance{
		{ID: "1", Type: "tc", Config: map[string]any{"duration": "2.5"}},
		{ID: "2", Type: "abs", Config: map[string]any{"duration": "1.0"}},
		{ID: "3", Type: "tc"}, // duplicate type collapses
	}

	cfg := MigrateAlertConfig(legacy, AlertConfig{})

	if len(cfg.EnabledTypes) != 2 {
		t.Fatalf("expected 2 enabled types (deduped), got %d: %v", len(cfg.EnabledTypes), cfg.EnabledTypes)
	}
	if !cfg.HasType("tc") || !cfg.HasType("abs") {
		t.Fatalf("expected tc and abs enabled, got %v", cfg.EnabledTypes)
	}
	// Per-instance durations collapse into one safe shared duration (the longest
	// meaningful value), so no alert is cut shorter than it was configured.
	if cfg.Duration != 2.5 {
		t.Fatalf("expected shared duration 2.5 (max meaningful), got %v", cfg.Duration)
	}
	// Defaults are filled.
	if cfg.DisplayMode != AlertDisplayFull {
		t.Fatalf("expected default display mode %q, got %q", AlertDisplayFull, cfg.DisplayMode)
	}
	if cfg.ColorMode != AlertColorNormal {
		t.Fatalf("expected default color mode %q, got %q", AlertColorNormal, cfg.ColorMode)
	}
}

func TestMigrateAlertConfigUsesDefaultDurationWhenNoneMeaningful(t *testing.T) {
	legacy := []AlertInstance{{ID: "1", Type: "tc"}}

	cfg := MigrateAlertConfig(legacy, AlertConfig{})

	if cfg.Duration != DefaultAlertDuration {
		t.Fatalf("expected default duration %v, got %v", DefaultAlertDuration, cfg.Duration)
	}
}

func TestMigrateAlertConfigIsIdempotent(t *testing.T) {
	existing := AlertConfig{
		DisplayMode:  AlertDisplayMiddle,
		ColorMode:    AlertColorInverted,
		Duration:     3,
		EnabledTypes: []AlertType{"tc"},
	}
	// Legacy data must be ignored once the shared config is already populated.
	cfg := MigrateAlertConfig([]AlertInstance{{ID: "x", Type: "abs"}}, existing)

	if cfg.DisplayMode != AlertDisplayMiddle || cfg.ColorMode != AlertColorInverted || cfg.Duration != 3 {
		t.Fatalf("expected existing config preserved, got %+v", cfg)
	}
	if len(cfg.EnabledTypes) != 1 || cfg.EnabledTypes[0] != "tc" {
		t.Fatalf("expected existing enabled types preserved, got %v", cfg.EnabledTypes)
	}
}
