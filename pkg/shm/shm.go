// Package shm provides a cross-platform read-only shared memory reader.
// Platform-specific Open/Close implementations live in shm_windows.go and
// shm_linux.go. Instantiate with New, then call Open before reading.
package shm

import "errors"

// ErrNotFound is returned by Open when the named shared memory region does not
// exist — typically because the game is not running.
var ErrNotFound = errors.New("shm: region not found")

// Reader wraps a memory-mapped view of a named shared memory region.
type Reader struct {
	name    string
	handle  uintptr // platform handle (Windows: HANDLE; unused on Linux)
	view    []byte  // slice over the mapped memory
	bufSize int
}

// New returns a Reader for the named region of the given size.
// Call Open before reading.
func New(name string, size int) *Reader {
	return &Reader{name: name, bufSize: size}
}

// IsOpen reports whether the shared memory is currently mapped.
func (r *Reader) IsOpen() bool {
	return r.view != nil
}

// CopyBuffer copies the current shared memory contents into dst.
// dst must be at least bufSize bytes.
func (r *Reader) CopyBuffer(dst []byte) {
	copy(dst, r.view)
}
