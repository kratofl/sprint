//go:build !(linux && cgo) && !windows

package hardware

// scanScreensImpl is not supported on this platform. It returns an empty list.
// USB enumeration requires Linux with CGO (gousb) or Windows (WinUSB/SetupDI).
func scanScreensImpl() ([]VoCoreScreen, error) {
	return nil, nil
}
