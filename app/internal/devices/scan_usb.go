//go:build linux && cgo

package devices

import (
	"fmt"

	"github.com/google/gousb"
)

// scanScreensImpl returns all VoCore M-PRO screens currently connected via USB.
// Implements USB enumeration via gousb/libusb (Linux with CGO).
func scanScreensImpl() ([]DetectedScreen, error) {
	ctx := gousb.NewContext()
	defer ctx.Close()

	devs, err := ctx.OpenDevices(func(desc *gousb.DeviceDesc) bool {
		return desc.Vendor == gousb.ID(voCoreVID)
	})
	if err != nil {
		// gousb returns a partial list and a combined error if some devices
		// could not be opened (e.g. permission denied). We still return what
		// we could enumerate so the user sees the available screens.
		_ = err
	}
	defer func() {
		for _, d := range devs {
			d.Close()
		}
	}()

	var screens []DetectedScreen
	seen := make(map[uint16]bool)
	for _, d := range devs {
		pid := uint16(d.Desc.Product)
		if seen[pid] {
			continue // deduplicate (same device opened twice is rare but possible)
		}
		seen[pid] = true

		serial, _ := d.SerialNumber()
		screens = append(screens, screenFromPID(pid, serial))
	}

	if len(screens) == 0 && err != nil {
		return nil, fmt.Errorf("devices: scan screens: %w", err)
	}
	return screens, nil
}
