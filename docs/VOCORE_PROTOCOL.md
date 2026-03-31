## VoCore M-PRO Screen Protocol & USB Pipeline

This document explains how the Sprint desktop app renders and sends live dashboard
frames to the VoCore M-PRO screen embedded in steering wheels like the
BavarianSimTec OmegaPRO v2.

### Overview

```
Game (LMU)          Sprint App                    Steering Wheel
───────────  ──────────────────────────  ──────────────────────
                                         ┌──────────────────┐
  Shared     ┌────────┐   ┌──────────┐  │  VoCore M-PRO    │
  Memory ───▶│Adapter │──▶│Renderer  │──▶│  Screen          │
             │ Read() │   │ 30 fps   │  │  800×480 pixels  │
             └────────┘   └──────────┘  └──────────────────┘
                  │              │
                  │         3 steps:
                  │         1. Render image (Go 2D graphics)
                  │         2. Convert RGBA → RGB565
                  │         3. Send over USB bulk transfer
                  │
              also fans out to:
              • Engineer WebSocket
              • Frontend (Wails events)
              • Wheel button detector
```

### What is USB? (Quick Primer)

USB (Universal Serial Bus) is how your PC talks to devices like keyboards,
mice, and — in our case — the VoCore screen inside your steering wheel.

**Key concepts:**

| Term | What it means |
|---|---|
| **VID / PID** | Vendor ID + Product ID — every USB device has a unique pair. Like a fingerprint. Your screen is `0xC872:0x1004`. |
| **Endpoint** | A "channel" on the device. Endpoint 0 is for control commands, endpoint 2 is for sending pixel data. Think of it as different mailboxes on the same address. |
| **Control Transfer** | Small command messages (setup, configuration). We use this to tell the screen "a frame is coming". |
| **Bulk Transfer** | Large data transfers (the actual pixels). We use this to send the image data. |
| **Interface** | A logical grouping of endpoints. We claim interface 0 (the screen's only interface). |

**Your wheel has 3 USB devices** (each with its own VID/PID):

```
BavarianSimTec OmegaPRO v2
├── M-PRO Screen    VID=0xC872  PID=0x1004  ← We talk to THIS one
├── LED Controller  VID=0x16D0  PID=0x127B  ← Never touch (serial)
└── HID Controller  VID=0x16D0  PID=0x127A  ← Never touch (input)
```

The `gousb` library (a Go wrapper for `libusb`) lets us find and
communicate with the screen by its VID/PID — guaranteed to never
accidentally talk to the LED or HID controllers.

### The VoCore M-PRO Protocol

The protocol comes from the official Linux kernel driver
[`mpro_drm`](https://github.com/Vonger/mpro_drm) by Vonger (VoCore creator).

#### Step 1: Open the Device

```go
dev, err := ctx.OpenDeviceWithVIDPID(0xC872, 0x1004)
dev.SetAutoDetach(true)         // take over from any OS driver
intf, done, err := dev.DefaultInterface()  // claim interface 0
outEP, err := intf.OutEndpoint(2)          // bulk OUT endpoint 2
```

#### Step 2: Wake the Screen

The screen may be in sleep mode. We send two control messages:

```
Sleep Out command:   [0x00, 0x11, 0x00, 0x00, 0x00, 0x00]
Display ON command:  [0x00, 0x29, 0x00, 0x00, 0x00, 0x00]
```

Each is sent as a **USB control transfer**:
```
Direction:  Host → Device  (OUT)
Type:       Vendor-specific
Recipient:  Device
bRequest:   0xB0
wValue:     0
wIndex:     0
Data:       the 6-byte command above
```

In code:
```go
dev.Control(
    0x40,   // bmRequestType: OUT | VENDOR | DEVICE
    0xB0,   // bRequest: VoCore vendor command
    0, 0,   // wValue, wIndex: always 0
    wakeCmd, // 6 bytes
)
```

#### Step 3: Send a Frame

Each frame is a two-part operation:

**Part A — Control transfer (tell screen: "pixels incoming")**

```
Draw command: [0x00, 0x2C, size_b0, size_b1, size_b2, 0x00]
                     │      └─────── 3-byte little-endian ──┘
                     │               frame size in bytes
                     └── 0x2C = "Memory Write" (LCD command)
```

For 800×480 at 16bpp: `size = 800 × 480 × 2 = 768,000 = 0x0BB800`
```
cmd = [0x00, 0x2C, 0x00, 0xB8, 0x0B, 0x00]
```

**Part B — Bulk transfer (send the actual pixels)**

Write 768,000 bytes of raw RGB565 pixel data to bulk endpoint 2.

```go
// Part A: tell the screen what's coming
dev.Control(0x40, 0xB0, 0, 0, drawCmd)

// Part B: send the pixels
outEP.Write(rgb565Data)  // 768,000 bytes
```

### What is RGB565?

The screen expects pixels in **RGB565** format — a compact 16-bit color
encoding (2 bytes per pixel instead of 4 for RGBA).

```
Standard RGBA (32 bits per pixel):
┌────────┬────────┬────────┬────────┐
│ Red 8b │Green 8b│ Blue 8b│Alpha 8b│  = 4 bytes
└────────┴────────┴────────┴────────┘

RGB565 (16 bits per pixel):
┌─────┬──────┬─────┐
│R 5b │ G 6b │B 5b │  = 2 bytes
└─────┴──────┴─────┘
  Bit layout (little-endian uint16):
  15       11 10        5 4        0
  ├─ Red ──┤ ├─ Green ──┤ ├─ Blue ┤
```

**Why RGB565?**
- Half the data of RGBA → faster USB transfer
- The VoCore screen's LCD controller natively uses RGB565
- 65,536 colors — enough for a dashboard display

**Conversion** (from our `sender.go`):
```go
r := uint16(pixel.R) >> 3   // 8-bit → 5-bit (divide by 8)
g := uint16(pixel.G) >> 2   // 8-bit → 6-bit (divide by 4)
b := uint16(pixel.B) >> 3   // 8-bit → 5-bit (divide by 8)
rgb565 := (r << 11) | (g << 5) | b
// Store as little-endian: low byte first, high byte second
```

### The Full Pipeline in Code

```
coordinator.fanOut()
    │
    ▼
driver.OnFrame(frame)                ← atomic store (non-blocking)
    │                                   never blocks the telemetry loop
    ▼
driver.driveLoop()                   ← runs in its own goroutine at 30fps
    │
    ├─ painter.Paint(frame)          ← Go 2D graphics (fogleman/gg)
    │      produces image.Image         uses Space Grotesk + JetBrains Mono (embedded TTF)
    │      (800×480, RGBA)              draws RPM, gear, speed, temps, etc.
    │
    ├─ imageToRGB565(img, buf)       ← converts RGBA → RGB565 in-place
    │      800×480×2 = 768,000 bytes    zero allocation (reuses pre-allocated buffer)
    │
    └─ transport.send(buf)          ← USB transfer
           │
           ├─ Control: 0xB0 + draw command (6 bytes)
           └─ Bulk OUT: endpoint 0x02 (768,000 bytes)
```

**Timing budget at 30 fps** (33ms per frame):

| Step | Approx. time |
|---|---|
| `painter.Paint()` (gg drawing) | ~2–5 ms |
| RGBA → RGB565 conversion | ~1 ms |
| USB control transfer | <1 ms |
| USB bulk transfer (768 KB) | ~2–5 ms (USB 2.0 HS) |
| **Total** | **~6–12 ms** |
| Budget remaining | ~21–27 ms ✓ |

### Platform Support

| Platform | Implementation | File |
|---|---|---|
| **Windows** | Native WinUSB (no CGO) | `vocore/usb.go` |
| Linux / macOS | Not yet implemented | — |

On Windows, the VoCore screen needs the **WinUSB driver**. Newer VoCore
firmware (≥v0.24) has WCID support and installs it automatically. For
older firmware, use [Zadig](https://zadig.akeo.ie/) to replace the
"MPRO Screen" driver with WinUSB.

### Device Registry & Package Layout

The `devices/registry.go` file maps wheel models to their USB identifiers.
These entries are used for automatic screen detection when no saved config exists:

```go
{
    ID:           "bavarian_omega_v2_pro",
    Manufacturer: "BavarianSimTec",
    USBVID:       0x16D0,  // LED controller (for wheel detection only)
    USBPID:       0x127B,
    ScreenVID:    0xC872,  // ← passed to vocore.Renderer.SetScreen()
    ScreenPID:    0x1004,
    ScreenWidth:  800,     // ← determines frame buffer size
    ScreenHeight: 480,
}
```

The **coordinator** reads the active device from the registry and passes
`ScreenVID`/`ScreenPID`/`Width`/`Height` to `vocore.Driver.SetScreen()`.

**Package ownership:**

| Package | File(s) | Responsibility |
|---|---|---|
| `app/internal/devices` | `screen.go`, `scan_windows.go` | `ScreenConfig`, `DetectedScreen`, `ScanScreens()`, PID→dimensions table |
| `app/internal/devices` | `registry.go`, `manager.go` | Wheel model registry, serial port manager |
| `app/internal/render` | `painter.go` | `Painter`, color tokens, drawing helpers, `Paint()` |
| `app/internal/render` | `widget.go`, `widget_*.go` | `WidgetCtx` toolkit, widget registry, one file per widget |
| `app/internal/vocore` | `driver.go` | `Driver`, render-and-send loop, double-buffer pipeline |
| `app/internal/vocore` | `usb.go` | WinUSB bulk transfer, `screenTransport`, RGB565 conversion |

### Auto-Reconnect

The renderer handles hot-plug and disconnects gracefully:

```
Run()
 └─ loop forever:
      ├─ openScreen(VID, PID, W, H)
      │     ├─ success → renderLoop() → (runs until error)
      │     └─ fail → wait 3s → retry
      │
      └─ screen disconnected → close → wait 3s → retry
```

If you unplug and replug the wheel, the renderer picks it up within 3
seconds. No restart needed.

### Safety

The code **only** communicates with VID `0xC872` / PID `0x1004`.

- The LED controller (`0x16D0:0x127B`) is never opened — only its serial
  port is enumerated (read-only) for wheel detection in `devices/manager.go`.
- The HID controller (`0x16D0:0x127A`) is never touched at all.
- `gousb.OpenDeviceWithVIDPID` matches **exact** VID+PID — no wildcards.

### Adding a New Wheel Model

1. Find the screen's VID/PID (Device Manager on Windows, `lsusb` on Linux)
2. Add an entry to `KnownModels` in `devices/registry.go` with `ScreenVID`/`ScreenPID`/`ScreenWidth`/`ScreenHeight`
3. Optionally add the PID to `mproModelDimensions` in `vocore/usb.go` if the screen has non-standard dimensions
4. No code changes needed elsewhere — the renderer auto-adapts to any resolution
