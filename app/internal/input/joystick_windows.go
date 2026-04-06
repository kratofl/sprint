//go:build windows

package input

import (
"runtime"
"sync"
"syscall"
"unsafe"
)

var (
user32 = syscall.NewLazyDLL("user32.dll")
hid    = syscall.NewLazyDLL("hid.dll")

procRegisterRawInputDevices = user32.NewProc("RegisterRawInputDevices")
procGetRawInputData         = user32.NewProc("GetRawInputData")
procGetRawInputDeviceInfoW  = user32.NewProc("GetRawInputDeviceInfoW")
procCreateWindowExW         = user32.NewProc("CreateWindowExW")
procDestroyWindow           = user32.NewProc("DestroyWindow")
procGetMessageW             = user32.NewProc("GetMessageW")
procDispatchMessageW        = user32.NewProc("DispatchMessageW")

procHidPMaxUsageListLength = hid.NewProc("HidP_MaxUsageListLength")
procHidPGetUsages          = hid.NewProc("HidP_GetUsages")
procHidPGetCaps            = hid.NewProc("HidP_GetCaps")
procHidPGetValueCaps       = hid.NewProc("HidP_GetValueCaps")
procHidPGetUsageValue      = hid.NewProc("HidP_GetUsageValue")
)

const (
hwndMessage       = ^uintptr(2)   // HWND_MESSAGE = ((HWND)-3)
wmInput           = 0x00FF
ridInput          = 0x10000003    // RID_INPUT
ridevInputSink    = 0x00000100    // RIDEV_INPUTSINK
ridevPageOnly     = 0x00000020    // RIDEV_PAGEONLY
rimTypeHID        = 2             // RIM_TYPEHID
ridiPreparsedData = 0x20000005    // RIDI_PREPARSEDDATA
hidpInput         = 0             // HidP_Input
usagePageButton   = 0x09          // HID_USAGE_PAGE_BUTTON
hidpStatusSuccess = uintptr(0x00110000)

// axisVirtualBase is the first virtual button number for relative-axis
// encoder ticks. Physical buttons use their HID usage numbers (1-65535).
axisVirtualBase = 4096
)

// riDevice mirrors Win32 RAWINPUTDEVICE.
type riDevice struct {
usUsagePage uint16
usUsage     uint16
dwFlags     uint32
hwndTarget  uintptr
}

// riHeader mirrors Win32 RAWINPUTHEADER (24 bytes on 64-bit Windows).
type riHeader struct {
dwType  uint32
dwSize  uint32
hDevice uintptr
wParam  uintptr
}

// winMsg mirrors Win32 MSG (48 bytes on 64-bit Windows).
type winMsg struct {
hwnd    uintptr
message uint32
_pad    uint32
wParam  uintptr
lParam  uintptr
time    uint32
ptX     int32
ptY     int32
private uint32
}

// hidpValueCap is an opaque layout for Win32 HIDP_VALUE_CAPS (72 bytes).
type hidpValueCap [72]byte

func (c hidpValueCap) usagePage() uint16      { return *(*uint16)(unsafe.Pointer(&c[0])) }
func (c hidpValueCap) linkCollection() uint16 { return *(*uint16)(unsafe.Pointer(&c[6])) }
func (c hidpValueCap) isAbsolute() bool       { return c[15] != 0 }
func (c hidpValueCap) usage() uint16          { return *(*uint16)(unsafe.Pointer(&c[56])) }

var (
riMu       sync.Mutex
riButtons  = map[uintptr]map[uint16]bool{}    // hDevice -> currently-pressed button usage IDs
riParsed   = map[uintptr][]byte{}              // hDevice -> preparsed HID data
riValCaps  = map[uintptr][]hidpValueCap{}      // hDevice -> relative value caps
riAxisPrev = map[uintptr]map[uint16]uint32{}   // hDevice -> HID usage -> last axis value
riVIDPID   = map[uintptr][2]uint16{}           // hDevice -> [VID, PID]
)

func init() {
go runRawInputLoop()
}

func runRawInputLoop() {
runtime.LockOSThread()
defer runtime.UnlockOSThread()

className, _ := syscall.UTF16PtrFromString("STATIC")
hwnd, _, _ := procCreateWindowExW.Call(
0,
uintptr(unsafe.Pointer(className)),
0, 0, 0, 0, 0, 0,
hwndMessage, 0, 0, 0,
)
if hwnd == 0 {
return
}
defer procDestroyWindow.Call(hwnd)

// RIDEV_PAGEONLY with usUsage=0 captures ALL devices on Generic Desktop
// page (0x01): joystick, gamepad, steering wheel, button boxes, etc.
rid := riDevice{
usUsagePage: 0x01,
usUsage:     0x00,
dwFlags:     ridevInputSink | ridevPageOnly,
hwndTarget:  hwnd,
}
procRegisterRawInputDevices.Call(
uintptr(unsafe.Pointer(&rid)),
1,
uintptr(unsafe.Sizeof(rid)),
)

var m winMsg
for {
ret, _, _ := procGetMessageW.Call(
uintptr(unsafe.Pointer(&m)),
hwnd, 0, 0,
)
if ret == 0 || ret == ^uintptr(0) {
return
}
if m.message == wmInput {
handleRawInput(m.lParam)
}
procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
}
}

func handleRawInput(lParam uintptr) {
var size uint32
procGetRawInputData.Call(lParam, ridInput, 0, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Sizeof(riHeader{})))
if size == 0 {
return
}

buf := make([]byte, size)
ret, _, _ := procGetRawInputData.Call(lParam, ridInput, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Sizeof(riHeader{})))
if ret == ^uintptr(0) {
return
}

hdr := (*riHeader)(unsafe.Pointer(&buf[0]))
if hdr.dwType != rimTypeHID {
return
}

off := int(unsafe.Sizeof(riHeader{})) // 24 on 64-bit
if len(buf) < off+8 {
return
}
dwSizeHid := *(*uint32)(unsafe.Pointer(&buf[off]))
dwCount := *(*uint32)(unsafe.Pointer(&buf[off+4]))

if dwSizeHid == 0 || dwCount == 0 {
// All buttons released.
riMu.Lock()
riButtons[hdr.hDevice] = map[uint16]bool{}
riMu.Unlock()
return
}

reportEnd := off + 8 + int(dwSizeHid)
if reportEnd > len(buf) {
return
}
report := buf[off+8 : reportEnd]

preparsed := getOrFetchPreparsed(hdr.hDevice)
if len(preparsed) == 0 {
return
}

// Collect the full set of currently-pressed button usage IDs (no upper cap).
maxUsages, _, _ := procHidPMaxUsageListLength.Call(
uintptr(hidpInput),
uintptr(usagePageButton),
uintptr(unsafe.Pointer(&preparsed[0])),
)
pressed := map[uint16]bool{}
if maxUsages > 0 {
usages := make([]uint16, maxUsages)
usageLen := uint32(maxUsages)
status, _, _ := procHidPGetUsages.Call(
uintptr(hidpInput),
uintptr(usagePageButton),
0,
uintptr(unsafe.Pointer(&usages[0])),
uintptr(unsafe.Pointer(&usageLen)),
uintptr(unsafe.Pointer(&preparsed[0])),
uintptr(unsafe.Pointer(&report[0])),
uintptr(len(report)),
)
if status == hidpStatusSuccess {
for i := uint32(0); i < usageLen; i++ {
if usages[i] > 0 {
pressed[usages[i]] = true
}
}
}
}

// Detect 0->1 transitions and emit to inputEventCh.
riMu.Lock()
prev := riButtons[hdr.hDevice]
riButtons[hdr.hDevice] = pressed
riMu.Unlock()

vid, pid := getOrFetchVIDPID(hdr.hDevice)
for btn := range pressed {
if !prev[btn] {
select {
case inputEventCh <- ButtonEvent{VID: vid, PID: pid, Button: int(btn)}:
default:
}
}
}

// Relative-axis encoder detection.
if caps := getOrFetchValueCaps(hdr.hDevice, preparsed); len(caps) > 0 {
handleAxisInput(hdr.hDevice, caps, report, preparsed)
}
}

// handleAxisInput reads relative HID axis values and emits virtual button
// numbers on inputEventCh when a value changes direction.
func handleAxisInput(hDevice uintptr, caps []hidpValueCap, report, preparsed []byte) {
type reading struct {
usage uint16
value uint32
idx   int
}
readings := make([]reading, 0, len(caps))
for i, c := range caps {
var value uint32
status, _, _ := procHidPGetUsageValue.Call(
uintptr(hidpInput),
uintptr(c.usagePage()),
uintptr(c.linkCollection()),
uintptr(c.usage()),
uintptr(unsafe.Pointer(&value)),
uintptr(unsafe.Pointer(&preparsed[0])),
uintptr(unsafe.Pointer(&report[0])),
uintptr(len(report)),
)
if status == hidpStatusSuccess {
readings = append(readings, reading{c.usage(), value, i})
}
}

riMu.Lock()
defer riMu.Unlock()
if riAxisPrev[hDevice] == nil {
riAxisPrev[hDevice] = map[uint16]uint32{}
}
pair := riVIDPID[hDevice]
vid, pid := pair[0], pair[1]
for _, r := range readings {
prev := riAxisPrev[hDevice][r.usage]
riAxisPrev[hDevice][r.usage] = r.value
if r.value == prev {
continue
}
virtualBtn := axisVirtualBase + r.idx*2
if int32(r.value)-int32(prev) < 0 {
virtualBtn++
}
select {
case inputEventCh <- ButtonEvent{VID: vid, PID: pid, Button: virtualBtn}:
default:
}
}
}

func getOrFetchPreparsed(hDevice uintptr) []byte {
riMu.Lock()
cached := riParsed[hDevice]
riMu.Unlock()
if cached != nil {
return cached
}

var size uint32
procGetRawInputDeviceInfoW.Call(hDevice, ridiPreparsedData, 0, uintptr(unsafe.Pointer(&size)))
if size == 0 {
return nil
}

buf := make([]byte, size)
ret, _, _ := procGetRawInputDeviceInfoW.Call(hDevice, ridiPreparsedData, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
if ret == ^uintptr(0) {
return nil
}

riMu.Lock()
riParsed[hDevice] = buf
riMu.Unlock()
return buf
}

// getOrFetchValueCaps returns relative input value caps for the device, cached.
// NumberInputValueCaps is at byte offset 52 in HIDP_CAPS.
func getOrFetchValueCaps(hDevice uintptr, preparsed []byte) []hidpValueCap {
riMu.Lock()
cached, ok := riValCaps[hDevice]
riMu.Unlock()
if ok {
return cached
}

var capsBuf [128]byte
procHidPGetCaps.Call(
uintptr(unsafe.Pointer(&preparsed[0])),
uintptr(unsafe.Pointer(&capsBuf[0])),
)
numVC := *(*uint16)(unsafe.Pointer(&capsBuf[52]))

var relative []hidpValueCap
if numVC > 0 {
vcBuf := make([]hidpValueCap, numVC)
count := numVC
procHidPGetValueCaps.Call(
uintptr(hidpInput),
uintptr(unsafe.Pointer(&vcBuf[0])),
uintptr(unsafe.Pointer(&count)),
uintptr(unsafe.Pointer(&preparsed[0])),
)
for i := uint16(0); i < count; i++ {
if !vcBuf[i].isAbsolute() {
relative = append(relative, vcBuf[i])
}
}
}

riMu.Lock()
riValCaps[hDevice] = relative
riMu.Unlock()
return relative
}

// getOrFetchVIDPID returns the USB VID and PID for the given device handle,
// querying the OS once and caching the result. Returns 0,0 on failure.
func getOrFetchVIDPID(hDevice uintptr) (vid, pid uint16) {
riMu.Lock()
if pair, ok := riVIDPID[hDevice]; ok {
riMu.Unlock()
return pair[0], pair[1]
}
riMu.Unlock()

// RID_DEVICE_INFO layout (64-bit): cbSize(4) + dwType(4) + union(16) = 24 bytes.
// For RIM_TYPEHID the union is RID_DEVICE_INFO_HID:
//   dwVendorId(4) + dwProductId(4) + dwVersionNumber(4) + usUsagePage(2) + usUsage(2)
const ridiDeviceInfo = 0x2000000B
var info [24]byte
size := uint32(len(info))
*(*uint32)(unsafe.Pointer(&info[0])) = size // cbSize must be set before call
ret, _, _ := procGetRawInputDeviceInfoW.Call(hDevice, ridiDeviceInfo, uintptr(unsafe.Pointer(&info[0])), uintptr(unsafe.Pointer(&size)))
if ret == ^uintptr(0) {
return 0, 0
}
// dwType is at offset 4; for RIM_TYPEHID (2), VID is at offset 8 and PID at offset 12.
dwType := *(*uint32)(unsafe.Pointer(&info[4]))
if dwType != rimTypeHID {
return 0, 0
}
vid = uint16(*(*uint32)(unsafe.Pointer(&info[8])))
pid = uint16(*(*uint32)(unsafe.Pointer(&info[12])))

riMu.Lock()
riVIDPID[hDevice] = [2]uint16{vid, pid}
riMu.Unlock()
return vid, pid
}
