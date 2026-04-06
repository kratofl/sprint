# Hardware Abstraction — Screen Drivers

How the USB screen driver is designed, and how VoCore M-PRO and USBD480 are supported
through a shared interface. This document reflects the current codebase after the
hardware abstraction refactor.

---

## The Interface — `ScreenDriver`

> **C# equivalent:** An `IScreenDriver` interface. The coordinator only holds a
> `ScreenDriver` and has no knowledge of which concrete type is behind it.

```go
// app/internal/hardware/driver.go
type ScreenDriver interface {
    Configure(cfg ScreenConfig)          // set USB VID/PID + rotation
    SetLayout(layout *dashboard.DashLayout)
    SetActivePage(index int)
    SetIdle(idle bool)
    OnFrame(frame *dto.TelemetryFrame)   // deliver new telemetry frame
    Run(ctx context.Context)             // start render loop (blocks)
    SetPaused(paused bool)               // release USB for other apps
    GetPaused() bool
    IsConnected() bool                   // is USB link currently open?
    SetEmit(fn func(string, ...any))     // wire up Wails event emitter
}
```

The `Coordinator` holds this interface:

```go
type Coordinator struct {
    screen hardware.ScreenDriver  // could be VoCoreDriver or USBD480Driver
    // ...
}

// Clean — no type assertions anywhere
c.screen.Configure(cfg)
c.screen.SetEmit(emitFn)
if c.screen.IsConnected() { ... }
```

---

## Shared Configuration — `ScreenConfig`

```go
type ScreenConfig struct {
    VID      uint16  // USB Vendor ID  (e.g. 0xC872 for VoCore)
    PID      uint16  // USB Product ID (identifies the screen model)
    Width    int     // render width in pixels
    Height   int     // render height in pixels
    Rotation int     // 0, 90, 180, or 270 degrees
}
```

> Note: `ScreenConfig` doesn't include `DriverType` — that's already baked into the
> concrete driver instance. The coordinator knows the driver type only at construction time.

---

## The Concrete Drivers

### File structure

```
hardware/
├── driver.go           ← ScreenDriver interface + ScreenConfig
├── transport.go        ← screenTransport interface (internal)
├── base_driver.go      ← shared fields + all shared logic (~400 lines)
├── rgb565.go           ← image conversion functions (platform-agnostic)
│
├── vocore_driver.go    ← VoCoreDriver: embeds baseDriver, implements Run
├── vocore_screen.go    ← VoCoreScreen scan result type, PID→dimensions table
├── vocore_usb.go       ← Windows: WinUSB transport for VoCore (openVoCoreScreen)
├── vocore_scan_windows.go
├── vocore_scan_usb.go
├── vocore_scan_stub.go
│
├── usbd480_driver.go   ← USBD480Driver: embeds baseDriver, implements Run
├── usbd480_screen.go   ← USBD480Screen scan result type
├── usbd480_usb.go      ← Windows: WinUSB transport for USBD480 (openUSBD480Screen)
├── usbd480_scan_windows.go
├── usbd480_scan_stub.go
│
└── factory.go          ← NewDriver(driverType, logger) → ScreenDriver
```

---

## `baseDriver` — Shared Logic (Abstract Base Class Pattern)

> **C# equivalent:** An `abstract class BaseScreenDriver` that contains all the shared
> state and logic. Concrete drivers inherit from it and only override `Run()`.
>
> In Go there is no inheritance, but **struct embedding** achieves the same result:
> the concrete struct gets all fields and methods of the embedded struct for free.

```go
// base_driver.go
type baseDriver struct {
    screen      ScreenConfig
    cfgRotation atomic.Int32     // hot-reloadable rotation (lock-free read every tick)
    logger      *slog.Logger

    painter       atomic.Pointer[dashboard.Painter]  // current painter
    currentLayout atomic.Pointer[dashboard.DashLayout]

    latestFrame atomic.Pointer[dto.TelemetryFrame]  // latest game data
    hasNewFrame atomic.Bool                         // "new frame available" flag
    forceRedraw atomic.Bool                         // layout changed, repaint now

    currentIdle       atomic.Bool
    currentActivePage atomic.Int32

    screenConnected atomic.Bool
    paused          atomic.Bool
    pauseSignal     chan struct{}        // signals driveLoop to release USB
    emit            func(string, ...any) // Wails event emitter
}
```

### Why `atomic.*` instead of a `lock`/`mutex`?

The render loop fires 30 times per second. On every tick it reads:
- `latestFrame` (written by the 60 Hz telemetry goroutine)
- `cfgRotation` (written when the user changes rotation in settings)
- `currentLayout` (written when the user saves a layout)

Using a `sync.Mutex` lock here would mean the render loop could be blocked by a UI
action (the user clicking "save layout"). That's unacceptable for a real-time display.

`atomic.Pointer[T]` and `atomic.Bool` allow **lock-free, concurrent reads and writes**:
- The render goroutine reads without ever blocking
- The coordinator writes without holding a lock
- The CPU guarantees memory visibility

> **C# equivalent:** `Interlocked.Exchange` / `Volatile.Read` / `Volatile.Write`.
> Go's `sync/atomic` package provides the same primitives with a cleaner API.

---

## `VoCoreDriver` and `USBD480Driver` — Peer Implementations

Both drivers are ~25 lines each. All shared logic lives in `baseDriver`; each driver
only adds its own `Run()` method that calls `runLoop` with a driver-specific opener:

```go
// vocore_driver.go
type VoCoreDriver struct {
    baseDriver  // ← embedding = "inherits" all fields and methods
}

func NewVoCoreDriver(logger *slog.Logger) *VoCoreDriver {
    return &VoCoreDriver{baseDriver: newBaseDriver(logger)}
}

func (d *VoCoreDriver) Run(ctx context.Context) {
    d.runLoop(ctx, "vocore driver", func() (screenTransport, error) {
        return openVoCoreScreen(d.screen.VID, d.screen.PID, d.screen.Width, d.screen.Height, d.logger)
    })
}
```

```go
// usbd480_driver.go
type USBD480Driver struct {
    baseDriver
}

func (d *USBD480Driver) Run(ctx context.Context) {
    d.runLoop(ctx, "usbd480 driver", func() (screenTransport, error) {
        return openUSBD480Screen(d.screen.VID, d.screen.PID, d.screen.Width, d.screen.Height, d.logger)
    })
}
```

> **C# class hierarchy equivalent:**
> ```csharp
> abstract class BaseScreenDriver {
>     protected abstract Task<IScreenTransport> OpenTransport();
>     public async Task Run(CancellationToken ct) {
>         await RunLoop(ct, OpenTransport);
>     }
> }
> class VoCoreDriver : BaseScreenDriver {
>     protected override Task<IScreenTransport> OpenTransport() =>
>         WinUsb.OpenVoCore(VID, PID, Width, Height);
> }
> class Usbd480Driver : BaseScreenDriver {
>     protected override Task<IScreenTransport> OpenTransport() =>
>         WinUsb.OpenUsbd480(VID, PID, Width, Height);
> }
> ```

---

## Factory — `NewDriver()`

> **C# equivalent:** A factory method / `ScreenDriverFactory.Create(driverType)`.

```go
// factory.go
func NewDriver(driverType devices.DriverType, logger *slog.Logger) (ScreenDriver, error) {
    switch driverType {
    case devices.DriverVoCore:
        return NewVoCoreDriver(logger), nil
    case devices.DriverUSBD480:
        return NewUSBD480Driver(logger), nil
    default:
        return nil, fmt.Errorf("hardware: unknown driver type: %q", driverType)
    }
}
```

The coordinator calls this once at startup:

```go
// core.go
screen, err := hardware.NewDriver(active.Driver, logger)
if err != nil {
    // fallback to VoCore (safe default)
    screen = hardware.NewVoCoreDriver(logger)
}
```

---

## The Render Loop

The screen driver has two nested loops:

### Outer: `runLoop` — connect/retry

```
Start
  │
  ├── screen.VID == 0?  →  no-op mode (no device configured)
  │
  └─▶ loop forever:
        │
        ├── paused?  →  wait 200ms, retry
        │
        ├── openTransport()  →  WinUSB connect to device
        │     ├── error?  →  log + retry after 300ms (fast) or 3s (slow)
        │     └── success:
        │           ├── emit "screen:connected"
        │           ├── driveLoop(ctx, transport)  ← render until disconnect
        │           ├── transport.close()
        │           └── emit "screen:disconnected"
        │
        └── context cancelled?  →  return (app shutting down)
```

### Inner: `driveLoop` — render at 30 fps

```
Open the transport (USB handle)
  │
  ▼
Create/resize the Painter to match native screen dimensions
  │
  ▼
Send one "standby" frame immediately (shows Sprint's UI instead of leftover pixels)
  │
  ▼
Start async sender goroutine (double-buffered pipeline)
  │
  └─▶ ticker fires every 33ms (30 Hz):
        │
        ├── new frame available? (atomic check)  →  no  →  skip
        │
        ├── painter.Paint(frame)    ← draw all widgets
        │
        ├── applyRGB565Rotation()   ← convert RGBA → RGB565
        │
        ├── sendCh <- renderBuf     ← hand off to sender goroutine
        │
        └── pick up returned buffer from returnCh (double-buffer swap)
```

### Double-buffer pipeline

Three pre-allocated buffers (b0, b1, b2) cycle between the render goroutine and the sender
goroutine. This prevents the render loop from blocking on USB latency:

```
Render goroutine          Sender goroutine
     │                         │
 b0 = render(frame)            │
     │                         │
 sendCh ──── b0 ────────────► send(b0) over USB
     │                         │
 b1 = <── returnCh ◄────────── b1 returned after send
     │                         │
 b1 = render(nextFrame)        │
```

> **Why three buffers instead of two?** If the sender is still busy with b0, the render
> goroutine can start working on b1 immediately. b2 acts as a "slack" buffer: if the
> sender is truly slow, the render goroutine discards the stale b1 and replaces it with
> the freshest frame — so the screen always shows the latest data, never a stale frame.

---

## The Transport Interface

> **C# equivalent:** An internal `IScreenTransport` interface. Not exposed to the
> coordinator — only used inside the hardware package.

```go
// transport.go (internal to hardware package)
type screenTransport interface {
    send(rgb565 []byte) error
    close()
    nativeSize() (width, height int)
}
```

Implementations:
- `winusbSender` (VoCore) — `vocore_usb.go`
- `usbd480Sender` (USBD480) — `usbd480_usb.go`

Both use Windows' native WinUSB API via Go's `syscall` package — no CGO, no libusb.

---

## Screen Scanning (Device Detection)

When the user opens the Devices settings page, the frontend calls `ScanScreens()`:

```go
// app_hardware.go
func (a *App) ScanVoCoreScreens() []hardware.VoCoreScreen {
    screens, _ := hardware.ScanVoCore()
    return screens
}

func (a *App) ScanUSBD480Screens() []hardware.USBD480Screen {
    screens, _ := hardware.ScanUSBD480()
    return screens
}
```

Scan functions use Windows `SetupDI` APIs to enumerate USB devices by VID/PID:

```go
// vocore_scan_windows.go
func scanScreensImpl() ([]VoCoreScreen, error) {
    // call SetupDiGetClassDevsW, iterate USB interfaces,
    // match VID 0xC872, build VoCoreScreen for each found
}
```

Platform stubs exist for macOS/Linux:
```go
// vocore_scan_stub.go  (build tag: !(linux && cgo) && !windows)
func scanScreensImpl() ([]VoCoreScreen, error) {
    return nil, nil  // scanning not supported on this platform
}
```

---

## Screen Rotation

The physical screen may be mounted at 0°, 90°, 180°, or 270°. The driver handles this
by adjusting the painter canvas dimensions and applying a pixel-level rotation during
the RGBA → RGB565 conversion:

| Rotation | Painter canvas size | Effect |
|---|---|---|
| 0° | nativeW × nativeH | No rotation |
| 90° | nativeH × nativeW | Canvas transposed; pixels rotated CW |
| 180° | nativeW × nativeH | Pixels mirrored |
| 270° | nativeH × nativeW | Canvas transposed; pixels rotated CCW |

The rotation is stored as `atomic.Int32` so it can be updated at runtime (user changes
rotation in settings) and takes effect on the very next rendered frame without restarting
the render loop.

---

## Pause Mode (SimHub Coexistence)

```go
// Pause: releases the USB handle so SimHub (or another app) can take over
coordinator.SetScreenPaused(true)

// Resume: Sprint reconnects and retakes the screen
coordinator.SetScreenPaused(false)
```

When paused:
1. `SetPaused(true)` sends a signal to `driveLoop` via `pauseSignal` channel
2. `driveLoop` exits, calling `transport.close()` — USB handle released
3. The outer `runLoop` detects `paused == true` and waits instead of reconnecting
4. `SetPaused(false)` clears the flag; `runLoop` opens a fresh USB connection
