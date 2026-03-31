//go:build !(linux && cgo) && !windows

package devices

// scanScreensImpl is not supported on this platform. It returns an empty list.
// USB enumeration requires Linux with CGO (gousb) or Windows (WinUSB/SetupDI).
func scanScreensImpl() ([]DetectedScreen, error) {
	return nil, nil
}
