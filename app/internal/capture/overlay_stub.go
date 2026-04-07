//go:build !windows

package capture

// SelectRegion is not supported on non-Windows platforms.
// Returns (0, 0, 0, 0, false) to signal that no region was selected.
func SelectRegion(aspectW, aspectH, initX, initY, initW, initH int) (x, y, w, h int, confirmed bool) {
	return 0, 0, 0, 0, false
}
