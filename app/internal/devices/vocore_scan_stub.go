//go:build !(linux && cgo) && !windows

package devices

// ScanVoCoreScreens is not supported on this platform. It returns an empty list.
// USB enumeration requires Linux with CGO (gousb) or Windows (WinUSB/SetupDI).
func ScanVoCoreScreens() ([]DetectedVoCoreScreen, error) {
	return nil, nil
}
