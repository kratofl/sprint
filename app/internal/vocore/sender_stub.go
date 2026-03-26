//go:build !(linux && cgo) && !windows

package vocore

import (
	"fmt"
	"log/slog"
)

func openScreenImpl(_, _ uint16, _, _ int, _ *slog.Logger) (frameSender, error) {
	return nil, fmt.Errorf("%w (requires Linux with CGO, or Windows with WinUSB)", errScreenTransportUnsupported)
}
