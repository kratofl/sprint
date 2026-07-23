# ADR 0008: Orange has separate UI and wheel semantics

- Status: Accepted
- Date: 2026-07-15
- Scope: Application UI and authored wheel dashboards

## Context

Sprint orange serves the desktop application's brand and interaction language,
but the wheel dashboard is an operational instrument with its own semantic color
requirements. Treating orange as a general accent in both domains would make an
ordinary selected or focal wheel value resemble a warning.

## Decision

Orange has separate semantics in two explicit color domains:

- In the **application UI**, orange is Sprint's restrained brand and interaction
  accent. It may communicate primary action, active state, focus, progress, and
  selection according to Graphite's component rules.
- On an **authored wheel dashboard**, orange is a warning color. It is not applied
  to a value merely because the value is primary, important, or visually focal.

Primary Glance values remain neutral at rest. Color is introduced only when it
adds operational meaning. The application UI may preview or edit wheel colors,
but the previewed dashboard content follows wheel semantics rather than the
surrounding UI accent semantics.

## Consequences

- Orange application chrome must not bleed into the rendered wheel instrument.
- A wheel dashboard's default focal values use high-contrast neutrals unless a
  telemetry state assigns semantic color.
- Selected editor controls may use UI-accent orange outside the preview while the
  selected dashboard object retains its authored or telemetry-semantic color.
- Orange warning thresholds on the wheel require a distinct non-color cue so
  meaning is not dependent on color alone.
- Existing wheel presets that use orange decoratively should be reviewed when
  touched; this decision does not authorize a bulk rewrite during the interview.
