//go:build linux

package shm

import (
	"errors"
	"fmt"
	"os"
	"syscall"
)

// Open maps the named shared memory region for reading.
// On Linux the region is exposed as a file under /dev/shm/.
func (r *Reader) Open() error {
	f, err := os.Open("/dev/shm/" + r.name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return fmt.Errorf("shm: open /dev/shm/%s: %w", r.name, err)
	}
	defer f.Close()

	data, err := syscall.Mmap(int(f.Fd()), 0, r.bufSize, syscall.PROT_READ, syscall.MAP_SHARED)
	if err != nil {
		return fmt.Errorf("shm: mmap %q: %w", r.name, err)
	}
	r.view = data
	return nil
}

// Close unmaps the shared memory region.
func (r *Reader) Close() error {
	if r.view == nil {
		return nil
	}
	if err := syscall.Munmap(r.view); err != nil {
		return fmt.Errorf("shm: munmap %q: %w", r.name, err)
	}
	r.view = nil
	return nil
}
