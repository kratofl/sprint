//go:build windows

package input

import (
	"syscall"
	"unsafe"
)

var (
	winmm         = syscall.NewLazyDLL("winmm.dll")
	procJoyGetNum = winmm.NewProc("joyGetNumDevs")
	procJoyGetPos = winmm.NewProc("joyGetPosEx")
)

// joyInfoEx mirrors the Win32 JOYINFOEX structure.
// https://learn.microsoft.com/en-us/windows/win32/api/joystickapi/ns-joystickapi-joyinfoex
type joyInfoEx struct {
	dwSize         uint32
	dwFlags        uint32
	dwXpos         uint32
	dwYpos         uint32
	dwZpos         uint32
	dwRpos         uint32
	dwUpos         uint32
	dwVpos         uint32
	dwButtons      uint32
	dwButtonNumber uint32
	dwPOV          uint32
	dwReserved1    uint32
	dwReserved2    uint32
}

const joyReturnButtons = 0x00000080

// readButtonMask ORs the button bitmasks from all connected joystick slots.
// Bit N (0-based) corresponds to button N+1.
// Returns 0 if no joysticks are connected or winmm is unavailable.
func readButtonMask() uint32 {
	numDevs, _, _ := procJoyGetNum.Call()
	if numDevs == 0 {
		return 0
	}
	var mask uint32
	for i := uintptr(0); i < numDevs; i++ {
		info := joyInfoEx{
			dwSize:  uint32(unsafe.Sizeof(joyInfoEx{})),
			dwFlags: joyReturnButtons,
		}
		ret, _, _ := procJoyGetPos.Call(i, uintptr(unsafe.Pointer(&info)))
		if ret == 0 { // JOYERR_NOERROR
			mask |= info.dwButtons
		}
	}
	return mask
}
