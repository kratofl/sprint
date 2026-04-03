//go:build !windows

package hardware

// scanUSBD480Impl is not supported on this platform.
func scanUSBD480Impl() ([]USBD480Screen, error) {
	return nil, nil
}
