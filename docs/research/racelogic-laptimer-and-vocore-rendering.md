# RACELOGIC-style lap timer and VoCore rendering

Research date: 2026-07-30

## Decision summary

- The relevant RACELOGIC product is the **VBOX LapTimer**, especially its
  Predictive Lap Timing mode. It is not a generic multi-metric dashboard.
- Its visual identity is a very wide, monochrome OLED information band: one
  dominant signed delta or lap time, very little secondary information, and an
  optional horizontal delta bar. On a normal 800 × 480 VoCore panel, Sprint
  should render this as a centred, approximately 4:1 content band (for example
  800 × 200) and keep all surrounding pixels true black.
- Sprint already has enough data for the core display: current/last/best lap,
  lap number, reference target, track position, speed, and continuously
  calculated Delta-T. It does not currently have enough reference-lap speed
  data to reproduce RACELOGIC's Delta-V LED behaviour exactly.
- VoCore **LZ4 support was introduced in MPRO firmware v0.23**, not v0.25.
  Firmware v0.25 added WS2812B and startup-logo features. Partial drawing is an
  MPRO protocol capability documented separately. Neither optimization is a
  safe generic baseline for unknown/older VoCore controllers.
- The general optimization path should work before optional firmware features:
  suppress identical frames, coalesce to the latest telemetry frame, render
  directly to RGB565 where benchmarking validates it, remove full-frame
  rotation/conversion copies, cache static layers, and instrument render /
  conversion / USB time independently. Dirty-rectangle transfer and LZ4 should
  be opt-in capabilities on top.

## What RACELOGIC's LapTimer looks like

RACELOGIC describes the VBOX LapTimer as a predictive lap timer and data logger,
with the display comparing the current lap to the reference lap in real time.
The product datasheet lists live speed, maximum speed, lap timing, lap count,
and predictive lap timing as display modes. It also documents normal, inverted,
and outline/high-contrast display treatments
([VBOX LapTimer datasheet](https://www.vboxmotorsport.co.uk/downloads/datasheets/VBLAP01_DATA.pdf)).

The current manufacturer's captures establish the hierarchy more precisely:

- [Default predictive display](https://projecteinsteinstorage.blob.core.windows.net/media/production/images/LapTimer_R-V2_PredictiveLapTiming_-00.08_86.2km.original.png):
  a very large signed Delta-T value (`-00.08` in the example), with current speed
  and unit as subordinate information.
- [Predictive display with Delta-T bar](https://projecteinsteinstorage.blob.core.windows.net/media/production/images/LapTimer_R-V2_PredictiveLapTiming.original.png):
  the signed delta stays dominant and a long, centred horizontal bar is added
  beneath it.
- [Live rolling lap time](https://projecteinsteinstorage.blob.core.windows.net/media/production/images/LapTimer_R-V2_PredictiveLapTiming_LiveRolling_o.original.png):
  one large lap-time value occupies the OLED rather than a tile grid.
- [Fastest-lap result](https://projecteinsteinstorage.blob.core.windows.net/media/production/images/LapTimer_R-V2_PredictiveLapTiming_FastestLap.original.png):
  the lap result and its comparison are presented as a temporary, focused state.

The manufacturer does not publish the OLED's pixel dimensions in the product
material found. The approximately **4:1 active-canvas ratio is therefore an
inference from those official captures**, not a claimed RACELOGIC specification.
It is nevertheless the right implementation model for Sprint: a centred,
letterboxed OLED band rather than stretching the content across the VoCore
panel's 5:3 aspect ratio.

Recommended 800 × 480 composition:

```text
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  -00.08                         86.2 km/h     │  │
│  │              ──────────●──────────                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The outer area and the band's own background should be `#000000`.
Information should be white/off-white, with no dashboard cards, borders,
gradients, decorative frame, or permanently visible labels. A coloured
faster/slower indication may be added as a Sprint adaptation, but the original
OLED itself is deliberately monochrome; the physical product uses separate LEDs.

## Behaviour and information states

The official [Display Modes guide](https://en.racelogic.support/motorsport/lap-timing/vblap/ug/display-modes/)
documents this predictive flow:

1. A start/finish line is required.
2. Before it is reached, the screen shows that it is waiting for the start line
   and the distance to it.
3. The first lap creates the reference lap.
4. From the second crossing onward, the display continuously shows signed
   Delta-T to the reference.
5. At lap completion, it shows the final lap time and the total difference to
   the reference. A faster result is negative; a slower result is positive.
6. A configurable Delta-T bar can represent ±2, ±5, ±10, or ±30 seconds.

The reference is replaced by a subsequent quicker lap unless it is fixed. Lap
Timing mode can show either a continuously rolling lap time or the static last
lap plus lap count. Split times temporarily replace the normal display for a
configurable interval. The official
[Lap Timing Menu](https://en.racelogic.support/motorsport/lap-timing/vblap/ug/menu-options/lap-timing-menu/)
documents the rolling timer, split display periods, and gate behaviour.

The available current modes are:

- Predictive Lap Timing
- Lap Timing
- Speed
- Maximum Speed
- Lap Count
- Longitudinal G
- Lateral G

The default enabled modes are Predictive Lap Timing, Lap Timing, and Speed; the
unit calculates all mode data even when a mode is hidden
([Display Menu](https://racelogic.support/motorsport/lap-timing/vblap/ug/menu-options/display-menu/)).

The six physical LEDs are **Delta-V**, not Delta-T: three red LEDs illuminate
from the centre toward the left when current speed is slower than the reference
point, and three green LEDs illuminate from the centre toward the right when it
is faster. Off means the reference speed is being matched. Each LED represents
one third of the configured range
([RACELOGIC LED behaviour](https://en.racelogic.support/motorsport/lap-timing/vblap/ug/led-behaviour/)).

## What Sprint can reproduce now

`TelemetryFrame.Lap` already contains:

- `CurrentLap`
- `CurrentLapTime`
- `LastLapTime`
- `BestLapTime`
- `TargetLapTime`
- `Delta`
- `Sector`
- `TrackPosition`

`TelemetryFrame.Car` also contains speed, and Sprint's `DeltaTracker` builds a
reference and injects Delta-T and target lap time. That supports the essential
RACELOGIC-like state machine without a new game-specific contract:

| Sprint state | Recommended display |
| --- | --- |
| No valid reference | Large rolling lap time; small `BUILDING REFERENCE` status |
| Reference available | Large signed `Delta`; small current speed; optional Delta-T bar |
| Lap boundary | Freeze last lap briefly; show signed difference to best/reference |
| Invalid lap | Keep the timer visible but show a small `INVALID` status |
| Telemetry unavailable | `WAITING FOR TELEMETRY`, still inside the centre band |

Two RACELOGIC behaviours cannot be copied faithfully from today's shared
contract:

- Distance to the start line is unavailable. Sprint should say `WAITING FOR
  REFERENCE` rather than inventing a distance.
- Exact Delta-V LEDs require the reference lap's speed at the current track
  position. `DeltaTracker` currently retains reference time by position, not
  reference speed. Do not derive the LEDs merely from the sign of Delta-T:
  being ahead in time does not imply being faster at that instant. A future
  reference sample can store `(trackPosition, time, speed)` if this behaviour is
  wanted.

Longitudinal and lateral G also are not part of the current shared
`TelemetryFrame`; they should not block the focused lap-timer preset.

## VoCore protocol facts

The current VoCore product page lists 16/24-bit screen support, USB 2.0, and
480 × 800 for the 4-inch/4.3-inch models (800 × 480 for the 6.8-inch model). It
states that the screen retains the image in its own memory and recommends the
libusb path
([VoCore Screen](https://vocore.io/screen.html)).

For an 800 × 480 RGB565 frame:

- one full frame is `800 × 480 × 2 = 768,000` bytes (0.732 MiB);
- 30 full frames/s are about 22.0 MiB/s before USB/control overhead;
- 60 full frames/s are about 43.9 MiB/s before overhead.

VoCore's own JPEG announcement similarly rounds the uncompressed frame to about
800 KB and identifies transfer size as the limiting factor
([MPRO 60 Hz announcement](https://vonger.cn/?p=15523)).

### Partial drawing

VoCore documents partial drawing as an **MPRO driver-board** feature. A 12-byte
draw command contains payload length, X, Y, and window width; height is derived
from payload length / width / two bytes per pixel. Only the window payload is
then bulk-transferred
([MPRO Partially Draw](https://vonger.cn/?p=15504)).

The manufacturer's current Linux DRM driver implements the same model:

- it merges DRM damage into a rectangle;
- converts that rectangle to RGB565;
- writes X, Y, width, and byte length into the partial-draw command;
- sends only that payload.

See the official
[`mpro_drm` partial update implementation](https://github.com/Vonger/mpro_drm/blob/master/mpro.c#L195-L257)
and its
[damage integration](https://github.com/Vonger/mpro_drm/blob/master/mpro.c#L392-L405).
This is strong evidence for an MPRO partial path, but it is not evidence that
every older VoCore/V7B controller accepts the command.

### JPEG, LZ4, and firmware versions

The official history is unambiguous:

- Baseline JPEG firmware support appeared in July 2024 and is included in the
  v0.16–v0.20 change history
  ([firmware v0.20 history](https://vonger.cn/?p=15543)).
- **LZ4 compression was the main v0.23 feature**. VoCore explicitly describes
  testing it together with partial drawing and reports 60 Hz or higher on
  high-resolution displays
  ([firmware v0.23 announcement](https://vonger.cn/?p=15555)).
- Firmware v0.25 added WS2812B-over-SPI and custom startup-logo support; it did
  not introduce LZ4 or partial drawing
  ([firmware v0.25 announcement](https://vonger.cn/?p=15615)).

Therefore “LZ4 only works on v0.25” is too narrow. The defensible capability
gate is **MPRO firmware v0.23 or newer**, subject to validating the exact wire
format against VoCore's `partest.c` sample and real devices. The official DRM
driver can query firmware version
([version query](https://github.com/Vonger/mpro_drm/blob/master/mpro.c#L473-L500)),
so Sprint should negotiate this instead of making a global setting.

LZ4 on the host is useless for an old device that cannot decode the compressed
wire format. Likewise, host-side dirty rectangles save rendering work but save
USB bandwidth only when the device protocol accepts a windowed update.

## Firmware-independent optimization plan

Implement and benchmark in this order:

1. **Stage timing and counters.** Record render time, colour conversion /
   rotation time, USB control time, USB bulk time, frames requested, frames
   rendered, frames sent, frames skipped, and reconnects. Report p50/p95 rather
   than only average FPS.
2. **Latest-frame coalescing.** Keep at most one frame awaiting transport. When
   USB is slower than telemetry, replace stale work with the newest state rather
   than queueing latency.
3. **Unchanged-frame suppression.** If the semantic display state did not
   change, do not render. As a safety net, compare or hash the produced RGB565
   buffer and do not send identical pixels. This benefits every controller.
4. **Purpose-aware cadence.** A rear-view mirror needs the highest sustainable
   cadence. A lap timer can render only when a displayed hundredth/tenth,
   status, or delta bucket changes. Flags can render on state transition.
5. **Cache the static layer.** For the lap timer, the black band, fixed marks,
   and optional bar scale are static. Cache them as an `SKPicture` or bitmap and
   redraw only the number/status region on the host surface.
6. **Render in the transport colour format.** SkiaSharp supports opaque
   `SKColorType.Rgb565`, and `SKSurface.Create(SKImageInfo, IntPtr, rowBytes)`
   can draw into caller-provided memory
   ([`SKColorType.Rgb565`](https://learn.microsoft.com/en-us/dotnet/api/skiasharp.skcolortype?view=skiasharp),
   [`SKSurface` buffer overloads](https://learn.microsoft.com/en-us/dotnet/api/skiasharp.sksurface?view=skiasharp)).
   Benchmark a persistent RGB565 surface over the outbound buffer against the
   current BGRA8888 render plus full-frame conversion. Confirm byte order and
   text quality on hardware before adopting it.
7. **Render in native orientation.** Apply orientation as a canvas transform and
   include margin/offset/letterboxing in the render, avoiding later
   full-frame rotate, margin, and offset passes. Keep the canonical orientation
   enum as the single mapping source.
8. **Compute damage even on the generic path.** Compare the previous and next
   RGB565 buffers in tiles/scanlines. Zero damage means skip. For generic
   full-frame protocols, nonzero damage still sends the full frame; for an MPRO
   capability, coalesce nearby dirty tiles into one or a few window transfers.
9. **Use a full-frame threshold.** Partial updates lose when many rectangles or
   most pixels changed. If the union is above a measured percentage of the
   screen, send one full frame.
10. **Add optional negotiated codecs last.** Query model and firmware, then
    enable MPRO partial draw and v0.23+ LZ4 only for confirmed devices. Fall back
    automatically on rejection or timeout. Never require a firmware upgrade for
    the ordinary Sprint rendering path.

SkiaSharp can reduce host rendering/conversion work, but it cannot by itself
reduce USB bytes. Partial draw or a device-decoded codec is required for the
bandwidth part.

## Suggested implementation acceptance checks

- The lap-timer preset renders a centred ~4:1 black band on all four canonical
  orientations; everything outside the band is exactly black.
- Before a reference exists it shows a rolling lap time and a truthful
  reference-building state.
- With a reference it shows signed Delta-T as the dominant value and speed as
  secondary information; the optional bar uses a documented, fixed range.
- A lap boundary freezes the completed lap result for a deterministic interval.
- Identical semantic/pixel frames do not call the USB bulk-write path.
- The publisher never queues an unbounded sequence of stale frames.
- Benchmarks separately cover render, RGB conversion/orientation, and transport.
- The generic full-frame path works on the oldest supported device.
- MPRO partial and LZ4 paths require positive model/firmware capability and
  automatically fall back after a protocol failure.

