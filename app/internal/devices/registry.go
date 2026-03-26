// Package devices maintains the registry of supported steering wheel models
// and manages the user's configured device list.
package devices

// WheelModel describes a supported steering wheel with a VoCore screen.
type WheelModel struct {
	// ID is the canonical slug used in DeviceConfig.ModelID.
	ID string
	// Name is the human-readable product name.
	Name string
	// Manufacturer is the wheel manufacturer's display name.
	Manufacturer string

	// USBVID / USBPID identify the USB serial interface of the wheel
	// (typically the LED controller). Used by the port enumerator to
	// auto-detect connected devices. Both zero means detection is not
	// supported and the user must pick a port manually.
	USBVID uint16
	USBPID uint16

	// ScreenVID / ScreenPID identify the VoCore display's USB interface.
	// The renderer locates the screen's serial port by matching these IDs
	// and sends length-prefixed PNG frames over CDC-ACM serial.
	ScreenVID uint16
	ScreenPID uint16

	// ScreenWidth / ScreenHeight are the native display resolution in pixels.
	ScreenWidth  int
	ScreenHeight int

	// DefaultBaud is the baud rate for the serial interface (where applicable).
	DefaultBaud int
}

// KnownModels is the static registry of all supported wheel models.
// To add a new model, append an entry here.
//
// VID/PID values can be confirmed on Linux with `lsusb` or on Windows via
// Device Manager → device Properties → Details → Hardware IDs.
var KnownModels = []WheelModel{
	{
		ID:           "bavarian_omega_v2_pro",
		Name:         "OmegaPRO v2",
		Manufacturer: "BavarianSimTec",
		// Serial interface (LED controller) — appears as /dev/cu.usbmodemXXX
		// on macOS, /dev/ttyACMx on Linux, COMx on Windows.
		USBVID: 0x16D0,
		USBPID: 0x127B,
		// VoCore M-PRO Screen — presents as CDC-ACM serial on Windows/Linux.
		ScreenVID:    0xC872,
		ScreenPID:    0x1004,
		ScreenWidth:  480,
		ScreenHeight: 272,
		DefaultBaud:  115200,
	},
}

// FindModel returns the WheelModel with the given ID, or nil if not found.
func FindModel(id string) *WheelModel {
	for i := range KnownModels {
		if KnownModels[i].ID == id {
			return &KnownModels[i]
		}
	}
	return nil
}

// MatchPort returns the WheelModel whose USBVID/USBPID matches the given
// identifiers, or nil if no model matches. Used by the port enumerator to
// annotate detected serial ports with the wheel model they belong to.
func MatchPort(vid, pid uint16) *WheelModel {
	for i := range KnownModels {
		if KnownModels[i].USBVID == vid && KnownModels[i].USBPID == pid {
			return &KnownModels[i]
		}
	}
	return nil
}
