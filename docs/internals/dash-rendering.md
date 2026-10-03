# Dash rendering decisions

Settled rules for the rendered wheel dash: `packages/dashboard`, which drives the editor
preview, the on-screen display and the USB panel output. The dash is hardware output, not
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

## Contrast

Primary values target at least 7:1 and semantic colors at least 4.5:1 against the dash
background.
