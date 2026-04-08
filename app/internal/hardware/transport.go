package hardware

import "errors"

// screenTransport is the low-level protocol for pushing RGB565 frames to a USB screen.
// Concrete implementations: winusbSender (vocore_usb.go), usbd480Sender (usbd480_usb.go).
type screenTransport interface {
	send(rgb565 []byte) error
	close()
	// nativeSize returns the screen's actual native pixel dimensions as
	// reported by the device. These may differ from the configured
	// ScreenConfig (e.g. 480×800 portrait vs 800×480 landscape).
	nativeSize() (width, height int)
}

// errScreenTransportUnsupported indicates that no platform transport is
// implemented for this screen type on the current platform.
var errScreenTransportUnsupported = errors.New("screen transport unsupported on this platform")

// ErrDriverNotInstalled is returned when the WinUSB kernel driver is not bound
// to the device. This is distinct from "device not found": the USB device is
// visible to Windows but winusb.sys is not its function driver.
// Fix: run InstallWinUSBDriver, or use Zadig / Ref's screen setup tool.
var ErrDriverNotInstalled = errors.New("WinUSB driver not installed for this device")
