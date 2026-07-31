# Screen Protocols

This is the low-level reference for the USB screen pipeline used by the Sprint
desktop app. The legacy Go implementation previously lived in
`app/internal/hardware`; the .NET/Avalonia implementation now lives under
`app/Sprint.Desktop.Client/Features/Hardware` and uses the same wire protocol.
Use this document when changing VoCore M-PRO, USBD480 NX, WinUSB, RGB565, or
screen troubleshooting behavior.

## Shared Pipeline

Sprint renders one complete frame in the screen's native pixel format, then
hands it to a driver-specific USB transport. Dashboard painting writes RGB565
directly; rear-view capture wraps BGRA capture buffers in reusable Skia objects
and composes them into RGB565:

```text
TelemetryFrame
  -> DashPainterFrameSource / DashPainter (direct RGB565)
Desktop capture (BGRA)
  -> BgraToRgb565SurfaceComposer (RGB565)
Both paths
  -> rotation, margin, and offset during composition
  -> duplicate-frame suppression
  -> double-buffered render / USB transfer overlap
  -> IScreenDriver.TrySendFrame(byte[])
  -> WinUsbScreenTransport
```

Key implementation files:

- `ScreenModels.cs`: `IScreenDriver`, configuration, USB identity, and status.
- `ScreenDriverFactory.cs`: maps driver ids to VoCore or USBD480.
- `ScreenPublisher.cs`: connection retry, duplicate suppression, performance
  metrics, and off-UI-thread frame scheduling.
- `ScreenTransferWorker.cs`: blocking USB transfer ownership while the publisher
  prepares the next native frame.
- `BgraToRgb565SurfaceComposer.cs`: reusable native rear-view conversion,
  rotation, margin, and offset.
- `Rgb565.cs`: managed BGRA-to-RGB565 fallback and pixel helpers.
- `WinUsbScreenTransport.cs`: WinUSB bulk/control transport.
- `VoCoreProtocol.cs`: M-PRO packet and model encoding.

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
or libusb dependency. Physical frame transport is Windows-only; unsupported
platforms report that state without crashing.

Runtime behavior in the current desktop client:

- Generic VoCore entries (`0000:0000`) scan vendor `0xC872` with any PID; generic
  USBD480 entries resolve to `0x16C0:0x08A7`.
- A driver family that cannot infer a missing vendor identity reports
  `ConfigurationRequired` instead of incorrectly claiming that a driver is missing.
- Connection retries run every 3 seconds. A slow native open remains
  `Connecting`; Sprint only reports `In use` when a native access error proves it.
- Enumeration, `CreateFile`, `WinUsb_Initialize`, protocol initialization,
  first-frame output, state changes, and failures are written to the activity log.
- Two saved entries targeting the same physical USB identity do not start competing
  publishers. The less-specific duplicate reports `Duplicate target`.
- Disabling a saved screen stops its publisher and releases the USB handle.
- Sprint reuses the compatible Windows USB binding already configured for the
  screen (including a working SimHub setup); it does not require a separate
  per-use driver installation step.
- On shutdown VoCore releases its handles so firmware resumes ownership;
  USBD480 sets brightness to zero before releasing its handles.

The render loop defaults are driver-specific:

| Driver | Default FPS | Transport |
|---|---:|---|
| VoCore M-PRO | 30 | `VoCoreScreenDriver` + `WinUsbScreenTransport` |
| USBD480 NX | 30 | `Usbd480ScreenDriver` + `WinUsbScreenTransport` |

Each screen owns a background publisher, two pre-allocated RGB565 frame buffers,
and one transfer worker. While USB sends one buffer, the publisher prepares the
next buffer. Unchanged frames are not retransmitted. The configured target FPS
is therefore a cap on physical output, not a promise to resend identical
content. Source, pixel-transform, USB, total delivered-frame timing, and recent
successful-output FPS are exposed in every screen-purpose detail view and
written to the activity log every five seconds while output is active.

## VoCore M-PRO

VoCore implementation files:

- `VoCoreProtocol.cs`: commands, draw header, and model-dimension table.
- `WinUsbInterop.cs`: SetupDI enumeration and native WinUSB calls.
- `WinUsbScreenTransport.cs`: checked control/bulk transfers.
- `WinUsbScreenDrivers.cs`: VoCore lifecycle and frame sequence.

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

Sprint resolves the native size before the first frame: it queries the firmware
model id (below) and maps it through `VoCoreProtocol.NativeDimensions()`; when
the query fails it falls back to the PID table and saved orientation. The
publisher rebuilds its dashboard renderer and RGB565 buffer when the resolved
size differs from the saved configuration. This matters because PID `0x1004` is
ambiguous — portrait-native 4" and landscape-native 6.8" panels share it, and
sending 800px rows to a 480px-wide panel interleaves three sheared copies of
the frame (the "tripled image with vertical stripes" symptom).

The model-query protocol:

| Step | Request | Direction | Payload / response |
|---|---:|---|---|
| Send get-screen command | `0xB5` | OUT | `51 02 04 1F FC` |
| Read status | `0xB6` | IN | 1 byte |
| Read screen data | `0xB7` | IN | 5 bytes, model in bytes 1..4 little-endian |

Model IDs currently mapped in `VoCoreProtocol.NativeDimensions()`:

| Model ID | Native size | Notes |
|---:|---:|---|
| `0x00000005` | 480x854 | MPRO-5 |
| `0x00001005` | 720x1280 | MPRO-5H OLED |
| `0x00000007` | 800x480 | MPRO-6IN8 landscape |
| `0x00000403` | 800x800 | MPRO-3IN4 square |
| `0x0000000A` | 1024x600 | MPRO-10 |
| default | 480x800 | Unknown model fallback |

The query runs with the same 2-second overlapped-control timeout as every other
transfer and is non-fatal: on failure Sprint resets the control pipe and keeps
the PID/config dimensions. (An earlier note claimed the query blocks on a
SimHub-compatible `0x1004` firmware — that observation was made while the
firmware was in the wedged state described below, which blocks every vendor
transfer equally, so it does not indict the query itself. The official mpro DRM
driver issues the same query unconditionally at probe.)

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
3. Open with `GENERIC_READ | GENERIC_WRITE` and exclusive access so competing
   screen-output processes are reported instead of silently sharing the device.
4. Call `WinUsb_Initialize`.
5. Reset bulk pipe `0x02` to clear stale state a previous owner left mid-frame
   (non-fatal).
6. Resolve native dimensions: model query `0xB5`/`0xB6`/`0xB7`; on failure fall
   back to the matched PID and saved orientation.
7. Send quit-sleep `00 29 00 00 00 00` and full brightness
   `00 51 02 00 00 00 FF 00` via request `0xB0` (both non-fatal on failure).
   This mirrors the mpro DRM driver's enable path; another screen app's
   "disable" can leave the backlight at 0, in which case frames transfer
   fine but land on a dark panel.
8. Build draw command `00 2C <size24le> 00`, where `0x2C` is Memory
   Write and `size = width * height * 2`.

Control transfers use a 2-second overlapped timeout; failures are surfaced and
retried by reopening the device.

Hardware-verified 2026-07-23 (BavarianSimTec Omega PRO V2, `0xC872:0x1004`,
`bcdDevice 0x01A0`): the firmware can enter a wedged state in which enumeration,
`CreateFile`, `WinUsb_Initialize`, and standard control requests (for example
`GET_DESCRIPTOR`) all succeed, but every vendor control request — `0xB0`
draw/wake/brightness and `0xB5`/`0xB6`/`0xB7` model query alike, IN and OUT —
is NAKed until the transfer times out. No command variant unwedges it; only
power-cycling (replugging) the screen recovers. This is why a reorder of open
commands cannot avoid the timeout: when wedged, the first vendor transfer of
any kind fails, and the retry loop keeps reporting `Connection failed` until
the device is power-cycled.

Frame send:

1. Control OUT request `0xB0` with the 6-byte draw command.
2. Bulk write the full RGB565 frame to endpoint `0x02`.

Close sequence:

1. Free the WinUSB handle and close the device handle.

## USBD480 NX

USBD480 implementation files:

- `WinUsbInterop.cs`: WinUSB-interface enumeration and native calls.
- `WinUsbScreenTransport.cs`: checked control/bulk transfers and power policy.
- `WinUsbScreenDrivers.cs`: USBD480 details, brightness, and frame sequence.
- `Usbd480Protocol.cs`: request constants, details-block decoding, known-model
  sizes, and native-size resolution. Pure and unit-tested, so everything except
  the native transfers is verifiable without the panel.

Supported USB identity:

| VID | PID | Fallback native size |
|---|---|---:|
| `0x16C0` | `0x08A7` | 800x480 |

Known panel sizes, used only when the device names itself but its size fields are
unusable:

| Reported name contains | Native size |
|---|---:|
| `NX43` | 480x272 |
| `NX50` | 800x480 |

`Usbd480Protocol.DefaultNativeSize` is the single source for the 800x480
stand-in: the driver falls back to it, and a generic USBD480 entry is saved with
it until the real panel reports in.

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
2. Open with `GENERIC_READ | GENERIC_WRITE` and exclusive access.
3. Call `WinUsb_Initialize`.
4. Disable WinUSB `AUTO_SUSPEND` power policy to wake devices left suspended by
   another app.
5. Query actual dimensions and device name with `GET_DEVICE_DETAILS`.
6. Resolve the native size, in order of trust: the size the panel reported, a
   known model matched on the reported name, the configured size, then the
   documented default. An unrenderable answer (zero, oversized, or a frame past
   the 24-bit address space) is discarded rather than driving a bogus framebuffer.
7. Restore full brightness with `SET_BRIGHTNESS`, `wValue = 255`.

`GET_DEVICE_DETAILS` returns 64 bytes; at least 24 must arrive to read the size:

| Byte range | Meaning |
|---|---|
| `0..19` | Null-terminated ASCII device name (no terminator = full 20 bytes) |
| `20..21` | Width, little-endian `uint16` |
| `22..23` | Height, little-endian `uint16` |

## Detected size adoption

A panel's real size can differ from what the saved device holds: USBD480 reports
its own dimensions, and generic entries (including custom wheels added with
"Auto-detect") start from a stand-in. The publisher always renders at the size the
driver reports, and `DeviceScreenService.AdoptDetectedResolutions` writes that size
back onto the saved device and persists it. Without that step the panel rendered
correctly while the Devices UI, the detail preview, and dash sizing kept the stale
guess. Invalid detected sizes are ignored, and adoption is idempotent.

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
| `USB access failed` | The device was found but its current Windows USB binding could not be used | Close SimHub/other screen output, reconnect, and inspect the exact `WinUsb_Initialize` error; no separate per-use install is expected |
| `In use` / access denied | SimHub, Ref, or another USB tool owns the device | Disable that app's screen output or close it so Sprint can open the handle |
| `Connecting` takes longer than 3 seconds | Native USB enumeration or initialization has not returned | Inspect the last enumeration/open stage in Development Tools; do not assume another owner until a native access error confirms it |
| `Duplicate target` | Two saved Sprint entries resolve to the same physical USB identity | Keep the intended wheel/screen entry enabled and disable or remove the duplicate |
| USBD480 IN works but OUT fails | Opened the raw composite parent instead of WinUSB interface | Use `GUID_DEVINTERFACE_WINUSB` path, not raw USB parent |
| Wrong dimensions | Saved `0x1004` orientation is wrong or USBD480 details are invalid | Check the resolved-dimensions log and the `Screen renderer resized` entry |
| Image repeated ~3× with vertical stripes | Landscape rows sent to a portrait-native panel (stride mismatch) | Check the `VoCore screen model detected` log; if the model query failed, fix the saved width/height to the panel's portrait-native size and use rotation |
| Black screen after connect | Previous app left the backlight off or first frame failed | Check the first-frame transfer log and the VoCore wake/brightness warnings; USBD480 additionally logs request `0x81` |
| Every vendor control transfer times out, standard requests work | VoCore firmware is wedged (seen on `0x1004`, `bcdDevice 0x01A0`) | Power-cycle (replug) the screen; no host-side command recovers it |
| Transfers fail after Ref disable | Device is suspended or still owned | For USBD480, verify `AUTO_SUSPEND` is disabled; for both drivers, close other owners |
| Distorted or rotated image | Painter size and native rotation mismatch | Check `DashPainterFrameSource` logical/native dimensions and the `Rgb565` rotation path |
| Repeated reconnects | USB send error or screen disconnect | Check screen state-change/transfer logs and the cable |

When debugging protocol changes, verify both the open path and the send path.
Many devices appear present during enumeration but fail only on the first OUT
control transfer or bulk write.
