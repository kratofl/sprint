//go:build !(linux && cgo) && !windows

package vocore

// scanScreensImpl is not supported on this platform. It returns an empty list.
// USB enumeration requires Linux with CGO (gousb) or Windows (WinUSB/SetupDI).
func scanScreensImpl() ([]DetectedVoCoreScreen, error) {
	return nil, nil
}
