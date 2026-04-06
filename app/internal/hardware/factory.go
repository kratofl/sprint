package hardware

import (
	"fmt"
	"log/slog"

	"github.com/kratofl/sprint/app/internal/devices"
)

// NewDriver creates the appropriate ScreenDriver for the given driver type.
// Returns an error for unrecognised driver types; callers may fall back to
// NewVoCoreDriver in that case.
func NewDriver(driverType devices.DriverType, logger *slog.Logger) (ScreenDriver, error) {
	switch driverType {
	case devices.DriverVoCore:
		return NewVoCoreDriver(logger), nil
	case devices.DriverUSBD480:
		return NewUSBD480Driver(logger), nil
	default:
		return nil, fmt.Errorf("hardware: unknown driver type: %q", driverType)
	}
}
