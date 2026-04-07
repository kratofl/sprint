---
name: vocore-screen
description: Guide for working with the VoCore M-PRO USB screen hardware in Sprint. Covers the USB protocol, control commands, power management (wake/sleep/brightness), screen model detection, and Windows WinUSB driver conventions. Use this when touching app/internal/hardware/*.go or debugging screen connection issues.
---

# VoCore M-PRO Screen Protocol

## Overview

The VoCore M-PRO is a USB 2.0 HS display used as the steering wheel screen. It
communicates over WinUSB on Windows using vendor-specific USB control transfers
and a bulk OUT endpoint for pixel data. The driver lives in
`app/internal/hardware/` — `vocore_usb.go` (Windows), `vocore_scan_*.go`
(platform-specific enumeration), `vocore_driver.go` (Wails integration),
`base_driver.go` (shared render/send loop).

Source of truth for the protocol: https://github.com/Vonger/mpro_drm (`mpro.c`).

---

## USB Identity

| Constant | Value | Notes |
|---|---|---|
| VID | `0xC872` | All VoCore M-PRO screens |
| Bulk OUT endpoint | `0x02` | Pixel data |
| Vendor control request | `0xB0` | All display commands |
| bmRequestType OUT | `0x40` | `USB_DIR_OUT \| USB_TYPE_VENDOR \| USB_RECIP_DEVICE` |
| bmRequestType IN | `0xC0` | Used for model/version queries |

---

## Display Commands (sent via `controlOut`)

All commands are 6 or 8 bytes sent as the data payload of a `0xB0` vendor control transfer.

### Power / Backlight

| Command | Bytes | Effect |
|---|---|---|
| Quit sleep (wake) | `{0x00, 0x29, 0x00, 0x00, 0x00, 0x00}` | Wakes panel from **any** power state. This is `cmd_quit_sleep` in the official driver. Send this on every open — no `0x11` needed, no timing delay. |
| Set brightness | `{0x00, 0x51, 0x02, 0x00, 0x00, 0x00, <level>, 0x00}` | Byte 6 = brightness (0 = off, 255 = full). This is how SimHub's "disable" works — brightness 0, not hardware sleep. |

**CRITICAL — SimHub's "disable" is just brightness=0.** The display controller
stays active. To wake after SimHub disables:
1. Send `0x29` (quit sleep)
2. Send `0x51` with brightness=255

Do NOT send `0x11` (SLEEP_OUT) or `0x10` (SLEEP_IN) — those are raw MIPI DCS
commands that the firmware does not expose; sending them confuses the firmware
state machine and prevents waking.

### Frame Rendering

| Command | Bytes | Effect |
|---|---|---|
| Memory Write | `{0x00, 0x2C, <len_lo>, <len_mid>, <len_hi>, 0x00}` | Precedes each bulk pixel transfer. Bytes 2–4 = frame size in bytes (little-endian). |
| Partial draw | 12 bytes with x/y/w appended | Used by DRM driver for dirty-rect updates; Sprint uses full-frame only. |

### Screen Model Query (3-step sequence)

```
OUT 0xB5: {0x51, 0x02, 0x04, 0x1F, 0xFC}  ← request screen info
IN  0xB6: [1 byte status]
IN  0xB7: [5 bytes: byte[1..4] = model uint32 LE]
```

Model IDs → dimensions (from `mproModelDimensions` in `vocore_usb.go`):

| Model ID | Screen | Dimensions |
|---|---|---|
| `0x00000005` | MPRO-5 (5") | 480×854 |
| `0x00001005` | MPRO-5H (5" OLED) | 720×1280 |
| `0x00000007` | MPRO-6IN8 (6.8") | 800×480 (landscape-native) |
| `0x00000403` | MPRO-3IN4 (3.4" round) | 800×800 |
| `0x0000000a` | MPRO-10 (10") | 1024×600 |
| default | 4" / 4.3" | 480×800 |

---

## Pixel Format

RGB565, 2 bytes per pixel, big-endian within each pixel. Full frame = `width × height × 2` bytes. Sent via `WinUsb_WritePipe` to endpoint `0x02` immediately after the Memory Write control transfer.

---

## Open Sequence (`openVoCoreScreen`)

```
1. FindUSBDevicePath(VID, PID)         ← SetupDI enumeration
2. CreateFile(path, OVERLAPPED)        ← open device handle
3. WinUsb_Initialize(devHandle)        ← get WinUSB handle
4. WinUsb_ResetPipe(0x02)             ← clear stale STALL
5. Query screen model (B5/B6/B7)       ← determine native W×H
6. Send 0x29 (quit sleep)             ← wake from any state
7. Send 0x51 brightness=255           ← restore backlight
8. Build Memory Write cmd             ← store for every frame
```

---

## Close Sequence (`close`)

```
1. Send 0x51 brightness=0             ← dark panel, controller still active
2. WinUsb_ResetPipe(0x02)
3. WinUsb_Free
4. CloseHandle
```

This leaves the panel in the same state SimHub's "disable" produces — so any
app (including Sprint on reconnect) can wake it immediately with `0x29` +
brightness restore.

---

## WinUSB Driver Requirement

The VoCore must have the **WinUSB** driver bound (not libusbK, not libusb-win32).
SimHub's `VOCOREScreenSetup.exe` does this automatically. Alternatively use
[Zadig](https://zadig.akeo.ie). Our code will return `"WinUsb_Initialize: ..."`
or `"access denied"` if the wrong driver is bound or another app holds the handle.

`FILE_SHARE_DELETE` flag is required on `CreateFile` to avoid `ACCESS_DENIED` on
some Windows 10/11 configurations.

---

## Common Failure Modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Screen stays dark after SimHub closes | Brightness was set to 0 by SimHub | Send `0x29` then `0x51` brightness=255 on open |
| `WinUsb_Initialize` fails | Wrong USB driver (libusbK bound) | Reinstall WinUSB via SimHub setup or Zadig |
| `ACCESS_DENIED` on CreateFile | Another app holds exclusive handle | Close SimHub / other USB tools first |
| Model query fails | Device in bad state after reset | Code falls back to configured dimensions; harmless |
| Bulk write fails on first frame | Stale STALL on endpoint | `resetPipe(0x02)` clears it; already done on open |

---

## Code Layout

```
app/internal/hardware/
  vocore_driver.go        ← VoCoreDriver{baseDriver}, implements ScreenDriver
  vocore_usb.go           ← Windows WinUSB transport (winusbSender), open/close/send
  vocore_scan_windows.go  ← SetupDI enumeration (no CGO)
  vocore_scan_usb.go      ← Linux gousb enumeration
  vocore_scan_stub.go     ← unsupported platform stub
  vocore_screen.go        ← VoCoreScreen type, PID→dimensions table
  base_driver.go          ← shared render/send loop, retry, pause, FPS throttle
  driver.go               ← ScreenDriver interface
  transport.go            ← screenTransport interface
```

`baseDriver` is embedded by both `VoCoreDriver` and `USBD480Driver`. Only
`vocore_usb.go` implements the VoCore-specific protocol — all other files are
either shared or device-agnostic.
