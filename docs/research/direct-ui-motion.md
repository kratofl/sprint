# Direct UI State Changes and Motion

Research date: 2026-07-15

## Conclusion

Yes, with one qualification: immediate state feedback is a strong fit for a modern, precise desktop instrument, but `0ms` is a product choice rather than a universal modern-UI rule. Sprint should change hover, press, focus, selection tint, border, and text color in the same frame as the input. Motion should remain only when it explains continuity, spatial relationship, or the arrival and removal of a surface.

Apple advises avoiding motion in frequent UI interactions, keeping feedback brief, and never making people wait for an animation. Microsoft describes Windows motion as direct and context-appropriate, while specifically recommending visual continuity when elements change position or size. Material supplies motion tokens but scales duration with the size and distance of the change; its existence does not imply that every state change must animate. [Apple Human Interface Guidelines: Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Microsoft: Motion in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/motion), [Material Components: Motion](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)

## Findings by interaction

### Hover, press, focus, and selection

- Use `0ms` for color, tint, border, icon, and focus-indicator changes. Feedback must begin immediately; a desktop pointer may cross many targets quickly, so lingering fades can leave the interface visually behind the pointer.
- Do not delay keyboard focus visibility. The focus indicator should be fully identifiable on the first rendered frame after focus changes.
- A very short effect fade can remain an explicit exception when an instant change is genuinely harsh, but it is not the default. Fluent's smallest current motion recipe is an `83ms` opacity fade, while Apple recommends avoiding motion on frequent interactions. [Microsoft: Motion in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/motion), [Apple Human Interface Guidelines: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- A changed state must remain legible without relying on interpolation. WCAG requires visual information needed to identify component states, including focus, to have at least `3:1` contrast against adjacent colors; it does not require the old and new hover colors to contrast with each other. [W3C: Understanding WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

### Size, position, and layout

- Do not animate geometry as incidental feedback. Buttons, rows, navigation items, telemetry values, focus rings, and pointer targets should not grow, bounce, or shift on hover or selection.
- Animate position or size only when the continuity itself helps the user understand where an element went: expanding detail, resizing a persistent pane, moving an item, or connecting a source with its destination.
- Keep such spatial transitions short and interruptible. A Sprint-specific range of roughly `120–167ms` is defensible: Fluent's direct/existing-element spatial timings begin at `167ms`, while Material says duration should increase with animated area and travel distance. [Microsoft: Motion in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/motion), [Material Components: Motion](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- Never animate layout in response to live telemetry. Updating data must not move neighboring content or defer the newest value.

### Navigation and panes

- Use direct replacement when the destination is obvious from persistent navigation and the layout does not need spatial explanation.
- Use a short fade, about `83–120ms`, when swapping content in a fixed container would otherwise flash or appear broken.
- Use a short directional or connected transition, about `120–167ms`, only when it preserves orientation between hierarchy levels, an item and its detail, or an invoked pane and its entry point. Fluent explicitly frames page and connected transitions as wayfinding tools. [Microsoft: Motion in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/motion)
- Avoid routine full-page choreography and staggered entrances. Apple advises against motion on frequent interactions and says animations must not block further action. [Apple Human Interface Guidelines: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)

### Dialogs and temporary surfaces

- A brief opacity change is enough for most dialogs, menus, tooltips, and popovers. Add a small spatial component only if it communicates the surface's origin.
- Avoid bounce, overshoot, and ornamental scale. These effects add peripheral motion without improving operation.

### Reduced motion

- Respect the Windows animation preference exposed by `UISettings.AnimationsEnabled`; react if the preference changes while Sprint is running. [Microsoft: `UISettings.AnimationsEnabled`](https://learn.microsoft.com/en-us/uwp/api/windows.ui.viewmanagement.uisettings.animationsenabled)
- When animations are disabled, remove spatial movement and size interpolation. Replace necessary orientation cues with an instant state change or a short opacity/color change; do not remove the information the transition conveyed.
- WCAG 2.2 says interaction-triggered motion animation must be disableable unless essential. Its definition distinguishes movement/size animation from color and opacity changes that do not alter perceived size, shape, or position. [W3C: Understanding WCAG 2.2 SC 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## Recommended Sprint rule

Use **direct state change by default, explanatory motion by exception**:

| Change | Default | Allowed exception |
| --- | --- | --- |
| Hover, press, focus, selection color/tint/border | `0ms` | Effect fade up to `83ms` when instant change is visually disruptive |
| Telemetry value or semantic state | `0ms` | No interpolation for ordinary updates |
| Small size/position change that preserves continuity | `120–167ms`, ease-out | Instant when frequent or non-informative |
| Fixed-container content replacement | `0ms` | `83–120ms` crossfade when it clarifies replacement |
| Hierarchical navigation or invoked pane | Direct by default | `120–167ms` connected/directional transition when it aids wayfinding |
| Dialog or overlay | `83–120ms` opacity | Small origin-linked movement, no bounce |
| Reduced motion | `0ms` spatial motion | Brief opacity/color cue only when meaning must be preserved |

This system is quieter and more operationally appropriate than assigning a transition duration to every interaction. It also keeps motion available for the cases where an instantaneous geometry change would be harder to understand.
