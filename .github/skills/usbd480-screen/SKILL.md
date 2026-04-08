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
| PID | `0x08A7` |
| USB type | **Composite device** — 2 interfaces |
| Pixel format | RGB565 (16 bpp) |

Known models: NX43 (800×480), NX50 (800×480), and others at various resolutions.
The device reports its own width/height via `GET_DEVICE_DETAILS (0x80)` — always
query and use those, do not hardcode dimensions.

## Composite Device Layout

The USBD480 exposes two USB interfaces in a single configuration:

| Interface | Class | Purpose | Our driver |
|---|---|---|---|
| **0** | Vendor-specific (`0xFF`) | Display / framebuffer | ✅ WinUSB — `usbd480_usb.go` |
| **1** | HID (`0x03`) | Touchscreen (optional) | ❌ Not used — inactive when WinUSB is on parent device |

**WinUSB is installed on the whole composite device** (parent entry in Zadig / `USB\VID_16C0&PID_08A7`).
This replaces `usbccgp.sys` with WinUSB as the function driver for the whole device. All framebuffer
commands and bulk pixel data are sent to Interface 0. Interface 1 (HID touchscreen) is inaccessible
while WinUSB is active — this is acceptable because our driver does not use the touchscreen.

> **Why whole-device and not per-interface?** Windows does not route OUT vendor control transfers
> through `usbccgp` to per-interface WinUSB drivers. Installing per-interface (selecting "Interface 0"
> in Zadig) causes all OUT control transfers (`SET_ADDRESS`, `SET_BRIGHTNESS`, etc.) to fail with
> `ERROR_GEN_FAILURE`, while IN transfers still work. Whole-device install is the correct approach.

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

All vendor control messages for the **NX series** (PID 0x08A7) use `RECIP_DEVICE`:

```
OUT: bmRequestType = USB_DIR_OUT | USB_TYPE_VENDOR | USB_RECIP_DEVICE = 0x00 | 0x40 | 0x00 = 0x40
IN:  bmRequestType = USB_DIR_IN  | USB_TYPE_VENDOR | USB_RECIP_DEVICE = 0x80 | 0x40 | 0x00 = 0xC0
```

> **WQ43 vs NX difference**: The old WQ43 (PID 0x08A6) driver used `RECIP_INTERFACE`
> (0x41/0xC1). The NX firmware uses `RECIP_DEVICE` (0x40/0xC0). Sending RECIP_INTERFACE
> requests to the NX causes it to STALL the endpoint → `ERROR_GEN_FAILURE` on all transfers.

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
Source: NX43 User Guide — https://www.lcdinfo.com/usbd480/documentation/USBD480-NX43_User_Guide.pdf  
Source: WQ43 User Guide — https://www.lcdinfo.com/usbd480/documentation/USBD480-WQ43_User_Guide.pdf (protocol reference, same commands on NX)

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

**Ref "disable" = `SET_BRIGHTNESS(0)`.** The framebuffer controller stays
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

The NX firmware also supports a **stream decoder**: all commands (including
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
4. setBrightness(255)           → restore backlight (Ref may have left it at 0)
```

`FILE_SHARE_DELETE` is required on Windows 10/11: without it, the `CreateFile`
call fails with `ACCESS_DENIED` if another process (e.g. Ref) recently held
the device.

## Close Sequence

```go
1. setBrightness(0)             → dim backlight (polite: matches Ref disable behavior)
2. WinUsb_Free(winusbHandle)
3. CloseHandle(devHandle)
```

## No Sleep/Wake Protocol

Unlike VoCore, the USBD480 has **no** sleep/wake USB command. The `usbd480fb`
Linux driver TODO list even notes `suspend/resume?` as unimplemented.

- Do **not** look for a "display on" command — there isn't one.
- Brightness restore (`0x81 wValue=255`) is sufficient to make the screen visible.
- If the screen stays dark after opening, Ref (or our own close) left brightness
  at 0 — the brightness restore in the open sequence is the fix.

## WinUSB Notes (Windows)

- Requires WinUSB driver bound to Interface 0 of the composite device.
- **Zadig**: run Zadig and install WinUSB for the display interface. Both options work:
  - **Interface 0 only** (`MI_00` entry in Zadig) — preferred; keeps HID touchscreen (Interface 1) working.
  - **Whole device** (parent entry in Zadig) — also works; disables HID touchscreen while active.
- Both install types register the device under `GUID_DEVINTERFACE_WINUSB`
  (`{DEE824EF-729B-4A0E-9C14-B7117D33A817}`). Our scan uses **only this GUID** —
  `GUID_DEVINTERFACE_USB_DEVICE` is deliberately avoided because it also lists the
  `usbccgp.sys` composite parent; opening that path causes WinUsb_Initialize to partially
  succeed but OUT control transfers to fail.
- **Zero-length OUT control transfer bug**: WinUSB on composite interfaces rejects a NULL
  buffer pointer for OUT control transfers, even when `BufferLength = 0`. Always pass a
  valid (non-NULL) pointer with `BufferLength = 0`. This matches libusb's behavior
  (`winusbx_submit_control_transfer` always passes `transfer->buffer + setup_size`).
- The `controlOut` function encodes `addr` as `wValue = addr[15:0]`,
  `wIndex = addr[31:16]` — this matches the Linux driver's `usb_control_msg` call
  for `SET_ADDRESS` and `SET_FRAME_START_ADDRESS`.
- Brightness uses `wValue` directly (not encoded as address).

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
| Screen dark after Ref disable | Ref set brightness=0, we didn't restore it | `setBrightness(255)` in open sequence |
| Screen dark after our own close | We set brightness=0 (intended), but next open didn't restore | `setBrightness(255)` in open sequence |
| `ACCESS_DENIED` on CreateFile | Missing `FILE_SHARE_DELETE` on Windows 10/11 | Add `fileShareDelete` flag |
| OUT control transfers fail (`WinUsb_ControlTransfer OUT 0xC0: A device attached to the system is not functioning`) | NULL buffer passed for zero-length OUT transfer — WinUSB on composite devices rejects this even when `BufferLength=0` | Pass non-NULL pointer (e.g. `&dummy[0]`) with `BufferLength=0`; see `controlOut` |
| ALL control transfers fail (IN and OUT) | Using `RECIP_INTERFACE` (0x41/0xC1) — NX firmware STALLs these; only `RECIP_DEVICE` (0x40/0xC0) works | Change `usbd480ReqTypeOut=0x40`, `usbd480ReqTypeIn=0xC0` |
| Device not found | WinUSB not installed, or only `GUID_DEVINTERFACE_USB_DEVICE` path opened | Ensure WinUSB installed via Zadig (Interface 0); our scan uses only `GUID_DEVINTERFACE_WINUSB` |
| Wrong dimensions | Hardcoded size doesn't match device | Always use `queryDeviceDetails()` result |
| Bulk write fails | WinUSB not bound to Interface 0 | Run Zadig, select WinUSB for Interface 0 |

