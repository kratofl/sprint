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
- A condition may fill a widget's whole frame (TC or ABS working, the hybrid deploying or
  regenerating, a penalty to serve) because a fill reads at a glance on washed-out USB panels.
  Values on a fill turn to the dark canvas color. A neutral value never gets a fill.
- Fuel and energy running low colour the value instead (fuel, fuel and VE laps, range): amber
  within twice the app-wide fuel warning's laps (the `fuel_low` alert's `lapsLeft`, which the
  host stamps on every dash it shows), red at or under them.
- Bar widgets carry no label and no value (the driver's call, 2026-11), but wear the dash's
  edge like any box (the dash's edge "None" drops it): twenty segments, and
  an energy bar's segments each wear their zone's color (red under the driver's critical mark,
  amber under the low one, good above), lit or as a dim tint, so the scale reads at a glance even when full. The fuel
  bar measures against the tank's size when the game reports it.
- A frame's edge is the text color, white by default (the driver's call, 2026-11, after a
  works team's wheel): a white outline separates values on a washed-out panel where a grey one
  disappears. The label goes where the dash (or the widget) says: cut into the top edge at the
  left (so the value keeps the box's height; an edgeless box puts it small above the value),
  centred above the value inside the box, beside the value at the left or right (for short boxes,
  such as one in a top strip, where a label above would shrink the value), in a band, or off. A
  label cut into a lit box's edge sits on a round dark pill, never a square notch. The corner
  radius is the dash's.

## Setting identity colors

The one exception to "color means a condition". Each driver-adjustable setting has an identity
color (`dashSettingColors` in `palette.ts`): TC, TC 2 and TC slip blue, ABS and brake bias yellow,
engine map green, migration red, the anti-roll bars orange. A knob widget wears it on its label,
its edge and its value alike (the driver's call, 2026-11: a colored label beside a white edge and
value looked unfinished), and its change popup fills the screen with it, so the driver knows which
knob moved before reading the number. The one
lit state: while TC or ABS is working, its whole frame fills with the color and the value turns to
ink. No theme changes them. They share
hues with conditions (TC blue with AssistActive, ABS yellow with race-control yellow), so a knob
never also takes a condition color: its value only ever wears its identity, or ink on its fill.

## One look

A dash has one look (the driver's call, 2026-11-22: four frame styles, six label spots, edges and
free colours per widget made too many combinations that looked bad on the wheel). Its `chrome`
sets the corner radius, the edge and where labels sit; a widget may move only its own label
(never into the band, which is the dash's), and colours follow meaning, never the widget. Older
dashes' `dashStyle` (panels, grid, label bars) and widget colours and edges are dropped on load
(`DashLooks.Flatten`); the renderer has no other style to draw. A widget's type says whether it
is framed, bare (gear, text, RPM) or split into several frames of its own (the four tyres), and
`chrome.rs` draws the frame and the label, so widgets render only their values.

## The driver's colours

Colours are the driver's, not the dash's (the driver's call, 2026-11-23: Sprint draws its own look;
a driver picks what colours mean, not hex values). One app-wide setting, Settings › Colours
(`ColourSettings` in Core), reaches every dash in the scene's `settings.colours`; the pit wall and
Analysis read the same setting through `DashColoursContext`. It holds:

- a **colour theme** that sets only the scale's cold and good (`themed_palette`): Sprint (blue,
  green), Calm (grey, and good in the plain value colour, so only trouble is coloured), Strict
  (red, green). Warning stays orange and critical red in every theme; race-control yellow, timing
  and the knobs' identity colours never change;
- the **limits** where values move along the scale: tyres against the compound's ideal (the game's
  `optimalTemp`, 90 °C when it gives none), brakes in °C, tyre wear and fuel and energy bars in
  percent. The host refuses limits out of range or order, so the renderer trusts them.

Each surface draws a meaning in its own shade: the wheel's warning is orange, because yellow is
race control's, while the app (`--heat-*` in `styles.css`) draws warm in its warning yellow. A
layout's own `theme` and `colorSystem` are no longer read (#274 removes them); a dash looks the
same on every wheel the driver owns.

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
  `HostJson` writes it (C# names, enums as names), the other cars included for the relative
  widget (`DashFrameJson`). The model keeps the `@sprint/types` names and `model.rs` maps onto
  them with `parseHostFrame`'s rules; the editor converts its mirror frames back with `toHostFrame`
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
- **Alerts are app-wide but the renderer reads only the layout.** The host stamps the driver's
  alert settings onto a copy of every layout it hands a renderer (`AppDashAlerts.Stamp` in
  `Sprint.Desktop.Core`, the app's previews `dashAlertFromSettings` in `src/alerts.ts`); a layout's
  own `alerts`/`alertConfig` are never read, and a stamped copy is never saved. A
  `strip` is a band a third of the screen tall across its middle; under 100 logical px (a screen
  under 300 px tall) it is drawn full screen instead, decided at draw time (`overlays::strip_fits`),
  so a preview drawn smaller than its panel can fall back where the wheel shows the strip. Alerts
  that are up stack, one per type, newest on top, so one held until Ack is never lost under a
  passing one. A held alert never makes the picture time dependent: whoever calls `acknowledge`
  renders again. While the flag alert is up the flag bar is not drawn; it would name the
  flag twice.
- **The lap review draws only what the lap left behind.** The `lap_summary` alert's six cells
  are the layout's `lapReview.cells` (`LapReview` in `lap_summary.rs`; a missing or unknown cell
  is the default's in its place). `LapSummaryWatcher` captures every value a cell can show as the
  lap finishes (the sectors and best with the lap time, the rest on the frame the lap counter
  moves), and the screen draws from that capture, never from the live frame, so a review held
  for 15 s still shows the lap it is about. Sector deltas compare with the driver's sector bests
  as the watcher took them when the previous lap's time arrived: the host improves a sector's best
  the moment the sector is done, so the frame's bests at the line already hold this lap's sectors.
- **The pit limiter is an overlay, not an alert.** The `pit_limiter` alert type raises no popup;
  its setting only says whether the layout's `pitLimiter` overlay (`pit_limiter.rs`) draws while
  the limiter is on. It draws over the page's widgets and under the lap timer, alert popups and
  flag bar, never on the idle page. The gear look lights the page's `gear` widget (a page without
  one gets the full screen); the box look frames the first and last columns and the top row. An
  even-grid dash (no track sizes) always gets the full screen.
- **A dash's grid is its own.** `colSizes`/`rowSizes` are its column widths and row heights as
  shares, so one dash fits every screen and a screen profile never refits it; the chrome is
  sized as at 800x480. The gear is an ordinary widget. Dashes saved on the old zoned grid move onto
  the zones' own 11 x 9 tracks with the gear the renderer used to draw (`DashTracks.MigrateZoned`),
  so nothing moves a pixel; new dashes start on 10 x 9. Older even-grid dashes keep `gridCols` x
  `gridRows` and still refit to their screen.
- **Widgets know their sizes.** `packages/dashboard/src/widgetForms.json` lists each widget's forms,
  largest first, by the smallest box (at 800x480) each is drawn in. The renderer draws less in a
  smaller form (`forms.rs`); the designer reads the same file to name the form while resizing and
  to never size a widget below its smallest form. An older dash's box below it still draws the
  smallest form. Its `unlabelled` list must match the widgets `widget_chrome` frames without a
  title (a test checks). Titles shorten on a narrow box (`chrome.rs` `short_title`); they are
  never typed by the driver.
- **A panic is an error, not a crash.** Every C ABI entry point catches panics, which needs
  `panic = "unwind"` in the release profile; in WebAssembly a panic traps and
  `src/dashWasm.js` starts a fresh instance.
- **The editor's copies are guarded.** The widget types the editor offers
  (`src/widgetTypes.ts`), the alert types (`src/alerts.ts`), the lap review fields
  (`src/lapReview.ts`) and the pit limiter looks (`src/pitLimiter.ts`) are checked against the renderer's by Rust tests that read those files. Palette, grid math and groups exist in both languages because the WebAssembly build only
  turns a scene into pixels, and the editor needs those answers itself while editing (swatches, the
  selection overlay that must line up to the pixel, the group tree). Each Rust module's tests are
  ported from the TypeScript ones; a change to one side is a change to both, tests included.

## Checking a change

`cargo run --release --example render -- --dash <layout.json> <out.png>` in the crate draws one page
of a layout at 800x480 against a fixed mid-race frame (`--page` and
`--size` override; `--banner <banner.json>` draws an alert popup over it, `--alert penalty:full:invert`
the app's preview of an alert type, `--level 35` puts fuel, virtual energy and charge at 35% for the
bars' colors). Render the presets in
`app/Sprint.Desktop.Host/presets/dash/` at the panel size and look at the PNG: layout, alignment,
clip direction, weights and color, not the telemetry values. There is no reference image set in the
repo.

## Contrast

Primary values target at least 7:1 and semantic colors at least 4.5:1 against the dash
background.
