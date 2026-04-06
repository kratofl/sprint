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
    ID       string     // UUID — used as the filename (layouts/<id>.json)
    Name     string     // display name shown in the UI
    GridCols int        // number of columns in the editor grid
    GridRows int        // number of rows in the editor grid
    Pages    []DashPage // one or more pages (driver cycles through them)
}
```

### `DashPage` — one screen of widgets

```go
type DashPage struct {
    Name    string      // e.g. "Race", "Quali", "Garage"
    Widgets []DashWidget
}
```

### `DashWidget` — a single widget on the grid

```go
type DashWidget struct {
    Type   string         // e.g. "speed", "gear", "lap_time"
    Col    int            // grid column (0-based)
    Row    int            // grid row (0-based)
    ColSpan int           // how many columns wide
    RowSpan int           // how many rows tall
    Config map[string]any // widget-specific settings (e.g. {"unit": "kmh"})
}
```

> **C# equivalent:** These are plain C# record/DTO classes (`DashLayoutDto`,
> `DashPageDto`, `DashWidgetDto`). Go structs with JSON tags work exactly the
> same as `[JsonPropertyName("id")]` attributes in C# `System.Text.Json`.

The full layout is stored as a single JSON file:
```
%APPDATA%\Sprint\layouts\<uuid>.json
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

// Load a full layout by ID
layout, err := manager.Load("3f2a...")   // returns *DashLayout

// Save a layout (creates or overwrites the JSON file)
err := manager.Save(layout)

// Delete a layout
err := manager.Delete("3f2a...")

// Generate a PNG preview of the layout for the editor UI
pngBytes, err := manager.RenderPreview(layout, width, height)
```

The `List()` method reads the directory, parses each JSON file's header (ID, Name,
GridCols, GridRows) without deserialising the full widget tree — this is why `LayoutMeta`
exists: fast listing without loading all widget data.

### Default layout

A `default.json` is embedded into the binary at compile time using Go's `//go:embed`:

```go
//go:embed default.json
var defaultLayoutJSON []byte
```

> **C# equivalent:** `Assembly.GetManifestResourceStream("default.json")`.
> The file is compiled into the `.exe` — no external file needed.

If no layouts exist (first run), `List()` returns this embedded default so the user always
has something to start with.

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
1. Clear the canvas with the background color
2. Look up the current page's widget list
3. For each widget, call its registered draw function
4. Return the canvas as `image.RGBA`

```go
func (p *Painter) Paint(frame *dto.TelemetryFrame) (image.Image, error) {
    p.dc.SetHexColor("#0a0a0a")   // background
    p.dc.Clear()

    page := p.layout.Pages[p.page]
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
    RegisterWidget("speed", "Speed", CategoryCar,
        WidgetMeta{
            DefaultColSpan: 4,
            DefaultRowSpan: 3,
        },
        func(frame *dto.TelemetryFrame, cfg map[string]any) WidgetDrawFn {
            // build-time setup (parse config once)
            unit := getString(cfg, "unit", "kmh")

            return func(dc *gg.Context, w, h float64) {
                // called every frame — keep allocations minimal
                speed := frame.Car.SpeedKmh
                if unit == "mph" { speed *= 0.621371 }
                WidgetCtx{dc, w, h}.Panel("Speed", FmtValue(speed), OrangeColor)
            }
        },
    )
}
```

> **C# equivalent:** This is like `services.AddSingleton<IWidget, SpeedWidget>()` in
> `Startup.cs` — but without a DI container. Each `init()` call appends to a global
> `map[string]WidgetFactory`. The map is read-only after startup.

The two-level function (`func(frame, cfg) WidgetDrawFn`) is a Go idiom for closures:
- The outer function runs **once at layout load** — parses config, pre-computes values
- The inner `WidgetDrawFn` runs **every frame** — only reads pre-computed values

This avoids re-parsing the config map 30 times per second.

### `WidgetCtx` — Drawing Helpers

```go
type WidgetCtx struct {
    dc *gg.Context
    W  float64
    H  float64
}

// Pre-built layout helpers — use these instead of raw gg calls
ctx.Panel("Speed", "234", OrangeColor)  // label + value + colored bar
ctx.HBar(0.73, CyanColor)               // horizontal progress bar (0–1)
ctx.FontNumber(48)                      // apply the JetBrains Mono font at size 48
```

> **C# equivalent:** Extension methods on `SKCanvas`. The `WidgetCtx` wraps the raw
> `gg.Context` with domain-specific helpers so widget code stays concise (30–60 lines).

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

import (
    "github.com/kratofl/sprint/pkg/dto"
    "github.com/fogleman/gg"
)

func init() {
    RegisterWidget(
        "my_widget",      // type key — must be unique
        "My Widget",      // display label in the editor palette
        CategoryCar,      // palette category
        WidgetMeta{
            DefaultColSpan: 3,
            DefaultRowSpan: 2,
            IdleCapable:    false, // true = renders when driver is not in car
        },
        func(frame *dto.TelemetryFrame, cfg map[string]any) WidgetDrawFn {
            // parse config once here
            return func(dc *gg.Context, w, h float64) {
                ctx := WidgetCtx{dc, w, h}
                ctx.Panel("My Widget", "value", OrangeColor)
            }
        },
    )
}
```

No other files need to change. The `import _ "github.com/.../widgets"` in `manager.go`
triggers all `init()` calls at startup.

---

## Layout Storage Layout (pun intended)

```
%APPDATA%\Sprint\
├── layouts\
│   ├── 3f2a4b1c-...json    ← saved layout (full widget data)
│   ├── a9d21e7f-...json
│   └── ...
├── devices.json             ← screen device registry
└── controls.json            ← button binding config
```
