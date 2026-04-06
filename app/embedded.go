package main

import "embed"

// PresetsFS contains the shipped default configurations.
// Embedded here (package main) because //go:embed cannot use ".." paths,
// and presets/ lives at the module root alongside main.go.
//
// Sub-trees are distributed to the packages that use them in Startup()
// via devices.InitPresets and dashboard.InitPresets.
//
//go:embed presets
var PresetsFS embed.FS
