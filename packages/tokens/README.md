# Sprint Tokens

Sprint tokens use a three-layer structure that mirrors design-tool variables.

## Layers

- `primitive`: raw values only. Use for Figma variable groups such as `Color / Orange / 500`, `Radius / md`, and `Space / 4`.
- `semantic`: product meaning. Use for app-level decisions such as `color.surface.panel`, `color.action.primary`, or `color.status.danger`.
- `component`: concrete UI recipes. Use for reusable UI parts such as `button.primary.bg`, `card.radius`, `input.borderFocus`, and `dashEditor.rail`.
- `semantic.color.platform.winui`: Windows 11 shell semantics used to make the app feel native without changing Sprint telemetry content.
- `component.shell`: WinUI-inspired shell recipes for titlebar, command buttons, navigation, and page headers.

Application code should prefer semantic or component tokens. Primitive tokens are for palette definition, design tools, and rare one-off visualizations.

Shell code may use `component.shell.*` tokens. Telemetry/content surfaces should continue to use Sprint semantic/component tokens so the app reads as a Windows app frame around a Sprint precision-instrument workspace.

## Exports

- `src/primitive`: Figma-style primitive groups.
- `src/semantic`: product-level aliases composed from primitives.
- `src/component`: component-level recipes composed from semantic tokens.
- `src/figma.ts`: DTCG-style `$type`/`$value` tree for design-tool export.
- `tailwind.config.ts`: Tailwind namespace mapping for `primitive`, `semantic`, and `component`.
- `globals.css`: runtime CSS variables with matching `--primitive-*`, `--semantic-*`, and `--component-*` names.

## Compatibility

Older exports such as `orange`, `green`, `alertRed`, `borderRadius`, `surfaces`, and `borders` remain available. They should be treated as compatibility aliases over the new layer structure.
