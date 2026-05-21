//go:build windows

package shm

import (
	"errors"
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

// Open maps the named shared memory region for reading.
func (r *Reader) Open() error {
	namePtr, err := windows.UTF16PtrFromString(r.name)
	if err != nil {
		return fmt.Errorf("shm: UTF16PtrFromString %q: %w", r.name, err)
	}
	handle, err := openFileMapping(windows.FILE_MAP_READ, false, namePtr)
	if err != nil {
		if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) {
			return ErrNotFound
		}
		return fmt.Errorf("shm: OpenFileMapping %q: %w", r.name, err)
	}
	ptr, err := windows.MapViewOfFile(handle, windows.FILE_MAP_READ, 0, 0, uintptr(r.bufSize))
	if err != nil {
		_ = windows.CloseHandle(handle)
		return fmt.Errorf("shm: MapViewOfFile %q: %w", r.name, err)
	}
	r.handle = uintptr(handle)
	// Build the slice header via a struct pointer (unsafe.Pointer rule 1) rather
	// than converting the uintptr directly (which go vet flags as unsafe rule violation).
	type sliceHeader struct {
		data uintptr
		len  int
		cap  int
	}
	sh := sliceHeader{data: ptr, len: r.bufSize, cap: r.bufSize}
	r.view = *(*[]byte)(unsafe.Pointer(&sh))
	return nil
}

// Close unmaps the shared memory region and releases the handle.
func (r *Reader) Close() error {
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
		return fmt.Errorf("shm: close %q: %v", r.name, errs)
	}
	return nil
}
