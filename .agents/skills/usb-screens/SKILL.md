---
name: usb-screens
description: Use when touching the VoCore or USBD480 drivers, the WinUSB transport, the screen publisher or RGB565 conversion, or when debugging a wheel screen that is dark, wrong-sized, distorted, "in use" or failing to connect.
---

## USB wheel screens (VoCore M-PRO, USBD480 NX)

Code: `app/Sprint.Desktop.Core/Features/Hardware/` — `VoCoreProtocol.cs`, `Usbd480Protocol.cs`,
`WinUsbScreenDrivers.cs`, `WinUsbScreenTransport.cs`, `WinUsbInterop.cs`, `ScreenPublisher.cs`,
`Rgb565.cs`. Host wiring: `app/Sprint.Desktop.Host/ScreenOutputService.cs`. Full protocol
reference and troubleshooting table: `docs/internals/screen-protocols.md`.

### Debugging: look before you change

1. Read the activity log first: `%AppData%\Sprint\diagnostics\logs\sprint-YYYYMMDD.log`. Enumeration,
   open, model detection (`VoCore screen model detected`), resize (`Screen renderer resized`), first
   frame and every state change are logged.
2. Match the symptom against the troubleshooting table in `screen-protocols.md`.
3. Only then change code. Firmware behaviour is stateful; a fix that "worked" once may have just
   coincided with a replug.

### Both families

- Native WinUSB only — no libusb, no CGO-era code. Windows-only paths sit behind
  `OperatingSystem.IsWindows()` guards; other platforms report the state without crashing.
- Open with exclusive access so a competing owner (SimHub, Ref) is reported as `In use`, never
  silently shared. Only claim `In use` when a native access error proves it.
- Never hardcode dimensions. Resolve the native size from the device, and let
  `AdoptDetectedResolutions` write it back so the Devices UI and dash sizing follow.
- RGB565 is little-endian, `width * height * 2` bytes per frame. Rotation, margin and offset happen in
  `Rgb565.ComposeFromBgra`, nowhere else.
- No PNG/JPEG/base64 on the frame path; latest frame wins; identical frames are not resent.
- Protocol logic stays in `Features/Hardware`; nothing above it knows a VID, PID or request code.

### VoCore traps

- **Wedged firmware:** enumeration, `WinUsb_Initialize` and standard requests succeed, but every
  vendor request (`0xB0`, `0xB5`–`0xB7`) is NAKed until timeout. No command recovers it — only a
  replug. Do not "fix" this by reordering open commands.
- **PID `0x1004` is ambiguous** (portrait 4" and landscape 6.8"). The model query decides the size;
  the PID table is only the fallback. Wrong size = the "image tripled with vertical stripes" symptom.
- **Dark panel with frames transferring:** another app left the backlight off. Open sends wake `0x29`
  and brightness `0x51` (both non-fatal).
- Prefer the whole-device path over an `&mi_` interface path. Reset bulk pipe `0x02` on open.

### USBD480 traps

- Enumerate `GUID_DEVINTERFACE_WINUSB` only. The raw composite parent accepts IN transfers and fails
  OUT transfers, which looks like a protocol bug and is not.
- Zero-length OUT control transfers need a non-null dummy buffer; WinUSB on composite devices rejects
  `null` even with `wLength = 0`.
- Disable WinUSB `AUTO_SUSPEND` on open, or a device another app left suspended never wakes.
- Size trust order: reported size, known model by name, configured size, `DefaultNativeSize`. Discard
  zero, oversized or out-of-address-space answers.
- Close sets brightness to 0 before releasing handles.

### Verify

- Run `Usbd480ProtocolTests`, `WinUsbProtocolTests`, `Rgb565Tests`, `ScreenPipelineTests`
  (`app/Sprint.Desktop.Tests`) and `ScreenOutputServiceTests` (`app/Sprint.Desktop.Host/Tests`).
- Check both the open path and the send path: many devices enumerate fine and fail only on the first
  OUT control transfer or bulk write.
- `FakeScreenDriver` passes are not physical-screen verification. Without the panel connected, say
  so explicitly. If you learn a new hardware fact, record it in `screen-protocols.md`.
