package lemansultimate

// shmReader wraps a memory-mapped view of the LMU shared memory region.
// Platform-specific open/close implementations live in sharedmemory_windows.go
// and sharedmemory_linux.go.
type shmReader struct {
	handle  uintptr // platform handle (Windows: HANDLE; Linux: file descriptor)
	view    []byte  // slice over the mapped memory
	bufSize int
}

func newShmReader(size int) *shmReader {
	return &shmReader{bufSize: size}
}

// copyBuffer copies the current shared memory contents into dst.
// dst must be at least len(r.view) bytes.
func (r *shmReader) copyBuffer(dst []byte) {
	copy(dst, r.view)
}

// isOpen reports whether the shared memory is currently mapped.
func (r *shmReader) isOpen() bool {
	return r.view != nil
}
