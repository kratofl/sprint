//go:build windows

package hardware

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"

	"github.com/kratofl/sprint/app/internal/devices"
)

//go:embed winusb/vocore.inf
var voCoreINF []byte

//go:embed winusb/usbd480.inf
var usbd480INF []byte

var (
	modShell32           = syscall.NewLazyDLL("shell32.dll")
	modKernel32          = syscall.NewLazyDLL("kernel32.dll")
	procShellExecuteExW  = modShell32.NewProc("ShellExecuteExW")
	procWaitForSingleObj = modKernel32.NewProc("WaitForSingleObject")
	procGetExitCodeProc  = modKernel32.NewProc("GetExitCodeProcess")
	procCloseHandleK32   = modKernel32.NewProc("CloseHandle")
)

// shellExecuteInfo mirrors SHELLEXECUTEINFOW (relevant fields only).
type shellExecuteInfo struct {
	CbSize         uint32
	FMask          uint32
	Hwnd           uintptr
	LpVerb         *uint16
	LpFile         *uint16
	LpParameters   *uint16
	LpDirectory    *uint16
	NShow          int32
	HInstApp       uintptr
	LpIDList       uintptr
	LpClass        *uint16
	HkeyClass      uintptr
	DwHotKey       uint32
	HIconOrMonitor uintptr
	HProcess       uintptr
}

const (
	seeMaskNoCloseProcess = 0x00000040
	swHide                = 0
	waitInfinite          = 0xFFFFFFFF
)

// InstallWinUSBDriver installs the WinUSB driver binding for the given device
// type by writing a bundled INF file to a temporary directory and invoking
// pnputil /add-driver <inf> /install with UAC elevation.
//
// A UAC prompt will appear. Returns nil on success, an error if the user
// cancels or pnputil reports failure.
func InstallWinUSBDriver(driverType devices.DriverType) error {
	var infData []byte
	var infName string

	switch driverType {
	case devices.DriverVoCore:
		infData = voCoreINF
		infName = "sprint_vocore.inf"
	case devices.DriverUSBD480:
		infData = usbd480INF
		infName = "sprint_usbd480.inf"
	default:
		return fmt.Errorf("InstallWinUSBDriver: unknown driver type %q", driverType)
	}

	tmpDir, err := os.MkdirTemp("", "sprint-winusb-*")
	if err != nil {
		return fmt.Errorf("InstallWinUSBDriver: create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	infPath := filepath.Join(tmpDir, infName)
	if err := os.WriteFile(infPath, infData, 0644); err != nil {
		return fmt.Errorf("InstallWinUSBDriver: write INF: %w", err)
	}

	params := fmt.Sprintf(`/add-driver "%s" /install`, infPath)

	filePtr, err := syscall.UTF16PtrFromString("pnputil.exe")
	if err != nil {
		return fmt.Errorf("InstallWinUSBDriver: UTF16 file: %w", err)
	}
	paramsPtr, err := syscall.UTF16PtrFromString(params)
	if err != nil {
		return fmt.Errorf("InstallWinUSBDriver: UTF16 params: %w", err)
	}
	verbPtr, err := syscall.UTF16PtrFromString("runas")
	if err != nil {
		return fmt.Errorf("InstallWinUSBDriver: UTF16 verb: %w", err)
	}

	sei := shellExecuteInfo{
		FMask:        seeMaskNoCloseProcess,
		LpVerb:       verbPtr,
		LpFile:       filePtr,
		LpParameters: paramsPtr,
		NShow:        swHide,
	}
	sei.CbSize = uint32(unsafe.Sizeof(sei))

	r, _, callErr := procShellExecuteExW.Call(uintptr(unsafe.Pointer(&sei)))
	if r == 0 {
		return fmt.Errorf("InstallWinUSBDriver: ShellExecuteEx: %w", callErr)
	}
	if sei.HProcess == 0 {
		// UAC prompt was cancelled or ShellExecuteEx returned without a process handle.
		return fmt.Errorf("InstallWinUSBDriver: no process handle — UAC may have been cancelled")
	}

	// Wait for pnputil to complete.
	procWaitForSingleObj.Call(sei.HProcess, waitInfinite)

	var exitCode uint32
	procGetExitCodeProc.Call(sei.HProcess, uintptr(unsafe.Pointer(&exitCode)))
	procCloseHandleK32.Call(sei.HProcess)

	if exitCode != 0 {
		return fmt.Errorf("InstallWinUSBDriver: pnputil exited with code %d — driver installation may have failed", exitCode)
	}
	return nil
}
