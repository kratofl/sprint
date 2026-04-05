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
	if err := input.SaveConfig(&cfg); err != nil {
		return err
	}
	a.coord.ReloadInputBindings()
	return nil
}

// CaptureNextButton waits for the first new wheel button press detected by the
// OS gamepad API and returns its 1-indexed button number. Returns an error if
// no button is pressed within the timeout or a capture is already in progress.
func (a *App) CaptureNextButton(timeoutSecs int) (int, error) {
	return a.coord.CaptureNextButton(a.ctx, timeoutSecs)
}
