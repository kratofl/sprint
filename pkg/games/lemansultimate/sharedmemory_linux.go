//go:build linux

package lemansultimate

import (
	"fmt"
	"os"
	"syscall"
)

func (r *shmReader) open() error {
	f, err := os.Open("/dev/shm/" + lmuShmName)
	if err != nil {
		return fmt.Errorf("lemansultimate: open /dev/shm/%s: LMU is probably not running: %w", lmuShmName, err)
	}
	defer f.Close()

	data, err := syscall.Mmap(int(f.Fd()), 0, r.bufSize, syscall.PROT_READ, syscall.MAP_SHARED)
	if err != nil {
		return fmt.Errorf("lemansultimate: mmap: %w", err)
	}
	r.view = data
	return nil
}

func (r *shmReader) close() error {
	if r.view == nil {
		return nil
	}
	if err := syscall.Munmap(r.view); err != nil {
		return fmt.Errorf("lemansultimate: munmap: %w", err)
	}
	r.view = nil
	return nil
}
