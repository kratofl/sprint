//go:build linux && cgo

package vocore

import (
	"fmt"

	"github.com/google/gousb"
)

// scanScreensImpl returns all VoCore M-PRO screens currently connected via USB.
// Implements USB enumeration via gousb/libusb (Linux with CGO).
func scanScreensImpl() ([]DetectedVoCoreScreen, error) {
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

	var screens []DetectedVoCoreScreen
	seen := make(map[uint16]bool)
	for _, d := range devs {
		pid := uint16(d.Desc.Product)
		if seen[pid] {
			continue // deduplicate (same device opened twice is rare but possible)
		}
		seen[pid] = true

		serial, _ := d.SerialNumber()
		screen := voCoreScreenFromPID(pid, serial)
		screens = append(screens, screen)
	}

	if len(screens) == 0 && err != nil {
		return nil, fmt.Errorf("vocore: scan screens: %w", err)
	}
	return screens, nil
}
