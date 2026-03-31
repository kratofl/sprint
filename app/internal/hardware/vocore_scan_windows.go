//go:build windows

package hardware

import (
"fmt"
"strings"
"syscall"
"unsafe"
)

// guidUSBDeviceScan is GUID_DEVINTERFACE_USB_DEVICE.
var guidUSBDeviceScan = winGUID{
Data1: 0xA5DCBF10,
Data2: 0x6530,
Data3: 0x11D2,
Data4: [8]byte{0x90, 0x1F, 0x00, 0xC0, 0x4F, 0xB9, 0x51, 0xED},
}

// scanScreensImpl enumerates all USB devices and returns those whose device path
// contains the VoCore VID (C872). Uses SetupDI (Windows, no CGO, no libusb).
func scanScreensImpl() ([]VoCoreScreen, error) {
vidHex := fmt.Sprintf("vid_%04x", voCoreVID)
r, _, err := procSetupDiGetClassDevsW.Call(
uintptr(unsafe.Pointer(&guidUSBDeviceScan)),
0, 0,
uintptr(digcfPresent|digcfDeviceInterface),
)
if r == 0 || syscall.Handle(r) == syscall.InvalidHandle {
return nil, fmt.Errorf("devices: SetupDiGetClassDevs: %w", err)
}
hDevInfo := r
defer procSetupDiDestroyDeviceInfoList.Call(hDevInfo)

var ifData spDeviceInterfaceData
ifData.CbSize = uint32(unsafe.Sizeof(ifData))

pidCounts := make(map[uint16]int)
var screens []VoCoreScreen
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

if !strings.Contains(path, vidHex) {
continue
}

// Extract PID from the device path (e.g. "vid_c872&pid_1004").
var pid uint16
fmt.Sscanf(path[strings.Index(path, "pid_")+4:], "%04x", &pid)

// Deduplicate by PID (multiple interfaces for the same device).
pidCounts[pid]++
if pidCounts[pid] > 1 {
continue
}

screens = append(screens, screenFromPID(pid, ""))
}

return screens, nil
}