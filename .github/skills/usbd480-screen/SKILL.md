---
name: usbd480-screen
description: >
  Protocol reference and driver conventions for the USBD480 USB display
  (lcdinfo.com). Covers composite device layout (display + touchscreen HID),
  VID/PID, USB control transfer format, brightness control, frame send sequence,
  open/close behaviour, and Windows WinUSB driver notes. Use when implementing
  or debugging the USBD480 driver in app/internal/hardware/usbd480_usb.go.
---

# USBD480 Screen — Protocol Skill

## Device Identity

| Field | Value |
|---|---|
| Vendor | lcdinfo.com |
| VID | `0x16C0` |
| PID | `0x08A6` |
| USB type | **Composite device** — 2 interfaces |
| Pixel format | RGB565 (16 bpp) |

Known models: NX43 (480×272), WQ43 (480×272), and others at various resolutions.
The device reports its own width/height via `GET_DEVICE_DETAILS (0x80)` — always
query and use those, do not hardcode dimensions.

## Composite Device Layout

The USBD480 exposes two USB interfaces in a single configuration:

| Interface | Class | Purpose | Our driver |
|---|---|---|---|
| **0** | Vendor-specific (`0xFF`) | Display / framebuffer | ✅ WinUSB — `usbd480_usb.go` |
| **1** | HID (`0x03`) | Touchscreen (optional) | ❌ Not used — OS handles it natively |

**Interface 0** is the display interface. All framebuffer commands and bulk pixel
data go here. This is what WinUSB must be bound to.

**Interface 1** is the touchscreen HID interface (only present on touch-equipped
models). Windows enumerates it automatically via the built-in HID driver. It uses
Interrupt Endpoint 1 for touch reports. Our driver ignores this interface entirely.

### Touchscreen HID Interface

Endpoint: Interrupt IN EP1  
Report size: 16 bytes

```
[0:1]   X        — 12-bit x sample, LSB first
[2:3]   Y        — 12-bit y sample
[4:5]   Z1       — 12-bit z1 (pressure) sample
[6:7]   Z2       — 12-bit z2 (pressure) sample
[8]     pen      — 0 = pen down, 1 = pen up
[9]     pressure — firmware-calculated pressure value
[10:15] reserved
```

The touchscreen interface can be reconfigured via `SET_CONFIG_VALUE (0x82)`:
- Default: HID (OS-enumerated)
- Can be switched to vendor-specific (useful if a custom touchscreen driver is needed)

## Control Transfer Format

All vendor control messages go via Interface 0. The Linux `usbd480fb` driver (and Sprint) use `RECIP_DEVICE` — not `RECIP_INTERFACE` — because NX composite devices STALL interface-level vendor requests:

```
OUT: bmRequestType = USB_DIR_OUT | USB_TYPE_VENDOR | USB_RECIP_DEVICE = 0x40
IN:  bmRequestType = USB_DIR_IN  | USB_TYPE_VENDOR | USB_RECIP_DEVICE = 0xC0
```

In the WinUSB `WINUSB_SETUP_PACKET` (8 bytes):

```
[0] bmRequestType
[1] bRequest      ← command
[2] wValueL
[3] wValueH
[4] wIndexL
[5] wIndexH
[6] wLengthL
[7] wLengthH
```

## Command Reference

| Constant | bRequest | Dir | wValue | wIndex | wLength | Data | Purpose |
|---|---|---|---|---|---|---|---|
| `GET_DEVICE_DETAILS` | `0x80` | IN | 0 | 0 | 64 | 64-byte response | Query name + dimensions |
| `SET_BRIGHTNESS` | `0x81` | OUT | 0–255 | 0 | 0 | none | Set backlight level |
| `SET_CONFIG_VALUE` | `0x82` | OUT | param ID | value | 0 | none | Set a config parameter |
| `GET_CONFIG_VALUE` | `0x83` | IN | param ID | 0 | varies | response | Read a config parameter |
| `SAVE_CONFIGURATION` | `0x84` | OUT | `0x8877` | 0 | 0 | none | Persist config to NVM |
| `SET_ADDRESS` | `0xC0` | OUT | addr[15:0] | addr[31:16] | 0 | none | Set framebuffer write cursor |
| `SET_FRAME_START_ADDRESS` | `0xC4` | OUT | addr[15:0] | addr[31:16] | 0 | none | Flip display to frame at addr |
| `SET_TOUCH_MODE` | `0xE2` | OUT | mode | 0 | 0 | none | Set touchscreen operating mode |

Source: `usbd480fb.c` — https://github.com/hski/usbd480fb  
Source: WQ43 User Guide — https://www.lcdinfo.com/usbd480/documentation/USBD480-WQ43_User_Guide.pdf

### Config Parameters (for SET_CONFIG_VALUE / GET_CONFIG_VALUE)

| Parameter | Notes |
|---|---|
| `TOUCH_MODE` | 0 = touch disabled (default) |
| `TOUCH_DEBOUNCE_VALUE` | Samples required for state change |
| `BACKLIGHT_BRIGHTNESS` | 0–255; also writable via `SET_BRIGHTNESS (0x81)` |
| `TOUCH_PRESSURE_LIMIT_LO` | 0–255, default 30 |
| `TOUCH_PRESSURE_LIMIT_HI` | 0–255, default 120 |

## GET_DEVICE_DETAILS Response Layout

64 bytes returned:

```
[0:20]   device name (null-terminated ASCII, e.g. "NX43")
[20:22]  width  (little-endian uint16)
[22:24]  height (little-endian uint16)
[24:64]  reserved / firmware-specific
```

## Brightness Control

`SET_BRIGHTNESS (0x81)` is the **only** power/backlight control. There is no
hardware sleep/wake command (unlike VoCore's `0x29`).

- `wValue = 255` → full brightness (on)
- `wValue = 0`   → backlight off (screen appears off)

**SimHub "disable" = `SET_BRIGHTNESS(0)`.** The framebuffer controller stays
active. Always restore brightness on open.

## Frame Send Sequence

```
1. SET_ADDRESS(0)               → point write cursor at start of framebuffer
2. Bulk write to EP 0x02        → raw RGB565 pixel data (width × height × 2 bytes)
3. SET_FRAME_START_ADDRESS(0)   → flip: display now shows the frame just written
```

The device has an 8 MB framebuffer capable of holding 32 full frames. For simple
single-buffering, always use address 0 for both write and display.

Partial updates (sub-region) are supported via non-zero address offsets, but our
driver always sends a full frame.

### Stream Decoder (alternative bulk-only mode)

The WQ43 firmware also supports a **stream decoder**: all commands (including
`SET_ADDRESS` / `SET_FRAME_START_ADDRESS`) can be embedded as inline tokens in the
bulk data stream, avoiding the need for separate control transfers. Useful for
high-throughput scenarios. Our driver uses the control-transfer approach; switch to
stream decoder only if bulk-only performance becomes necessary.

## Open Sequence

```go
1. CreateFile(path, GENERIC_READ|GENERIC_WRITE,
              FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE, ...)
2. WinUsb_Initialize(devHandle) → winusbHandle
3. queryDeviceDetails()         → get actual width/height
4. setBrightness(255)           → restore backlight (SimHub may have left it at 0)
```

`FILE_SHARE_DELETE` is required on Windows 10/11: without it, the `CreateFile`
call fails with `ACCESS_DENIED` if another process (e.g. SimHub) recently held
the device.

## Close Sequence

```go
1. setBrightness(0)             → dim backlight (polite: matches SimHub disable behavior)
2. WinUsb_Free(winusbHandle)
3. CloseHandle(devHandle)
```

## No Sleep/Wake Protocol

Unlike VoCore, the USBD480 has **no** sleep/wake USB command. The `usbd480fb`
Linux driver TODO list even notes `suspend/resume?` as unimplemented.

- Do **not** look for a "display on" command — there isn't one.
- Brightness restore (`0x81 wValue=255`) is sufficient to make the screen visible.
- If the screen stays dark after opening, SimHub (or our own close) left brightness
  at 0 — the brightness restore in the open sequence is the fix.

## WinUSB Notes (Windows)

- Requires WinUSB driver bound to **Interface 0** of the composite device.
- **Zadig per-interface install (Interface 0 only)** is the correct approach for NX composite devices. The device path is enumerated under `GUID_DEVINTERFACE_WINUSB`. Sprint's scan searches that GUID first, so per-interface installs are detected correctly.
- **Zadig whole-device install** also works — the path is enumerated under `GUID_DEVINTERFACE_USB_DEVICE` and found on the fallback scan pass.
- Interface 1 (HID touchscreen) is claimed by the OS HID driver automatically and
  does not need WinUSB.
- The `controlOut` function encodes `addr` as `wValue = addr[15:0]`,
  `wIndex = addr[31:16]` — this matches the Linux driver's `usb_control_msg` call
  for `SET_ADDRESS` and `SET_FRAME_START_ADDRESS`.
- Brightness uses `wValue` directly (not encoded as address).
- **`bmRequestType`**: Sprint uses `0x40` (Vendor | RECIP_DEVICE) for OUT and `0xC0` for IN, matching the Linux `usbd480fb` driver. Using `RECIP_INTERFACE (0x41 / 0xC1)` causes USB STALL on NX composite devices with per-interface WinUSB → `ERROR_GEN_FAILURE`.

## Code Layout

```
app/internal/hardware/usbd480_usb.go          ← Windows WinUSB transport (build tag: windows)
app/internal/hardware/usbd480_scan_windows.go ← SetupDI device enumeration
app/internal/hardware/base_driver.go          ← shared render/send loop, retry, FPS throttle
app/internal/hardware/transport.go            ← screenTransport interface
```

Key functions:

| Function | Purpose |
|---|---|
| `openUSBD480Screen(vid, pid, w, h, logger)` | Open WinUSB, query details, restore brightness |
| `(s) send(rgb565 []byte)` | Full-frame render: SET_ADDR → bulk → SET_FRAME |
| `(s) close()` | Dim brightness, release WinUSB handles |
| `(s) setBrightness(level uint16)` | `controlOut(0x81, level, 0)` |
| `(s) controlOut(req, wValue, wIndex)` | Vendor OUT control transfer |
| `(s) queryDeviceDetails()` | GET_DEVICE_DETAILS → width, height, name |

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| Screen dark after SimHub disable | SimHub set brightness=0, we didn't restore it | `setBrightness(255)` in open sequence |
| Screen dark after our own close | We set brightness=0 (intended), but next open didn't restore | `setBrightness(255)` in open sequence |
| `ACCESS_DENIED` on CreateFile | Missing `FILE_SHARE_DELETE` on Windows 10/11 | Add `fileShareDelete` flag |
| All transfers fail with `ERROR_GEN_FAILURE` | `bmRequestType = 0x41` (RECIP_INTERFACE) causes USB STALL on NX composite device | Use `0x40` (RECIP_DEVICE) — matches Linux `usbd480fb` |
| Two devices in device list for one physical device | Scan finds both the composite parent (GUID_DEVINTERFACE_USB_DEVICE) and the Interface 0 path (GUID_DEVINTERFACE_WINUSB) | Scan `GUID_DEVINTERFACE_WINUSB` first, track found PIDs, skip those PIDs in `GUID_DEVINTERFACE_USB_DEVICE` pass |
| Wrong dimensions (480×272) in device list | Scan stores default; `GET_DEVICE_DETAILS` result is not propagated back to registry | `screen:connected` event carries native dims; coordinator intercepts and calls `updateDeviceDims` |
| Wrong dimensions | Hardcoded size doesn't match device | Always use `queryDeviceDetails()` result |
| Bulk write fails | WinUSB not bound to Interface 0 | Run Zadig, select WinUSB for Interface 0 |

