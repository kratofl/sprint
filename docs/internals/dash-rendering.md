# Dash rendering decisions

Settled rules for the rendered wheel dash. Every dash picture (the wheel, the editor, dash stills,
browser displays) comes from one renderer, the Rust crate in
[`packages/dashboard/renderer`](../../packages/dashboard/renderer): natively in the host, as
WebAssembly in the app and in browsers. The dash is hardware output, not
app UI. It keeps its own palette and type and is not restyled with the app. The research
behind the color model is in [dash-color-research.md](dash-color-research.md).

Readouts follow the Glance readout rules in [`docs/design/DESIGN.md`](../design/DESIGN.md) (stable geometry, tabular
figures, no animated value updates).

## Color means a racing condition

The wheel is its own color domain. Orange means **Warning**. It never marks a value just
because the value is primary or focal, and the app's accent orange never bleeds into the
rendered dash. Focal values stay neutral at rest.

Conditions are modeled separately from the colors that render them:

| Condition | Default | Meaning |
| --- | --- | --- |
| Neutral | White / gray | Valid data, no judgment |
| Good / OnTarget | Green | An explicitly evaluated desired range or target |
| ColdLow | Blue | Below an operating temperature, pressure or lower bound |
| AssistActive | Blue | TC or ABS intervention |
| Warning | Orange | Attention or action required |
| Critical | Red | Immediate operational risk |
| Fault | Red | Invalid data or system failure |
| RaceControl | The signal's own color | A flag or regulated signal |

- Shared colors don't merge states: ColdLow is not AssistActive, Critical is not Fault.
- Generic `information` and `success` are not wheel conditions.
- Timing is its own family: purple = fastest valid lap or sector overall in the session,
  green = a personal best that is not fastest overall, neutral = valid without a best. A
  slower lap is never orange or red just for being slower.
- RPM baseline: green through the operating range, red near the limit, blue at the shift
  point, with thresholds derived from the maximum RPM the game reports. A car-specific
  profile may replace the colors or thresholds once a game exposes authoritative
  shift-light data. RPM stages never use the app's orange accent.
- Yellow race-control signals stay literal yellow and are separate from orange Warning.
- Color is always paired with a non-color cue: stable position, text, icon or threshold
  direction.
- A condition may fill a widget's whole frame (delta gaining, tyre temperature, low fuel)
  because a fill reads at a glance on washed-out USB panels. Values on a fill turn to the
  dark canvas color. A neutral value never gets a fill.

## Setting identity colors

The one exception to "color means a condition". Each driver-adjustable setting has a fixed
identity color (`dashSettingColors` in `palette.ts`): TC blue, ABS purple, brake bias
white, engine map green. A knob widget carries it in its chrome only (border, grid tab or
title bar), never on its value at rest, and its change popup fills the screen with it, so
the driver knows which knob moved before reading the number. Identity colors stay fixed
across themes. They share hues with conditions (TC blue with AssistActive, ABS purple with
session-fastest timing) but never share a surface: identity lives in a knob's chrome,
conditions live on values and fills.

## Dash style

A layout's `dashStyle` decides how every widget is framed and titled: `panels` (separate
rounded boxes, the default), `grid` (one ruled frame, cells share their lines) or `bars`
(boxes with a title bar). It is chrome only. Positions, sizes, values and colors are the
same in each, so switching it never breaks a layout. Frames are therefore not a per-widget
choice: a widget's type says whether it is framed, bare (gear, header, text, RPM, flag) or
split into several frames of its own (the four tyres), and `chrome.rs` draws the style.
Widgets render only their values; the title belongs to the chrome so every style can place
it (inside the frame, or in the bar).

## Functional and Styled

Every dash has one color system:

- **Functional** (default) uses the condition mappings above.
- **Styled** may remap Neutral, Good/OnTarget, ColdLow, AssistActive, Warning, timing and
  the primary/accent colors, including the RPM endpoints. It never changes layout, type,
  readout stability or non-color cues.
- **Protected in both:** Critical and Fault stay red, RaceControl keeps its signal color.
  Stored or imported themes cannot override them.

Functional and Styled are internal classifications, not an editor mode. The dash editor
offers complete theme presets, each with a rendered preview and a swatch; previews use a
redline frame so the whole RPM sequence shows. The **Graphite** preset is the empty theme:
it restores the Functional palette and its swatch is neutral, because Functional has no
brand-primary color. Every other preset applies its Styled palette. Per-condition and
generic accent overrides are not exposed; stored legacy overrides stay readable.

## Type

- Saira Semi Condensed for numeric values on the rendered dash only.
- Inter for labels and supporting text on the dash.
- Continuously changing numbers use tabular figures.
- The faces are compiled into the renderer (`renderer/fonts/`, `text.rs`); nothing loads a font at
  run time. Ratios measured from them (`avg_advance_ratio` in `text.rs`, the widest-digit advance
  in `primitives.rs`) are constants: a new face file needs them measured again, or value sizing,
  clipping and the "fit" squeeze move without any test noticing a missing font.

## Attention ladder

- AssistActive switches to blue immediately, without animation.
- Warning is stable orange with a label or icon.
- Critical is red and may use foreground/background inversion at no more than 2 Hz, only
  while immediate driver action is required.
- Fault is stable red with explicit text or a code.
- RaceControl follows its signal protocol.
- Parameter-change alerts may use a stable, author-selected inversion. That is a color
  treatment, not an animation.
- Glow, bounce, scale and continuous pulse are never alert mechanisms. Desktop app alerts
  never flash.

## How the renderer draws

scene + frame JSON → model (`model.rs`, the lenient boundary) → display list (`DrawOp`s, a pure
function) → pixels (`raster.rs`, tiny-skia). The crate replaced a React renderer that Chromium
painted, and it reproduces that picture on purpose; the parts below look arbitrary in the source and
are not.

- **The frame is the host's telemetry JSON**, `Sprint.Desktop.Api`'s `TelemetryFrame` as
  `HostJson` writes it (C# names, enums as names), without the other cars (`DashFrameJson`). The
  model keeps the `@sprint/types` names and `model.rs` maps onto them with `parseHostFrame`'s
  rules; the editor converts its mirror frames back with `toHostFrame`
  (`packages/dashboard/src/hostFrame.ts`). The boundary reads a misnamed field as 0 without a
  word, so `renderer/tests/fixtures/host-frame.json`, the host's own output kept current by
  `HostFrameFixtureTests`, must reach the model value for value (`tests/host_frame.rs`).
- **The display list is the tested seam.** Layout, values, colors and clips are asserted on
  `DrawOp`s, without drawing a pixel; only what the raster adds (box snapping, radii, borders,
  text coverage) is tested on pixels. Put new behaviour where a display-list test can see it.
- **Boxes are quantized like Blink.** Box geometry is fixed point in 1/64 px, truncated toward zero
  (`layout_unit` in `draw.rs`), then each edge is rounded to a whole device pixel when painted; a
  box with a real size keeps at least 1 px. The truncation decides which way a `.5` goes, so
  rounding straight from floats moves edges by a pixel.
- **Text is filled through a coverage mask** with a brightness-dependent lookup (`TextLuts` in
  `raster.rs`): light text is thickened (`coverage^(1/2.2)`), near-black ink on a condition fill
  is thinned (`coverage^1.3`). Both exponents were fitted against Chromium-painted references.
  Glyph x is quantized to a quarter pixel and the baseline snapped to a whole one.
- **"Fit" squeezes, never truncates, and engages on an estimate.** A static label with
  `TextSizing::Fit` is scaled to exactly its maximum width when the estimated width (UTF-16
  length × size × the face's average advance) exceeds it, not the shaped width; a label the
  estimate flags is stretched even if it would have fit. Dynamic values stay stable: authored
  size, clipped on the side away from their anchor, so a changing readout never pulses.
- **No clock inside.** Time comes in as `now_ms` (only differences are read). `render_live`
  keeps the alert, lap-timer and multi-dial popup state between frames and says when the picture
  depends on time; `render_still` (the editor) keeps none. The dial reading is not in the frame:
  the host hands it over with `set_multi_dial` when it changes, so a turn shows without a game.
- **A panic is an error, not a crash.** Every C ABI entry point catches panics, which needs
  `panic = "unwind"` in the release profile; in WebAssembly a panic traps and
  `src/dashWasm.js` starts a fresh instance.
- **The editor's copies are guarded.** The widget types the editor offers
  (`src/widgetTypes.ts`) are checked against what the renderer draws by a Rust test that reads that
  file. Palette, grid math and groups exist in both languages because the WebAssembly build only
  turns a scene into pixels, and the editor needs those answers itself while editing (swatches, the
  selection overlay that must line up to the pixel, the group tree). Each Rust module's tests are
  ported from the TypeScript ones; a change to one side is a change to both, tests included.

## Checking a change

`cargo run --release --example render -- --dash <layout.json> <out.png>` in the crate draws one page
of a layout at 800x480 against a fixed mid-race frame (`--page`, `--style panels|grid|bars` and
`--size` override; `--banner <banner.json>` draws an alert popup over it). Render the presets in
`app/Sprint.Desktop.Host/presets/dash/` at the panel size and look at the PNG: layout, alignment,
clip direction, weights and color, not the telemetry values. There is no reference image set in the
repo.

## Contrast

Primary values target at least 7:1 and semantic colors at least 4.5:1 against the dash
background.
