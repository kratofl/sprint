# Screen Protocols

This is the low-level reference for the USB screen pipeline used by the Sprint
desktop app. The implementation source of truth is `app/internal/hardware`.
Use this document when changing VoCore M-PRO, USBD480 NX, WinUSB, RGB565, or
screen troubleshooting behavior.

## Shared Pipeline

Sprint renders one complete frame, converts it to the screen pixel format, and
then hands it to a driver-specific USB transport:

```text
FrameSource or dashboard.Painter
  -> image.RGBA
  -> RGB565 little-endian
  -> optional rotation, margin, and offset
  -> screenTransport.send([]byte)
```

Key implementation files:

- `driver.go`: `ScreenDriver` and `ScreenConfig`.
- `factory.go`: maps `devices.DriverType` to `VoCoreDriver` or
  `USBD480Driver`.
- `base_driver.go`: connection retry loop, frame scheduling, double-buffered
  render/send pipeline, disabled mode, and Wails screen events.
- `rgb565.go`: RGBA to RGB565 conversion, rotation, margin, and offset.
- `transport.go`: internal `screenTransport` interface.

The coordinator configures a driver with VID, PID, dimensions, rotation, target
FPS, offsets, margin, and driver type. Each transport reports its actual native
size after opening; this may differ from the saved configuration because the
device can report portrait-native dimensions or a more specific model.

RGB565 layout is 16 bits per pixel:

```text
15          11 10            5 4            0
| red, 5 bits | green, 6 bits | blue, 5 bits |
```

Bytes are sent little-endian: low byte first, high byte second. Full-frame
buffer size is `width * height * 2`.

## Shared Runtime

Both screen families use native Windows WinUSB for transport. There is no CGO
or libusb dependency on Windows. VoCore also has a Linux CGO scan path, but the
frame transport is implemented for Windows only; unsupported transports run in
no-op mode.

Runtime behavior in `base_driver.go`:

- If no VID/PID is configured, the driver runs in no-op mode until shutdown.
- Startup retries every 300 ms for the first 30 seconds, then every 3 seconds.
- `ErrDriverNotInstalled` emits `screen:driver_missing` and retries every
  3 seconds while the user installs the driver.
- Other open failures emit `screen:error`.
- Successful open emits `screen:connected`; close emits `screen:disconnected`.
- `SetDisabled(true)` emits `screen:disabled`, exits the active drive loop, and
  releases the USB handle so Ref or another app can own the device.
- `SetDisabled(false)` emits `screen:enabled` and lets the retry loop reconnect.
- On app shutdown, Sprint sends a black frame before closing the transport.

The render loop defaults are driver-specific:

| Driver | Default FPS | Transport |
|---|---:|---|
| VoCore M-PRO | 30 | `winusbSender` in `vocore_usb.go` |
| USBD480 NX | 60 | `usbd480Sender` in `usbd480_usb.go` |

The loop renders a standby frame immediately after connect, then renders on new
telemetry frames, forced redraws, or a 1 Hz idle heartbeat. USB send runs in a
separate goroutine with three pre-allocated RGB565 buffers so slow transfers do
not block the next render.

## VoCore M-PRO

VoCore implementation files:

- `vocore_screen.go`: scan result type, VID, and PID dimension table.
- `vocore_scan_windows.go`: SetupDI enumeration on Windows.
- `vocore_scan_usb.go`: Linux USB enumeration with CGO/libusb.
- `vocore_usb.go`: WinUSB transport and protocol.
- `winusb/vocore.inf`: bundled WinUSB INF for supported PIDs.

Supported VoCore VID/PID values:

| VID | PID | Fallback native size | Notes |
|---|---|---:|---|
| `0xC872` | `0x1001` | 480x800 | M-PRO 4 inch |
| `0xC872` | `0x1002` | 480x800 | M-PRO 4.3 inch |
| `0xC872` | `0x1003` | 480x800 | M-PRO 4 inch alternate |
| `0xC872` | `0x1004` | 480x800 | M-PRO 4 inch or 6.8 inch landscape |
| `0xC872` | `0x1005` | 480x854 | M-PRO 5 inch |
| `0xC872` | `0x1006` | 800x800 | M-PRO 3.4 inch square |
| `0xC872` | `0x100A` | 1024x600 | M-PRO 10 inch |

On open, Sprint prefers the actual model query result over the PID fallback.
`queryScreenModel()` uses the M-PRO protocol:

| Step | Request | Direction | Payload / response |
|---|---:|---|---|
| Send get-screen command | `0xB5` | OUT | `51 02 04 1F FC` |
| Read status | `0xB6` | IN | 1 byte |
| Read screen data | `0xB7` | IN | 5 bytes, model in bytes 1..4 little-endian |

Model IDs currently mapped in `mproModelDimensions()`:

| Model ID | Native size | Notes |
|---:|---:|---|
| `0x00000005` | 480x854 | MPRO-5 |
| `0x00001005` | 720x1280 | MPRO-5H OLED |
| `0x00000007` | 800x480 | MPRO-6IN8 landscape |
| `0x00000403` | 800x800 | MPRO-3IN4 square |
| `0x0000000A` | 1024x600 | MPRO-10 |
| default | 480x800 | Unknown model fallback |

Protocol constants:

| Constant | Value | Meaning |
|---|---:|---|
| Bulk OUT endpoint | `0x02` | Pixel data pipe |
| Vendor request | `0xB0` | Standard VoCore control OUT request |
| OUT request type | `0x40` | Vendor, device recipient |
| IN request type | `0xC0` | Vendor, device recipient |

Open sequence:

1. Enumerate device path by exact VID/PID under `GUID_DEVINTERFACE_USB_DEVICE`.
2. Prefer a whole-device path over an `&mi_` per-interface path.
3. Open with `GENERIC_READ | GENERIC_WRITE` and shared read/write/delete.
4. Call `WinUsb_Initialize`.
5. Reset bulk endpoint `0x02`.
6. Query model and native dimensions; fall back to configured dimensions on
   query failure.
7. Wake display with command `00 29 00 00 00 00`.
8. Restore brightness with command `00 51 02 00 00 00 FF 00`.
9. Build draw command `00 2C <size24le> 00`, where `0x2C` is Memory
   Write and `size = width * height * 2`.

Do not add a separate `0x11` sleep-out command before `0x29`. The current
driver intentionally uses only the M-PRO quit-sleep command plus brightness
restore because Ref-style disable sets brightness to zero.

Frame send:

1. Control OUT request `0xB0` with the 6-byte draw command.
2. Bulk write the full RGB565 frame to endpoint `0x02`.

Close sequence:

1. Set brightness to zero with command `00 51 02 00 00 00 00 00`.
2. Reset endpoint `0x02`.
3. Free the WinUSB handle and close the device handle.

## USBD480 NX

USBD480 implementation files:

- `usbd480_screen.go`: scan result type and default dimensions.
- `usbd480_scan_windows.go`: SetupDI enumeration on Windows.
- `usbd480_usb.go`: WinUSB transport and protocol.
- `winusb/usbd480.inf`: bundled WinUSB INF.

Supported USB identity:

| VID | PID | Fallback native size |
|---|---|---:|
| `0x16C0` | `0x08A7` | 800x480 |

USBD480 NX is treated as a WinUSB interface device. Sprint enumerates only
`GUID_DEVINTERFACE_WINUSB` so it does not accidentally open the raw USB
composite parent, where IN transfers can appear to work while OUT transfers
fail. Per-interface WinUSB paths such as `&mi_00` are valid for USBD480; whole
device paths are still preferred when present.

Protocol constants:

| Request | Value | Direction | Meaning |
|---|---:|---|---|
| `GET_DEVICE_DETAILS` | `0x80` | IN | 64-byte info block |
| `SET_ADDRESS` | `0xC0` | OUT | Set framebuffer write address |
| `SET_FRAME_START_ADDRESS` | `0xC4` | OUT | Flip visible frame start |
| `SET_BRIGHTNESS` | `0x81` | OUT | Backlight level in `wValue` |
| Bulk OUT endpoint | `0x02` | OUT | Pixel data pipe |
| OUT request type | `0x40` | OUT | Vendor, device recipient |
| IN request type | `0xC0` | IN | Vendor, device recipient |

Open sequence:

1. Enumerate a matching WinUSB path for `0x16C0:0x08A7`.
2. Open with `GENERIC_READ | GENERIC_WRITE` and shared read/write/delete.
3. Call `WinUsb_Initialize`.
4. Disable WinUSB `AUTO_SUSPEND` power policy to wake devices left suspended by
   another app.
5. Query actual dimensions and device name with `GET_DEVICE_DETAILS`.
6. Validate native dimensions.
7. Restore full brightness with `SET_BRIGHTNESS`, `wValue = 255`.

`GET_DEVICE_DETAILS` returns 64 bytes:

| Byte range | Meaning |
|---|---|
| `0..19` | Null-terminated ASCII device name |
| `20..21` | Width, little-endian `uint16` |
| `22..23` | Height, little-endian `uint16` |

Frame send:

1. `SET_ADDRESS`, address `0`.
2. Bulk write the full RGB565 frame to endpoint `0x02`.
3. `SET_FRAME_START_ADDRESS`, address `0`.

For USBD480 zero-length OUT control transfers, pass a non-null dummy buffer.
WinUSB on composite devices rejects a null pointer even when `wLength` is zero.

Close sequence:

1. Set brightness to zero with `SET_BRIGHTNESS`, `wValue = 0`.
2. Free the WinUSB handle and close the device handle.

## Troubleshooting

| Symptom | Likely cause | What to check |
|---|---|---|
| Screen not found | Device unplugged, wrong VID/PID, or wrong driver type | Device Manager, saved device config, catalog entry, scan functions |
| `screen:driver_missing` | WinUSB is not bound to the device | Use Sprint driver install, Zadig, or Ref's VoCore setup tool |
| Access denied | Ref or another USB tool owns the device | Disable the other app or use Sprint disabled mode to release ownership |
| USBD480 IN works but OUT fails | Opened the raw composite parent instead of WinUSB interface | Use `GUID_DEVINTERFACE_WINUSB` path, not raw USB parent |
| Wrong dimensions | Fallback dimensions used because model/details query failed | Check model query logs and native size from `transport.nativeSize()` |
| Black screen after connect | Brightness restore failed or previous app left backlight off | Check VoCore `0x51` or USBD480 `0x81` brightness transfer |
| Transfers fail after Ref disable | Device is suspended or still owned | For USBD480, verify `AUTO_SUSPEND` is disabled; for both drivers, close other owners |
| Distorted or rotated image | Painter size and native rotation mismatch | Check `painterDimsForRotation()` and RGB565 rotation path |
| Repeated reconnects | USB send error or screen disconnect | Check `screen:error`, WinUSB logs, cable, and endpoint resets |

When debugging protocol changes, verify both the open path and the send path.
Many devices appear present during enumeration but fail only on the first OUT
control transfer or bulk write.
