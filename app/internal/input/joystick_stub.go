//go:build !windows

package input

// readInputMask returns 0 on non-Windows platforms where HID input capture
// is not yet implemented.
func readInputMask() uint64 {
	return 0
}
