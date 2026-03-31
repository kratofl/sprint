package main

import (
	"github.com/kratofl/sprint/app/internal/commands"
	"github.com/kratofl/sprint/app/internal/input"
)

// GetCommandCatalog returns metadata for all registered commands.
// Used by the controls binding UI to populate the command picker.
func (a *App) GetCommandCatalog() []commands.CommandMeta {
	return commands.Catalog()
}

// GetBindings returns the current button→command bindings from disk.
func (a *App) GetBindings() (*input.Config, error) {
	return input.LoadConfig()
}

// SaveBindings persists the given button→command bindings to disk.
func (a *App) SaveBindings(cfg input.Config) error {
	return input.SaveConfig(&cfg)
}
