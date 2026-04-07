//go:build !windows

package hardware

import (
	"errors"

	"github.com/kratofl/sprint/app/internal/devices"
)

// InstallWinUSBDriver is a no-op on non-Windows platforms.
func InstallWinUSBDriver(_ devices.DriverType) error {
	return errors.New("WinUSB driver installation is only supported on Windows")
}
