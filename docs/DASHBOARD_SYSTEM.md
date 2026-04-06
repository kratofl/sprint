# Dashboard System

How dash layouts are stored, loaded, and rendered onto the USB screen.

---

## Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard System                                                │
│                                                                  │
│  dashboard.Manager     ← reads/writes JSON files on disk        │
│       │                                                          │
│       ▼                                                          │
│  DashLayout            ← the data model (pages + widgets)       │
│       │                                                          │
│       ▼                                                          │
│  dashboard.Painter     ← renders a frame from layout + data     │
│       │                                                          │
│       ▼                                                          │
│  image.RGBA            ← a rendered Go image object             │
│       │                                                          │
│       ▼                                                          │
│  hardware.baseDriver   ← converts to RGB565, sends over USB     │
└──────────────────────────────────────────────────────────────────┘
```

---

## The Data Model

### `DashLayout` — the root document

```go
type DashLayout struct {
    ID       string      // UUID — used as the directory name (layouts/<id>/)
    Name     string      // display name shown in the UI
    Default  bool        // true for the layout used as the fallback for new screens
    GridCols int         // number of columns in the editor grid
    GridRows int         // number of rows in the editor grid
    IdlePage DashPage    // shown when the driver is not in a session
    Pages    []DashPage  // one or more active pages (driver cycles through them)
    Alerts   AlertConfig // which parameter changes trigger full-screen overlays
}
```

### `DashPage` — one screen of widgets

```go
type DashPage struct {
    ID      string       // UUID
    Name    string       // e.g. "Race", "Quali", "Garage"
    Widgets []DashWidget
}
```

### `DashWidget` — a single widget on the grid

```go
type DashWidget struct {
    ID      string         // UUID
    Type    string         // e.g. "speed", "gear", "lap_time"
    Col     int            // grid column (0-based)
    Row     int            // grid row (0-based)
    ColSpan int            // how many columns wide
    RowSpan int            // how many rows tall
    Config  map[string]any // widget-specific settings (e.g. {"unit": "kmh"})
}
```

### `AlertConfig` — full-screen overlay triggers

```go
type AlertConfig struct {
    TCChange        bool // show overlay when TC level changes
    ABSChange       bool // show overlay when ABS level changes
    EngineMapChange bool // show overlay when engine map changes
}
```

> **C# equivalent:** These are plain C# record/DTO classes (`DashLayoutDto`,
> `DashPageDto`, `DashWidgetDto`). Go structs with JSON tags work exactly the
> same as `[JsonPropertyName("id")]` attributes in C# `System.Text.Json`.

Each layout is stored as a **directory** under `%APPDATA%\Sprint\layouts\`:
```
layouts/
└── <uuid>/
    ├── config.json    ← full layout (pages + widgets)
    └── thumbnail.png  ← auto-generated preview PNG (written on every save)
```

---

## Manager — Layout Persistence

> **C# equivalent:** A `Repository<DashLayout>` that reads/writes JSON files.
> No database. No ORM.

```go
type Manager struct {
    dir     string   // e.g. C:\Users\you\AppData\Roaming\Sprint\layouts
    oldPath string   // legacy migration path
}
```

### Key methods

```go
// List all layouts (metadata only — no widget data)
metas, err := manager.List()    // returns []LayoutMeta

// Load a full layout by ID (pass "" to load the first available or embedded default)
layout, err := manager.Load("3f2a...")   // returns *DashLayout

// Save a layout (creates or overwrites; assigns UUID if layout.ID is empty)
err := manager.Save(layout)

// Create a new empty layout with the given name and persist it
layout, err := manager.Create("Race Layout")

// Delete a layout (returns an error if id == "default")
err := manager.Delete("3f2a...")

// Mark a layout as default (clears the flag on all others)
err := manager.SetDefault("3f2a...")

// Ensure at least one default layout exists (seeds the embedded default on first run)
err := manager.EnsureDefault()
```

The `List()` method loads every layout fully to populate `LayoutMeta` (including page count and
whether a preview PNG exists), so it should not be called on a hot path.

### Default layout

A `default.json` is embedded into the binary at compile time using Go's `//go:embed`:

```go
//go:embed default.json
var defaultLayoutJSON []byte
```

> **C# equivalent:** `Assembly.GetManifestResourceStream("default.json")`.
> The file is compiled into the `.exe` — no external file needed.

If no layouts exist on first run, `EnsureDefault()` seeds the embedded default so the
user always has something to start with.

---

## Painter — The Rendering Engine

> **C# equivalent:** A `Graphics` or `SKCanvas` context. The Painter owns the drawing
> surface and knows how to paint a `TelemetryFrame` onto it.

```go
type Painter struct {
    dc     *gg.Context          // 2D drawing context (fogleman/gg library)
    w, h   int                  // canvas dimensions in pixels
    layout *DashLayout          // current layout (set via SetLayout)
    page   int                  // active page index
    idle   bool                 // true when driver is not in car
}
```

### `Paint(frame)` — the key method

Called once per render tick (~30 Hz) by the screen driver:

```go
img, err := painter.Paint(frame)
// img is a *image.RGBA — the rendered frame as a Go image
```

Internally, `Paint` does:
1. Choose the active page (idle page if `p.idle` is set, otherwise `p.layout.Pages[p.page]`)
2. Clear the canvas with the background color
3. For each widget on the page, call its registered draw function
4. Return the canvas as `image.RGBA`

```go
func (p *Painter) Paint(frame *dto.TelemetryFrame) (image.Image, error) {
    p.dc.SetHexColor("#0a0a0a")   // background
    p.dc.Clear()

    var page DashPage
    if p.idle {
        page = p.layout.IdlePage
    } else {
        page = p.layout.Pages[p.page]
    }
    for _, widget := range page.Widgets {
        drawFn := widgetRegistry[widget.Type]
        // calculate pixel bounds from grid position + span
        x, y, w, h := gridToPixels(widget, p.w, p.h, p.layout)
        // draw the widget into the region
        drawFn(frame, widget.Config)(p.dc, w, h)
    }
    return p.dc.Image(), nil
}
```

### Thread safety

The `Painter` is stored in an `atomic.Pointer[Painter]` on the driver — this allows:
- `SetLayout()` to replace the painter safely from any goroutine
- `driveLoop()` to call `Paint()` on the render goroutine without locks

---

## Widget Registry — The `init()` Pattern

Each widget is a single file in `app/internal/dashboard/widgets/`. Widgets
self-register using Go's `func init()`, which runs automatically when the package
is imported.

```go
// app/internal/dashboard/widgets/widget_speed.go
package widgets

func init() {
    RegisterWidget(WidgetSpeed, "Speed", CategoryCar, 4, 3, false, 30, nil, drawWidgetSpeed)
}

func drawWidgetSpeed(c WidgetCtx) {
    c.Panel()
    c.FontNumber(c.H * 0.45)
    c.DC.SetColor(ColTextPri)
    c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.Y+c.H*0.4, 0.5, 0.5)
    c.FontLabel(c.H * 0.18)
    c.DC.SetColor(ColTextMuted)
    c.DC.DrawStringAnchored("km/h", c.CX(), c.Y+c.H*0.72, 0.5, 0.5)
}
```

> **C# equivalent:** This is like `services.AddSingleton<IWidget, SpeedWidget>()` in
> `Startup.cs` — but without a DI container. Each `init()` call appends to a global
> `map[WidgetType]WidgetFn`. The map is read-only after startup.

The `WidgetCtx` passed to every draw function carries the telemetry frame, widget bounds,
and drawing helpers — no separate "outer/inner function" split needed. The draw function
is called directly on every render tick.

### `WidgetCtx` — Drawing Helpers

```go
type WidgetCtx struct {
    DC         *gg.Context
    Frame      *dto.TelemetryFrame
    X, Y, W, H float64
    FontLoader  func(dc *gg.Context, name string, size float64)
    Config      map[string]any
}

// Pre-built helpers — use these instead of raw gg calls
c.Panel()                         // draw the standard widget background
c.FontNumber(c.H * 0.45)         // apply JetBrains Mono Bold at the given size
c.FontLabel(c.H * 0.18)          // apply Space Grotesk Regular
c.CX()                            // horizontal center of the widget bounds
c.FmtSpeed(frame.Car.SpeedMS)    // m/s → "234" (km/h string)
c.FmtLap(frame.Timing.LastLap)   // seconds → "1:23.456"
c.ConfigString("unit", "kmh")    // read widget-instance config
```

> **C# equivalent:** Extension methods on `SKCanvas`. `WidgetCtx` wraps the raw
> `gg.Context` with domain-specific helpers so widget code stays concise (10–30 lines).

---

## Available Widget Categories

| Constant | Category name | Examples |
|---|---|---|
| `CategoryLayout` | Layout | Separator |
| `CategoryTiming` | Timing | Lap time, sector times, delta bar |
| `CategoryCar` | Car | Speed, gear, RPM, throttle/brake |
| `CategoryRace` | Race | Position, gap to leader |

---

## The Full Rendering Pipeline

From `TelemetryFrame` to pixels on the physical screen:

```
coordinator.readLoop()
  │
  │  frame := adapter.Read()     ← Go struct from game telemetry
  │
  ▼
screen.OnFrame(frame)            ← atomic store (lock-free)
  │
  │  [render tick ~30 Hz]
  │
  ▼
baseDriver.driveLoop()
  │
  ▼
painter.Paint(frame)             ← widgets draw onto gg canvas
  │
  ▼
image.RGBA                       ← Go image (RGBA pixels, 4 bytes per pixel)
  │
  ▼
applyRGB565Rotation(img, buf)    ← convert to 2 bytes per pixel, apply rotation
  │
  ▼
[]byte (RGB565)                  ← raw pixel data the screen understands
  │
  ▼
transport.send(buf)              ← WinUSB bulk transfer to physical device
```

**Why RGB565?** The VoCore M-PRO and USBD480 screens only accept 16-bit colour (5 bits red,
6 bits green, 5 bits blue = 2 bytes per pixel). The conversion from RGBA is done inline with
SIMD-friendly loops — for a 480×800 screen that's 768 000 pixels × 2 bytes = ~1.5 MB per frame.

---

## Adding a New Widget

1. Create `app/internal/dashboard/widgets/widget_<name>.go`
2. Call `RegisterWidget(...)` inside `func init()` — the widget auto-appears in the editor

```go
package widgets

func init() {
    RegisterWidget(
        "my_widget",   // WidgetType — must be unique
        "My Widget",   // display label in the editor palette
        CategoryCar,   // palette category
        3, 2,          // defaultColSpan, defaultRowSpan
        false,         // idleCapable: true = also available on the idle page
        30,            // defaultUpdateHz (informational)
        nil,           // configDefs — []ConfigDef for editor properties (nil = no config)
        drawMyWidget,
    )
}

func drawMyWidget(c WidgetCtx) {
    c.Panel()
    c.FontNumber(c.H * 0.45)
    c.DC.SetColor(ColTextPri)
    c.DC.DrawStringAnchored("42", c.CX(), c.Y+c.H*0.4, 0.5, 0.5)
}
```

No other files need to change. The `import _ "github.com/.../widgets"` in `painter.go`
triggers all `init()` calls at startup.

---

## Layout Storage

```
%APPDATA%\Sprint\
├── layouts\
│   ├── default\
│   │   ├── config.json      ← built-in default layout
│   │   └── thumbnail.png    ← auto-generated preview
│   ├── 3f2a4b1c-...\
│   │   ├── config.json      ← saved layout (full widget data)
│   │   └── thumbnail.png
│   └── ...
├── devices.json             ← screen device registry
└── controls.json            ← button binding config
```
