//go:build windows

package lemansultimate

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modkernel32          = windows.NewLazySystemDLL("kernel32.dll")
	procOpenFileMappingW = modkernel32.NewProc("OpenFileMappingW")
)

// openFileMapping wraps the OpenFileMappingW Win32 API, which is not yet
// exported by golang.org/x/sys/windows at the version in use.
func openFileMapping(access uint32, inherit bool, name *uint16) (windows.Handle, error) {
	inheritVal := uintptr(0)
	if inherit {
		inheritVal = 1
	}
	r, _, e := procOpenFileMappingW.Call(uintptr(access), inheritVal, uintptr(unsafe.Pointer(name)))
	if r == 0 {
		if e != syscall.Errno(0) {
			return 0, e
		}
		return 0, syscall.EINVAL
	}
	return windows.Handle(r), nil
}

func (r *shmReader) open() error {
	name, err := windows.UTF16PtrFromString(lmuShmName)
	if err != nil {
		return fmt.Errorf("lemansultimate: UTF16PtrFromString: %w", err)
	}
	handle, err := openFileMapping(windows.FILE_MAP_READ, false, name)
	if err != nil {
		return fmt.Errorf("lemansultimate: OpenFileMapping %q: LMU is probably not running: %w", lmuShmName, err)
	}
	ptr, err := windows.MapViewOfFile(handle, windows.FILE_MAP_READ, 0, 0, uintptr(r.bufSize))
	if err != nil {
		_ = windows.CloseHandle(handle)
		return fmt.Errorf("lemansultimate: MapViewOfFile: %w", err)
	}
	r.handle = uintptr(handle)
	r.view = unsafe.Slice((*byte)(unsafe.Pointer(ptr)), r.bufSize)
	return nil
}

func (r *shmReader) close() error {
	var errs []error
	if r.view != nil {
		if err := windows.UnmapViewOfFile(uintptr(unsafe.Pointer(&r.view[0]))); err != nil {
			errs = append(errs, fmt.Errorf("UnmapViewOfFile: %w", err))
		}
		r.view = nil
	}
	if r.handle != 0 {
		if err := windows.CloseHandle(windows.Handle(r.handle)); err != nil {
			errs = append(errs, fmt.Errorf("CloseHandle: %w", err))
		}
		r.handle = 0
	}
	if len(errs) > 0 {
		return fmt.Errorf("lemansultimate: close shm: %v", errs)
	}
	return nil
}
