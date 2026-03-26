//go:build !(linux || windows)

package vocore

import (
	"errors"
	"log/slog"
)

func openScreenImpl(_, _ uint16, _, _ int, _ *slog.Logger) (frameSender, error) {
	return nil, errors.New("VoCore USB screen not supported on this platform (Windows/Linux only)")
}
