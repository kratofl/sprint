//go:build darwin

package shm

import "errors"

// Open is a no-op stub on macOS. Shared memory telemetry adapters
// are only supported on Windows and Linux.
func (r *Reader) Open() error {
	return errors.New("shm: shared memory not supported on macOS")
}

// Close is a no-op stub on macOS.
func (r *Reader) Close() error {
	return nil
}
