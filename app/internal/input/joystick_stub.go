//go:build !windows

package input

// readButtonMask returns 0 on non-Windows platforms where joystick capture
// is not yet implemented.
func readButtonMask() uint32 {
	return 0
}
