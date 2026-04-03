//go:build windows

package hardware

import (
	"fmt"
	"strings"
	"syscall"
	"unsafe"
)

// scanUSBD480Impl enumerates USB devices and returns those matching the USBD480
// VID/PID. Uses SetupDI (no CGO). Dimensions default to 480×272; the actual
// dimensions are queried via GET_DEVICE_DETAILS when the device is first opened.
func scanUSBD480Impl() ([]USBD480Screen, error) {
	vidHex := fmt.Sprintf("vid_%04x", usbd480VID)
	pidHex := fmt.Sprintf("pid_%04x", usbd480PID)

	r, _, err := procSetupDiGetClassDevsW.Call(
		uintptr(unsafe.Pointer(&guidUSBDeviceScan)),
		0, 0,
		uintptr(digcfPresent|digcfDeviceInterface),
	)
	if r == 0 || syscall.Handle(r) == syscall.InvalidHandle {
		return nil, fmt.Errorf("devices: SetupDiGetClassDevs (usbd480): %w", err)
	}
	hDevInfo := r
	defer procSetupDiDestroyDeviceInfoList.Call(hDevInfo)

	var ifData spDeviceInterfaceData
	ifData.CbSize = uint32(unsafe.Sizeof(ifData))

	seen := make(map[string]bool)
	var screens []USBD480Screen

	for i := uint32(0); ; i++ {
		r, _, _ := procSetupDiEnumDeviceInterfaces.Call(
			hDevInfo,
			0,
			uintptr(unsafe.Pointer(&guidUSBDeviceScan)),
			uintptr(i),
			uintptr(unsafe.Pointer(&ifData)),
		)
		if r == 0 {
			break
		}

		var requiredSize uint32
		procSetupDiGetDeviceInterfaceDetailW.Call(
			hDevInfo,
			uintptr(unsafe.Pointer(&ifData)),
			0, 0,
			uintptr(unsafe.Pointer(&requiredSize)),
			0,
		)
		if requiredSize == 0 {
			continue
		}

		buf := make([]byte, requiredSize)
		*(*uint32)(unsafe.Pointer(&buf[0])) = detailDataCbSize

		r, _, _ = procSetupDiGetDeviceInterfaceDetailW.Call(
			hDevInfo,
			uintptr(unsafe.Pointer(&ifData)),
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(requiredSize),
			0, 0,
		)
		if r == 0 {
			continue
		}

		pathBytes := buf[4:]
		pathUTF16 := make([]uint16, len(pathBytes)/2)
		for j := range pathUTF16 {
			pathUTF16[j] = *(*uint16)(unsafe.Pointer(&pathBytes[j*2]))
			if pathUTF16[j] == 0 {
				pathUTF16 = pathUTF16[:j]
				break
			}
		}
		path := strings.ToLower(syscall.UTF16ToString(pathUTF16))

		if !strings.Contains(path, vidHex) || !strings.Contains(path, pidHex) {
			continue
		}

		// Extract serial: Windows device paths are "\\?\usb#vid_...&pid_...#SERIAL#{GUID}".
		serial := extractSerialFromPath(path)
		key := fmt.Sprintf("%s-%s", pidHex, serial)
		if seen[key] {
			continue
		}
		seen[key] = true

		screens = append(screens, usbd480ScreenDefault(serial))
	}

	return screens, nil
}

// extractSerialFromPath parses the USB device path and returns the serial
// number segment (between the 2nd and 3rd '#'). Returns "" if absent or
// if it looks like the Windows placeholder "0000000000000000".
func extractSerialFromPath(path string) string {
	parts := strings.Split(path, "#")
	if len(parts) < 3 {
		return ""
	}
	s := parts[2]
	if s == "" || s == "0000000000000000" {
		return ""
	}
	return s
}
