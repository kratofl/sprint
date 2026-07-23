## Problem Statement

Sprint's desktop application and wheel-dashboard authoring experience do not yet
consistently implement the evolved Graphite product language. Existing UI code
still contains earlier geometry, motion, generic software-status colors, and
dashboard theme assumptions that conflict with the accepted direction.

As a Sprint user, I need every surface to feel like one precise professional
instrument. Live data must be separated and readable under limited attention;
configuration work must stay dense and exact; dashboard colors must carry racing
meaning; and visual refinement must never reduce clarity, accessibility, or
trustworthiness.

Without a coordinated implementation, individual screen or component changes
will continue to create inconsistent gradients, radii, spacing, button priority,
state feedback, telemetry semantics, and accessibility behavior.

## Solution

Implement the evolved Graphite contract across the Avalonia desktop application
and its rendered wheel dashboards as one coherent system.

The application will distinguish Glance and Workbench attentional contexts while
sharing one token-backed visual language. Neutral surfaces will remain solid.
Orange application fills will use a shared top-lit Action, Selection, or Telemetry
material, while thin orange marks remain solid. Components will adopt the agreed
geometry, spacing, typography, direct feedback, focus, availability, state,
optimistic-edit, and destructive-action behavior.

Wheel dashboards will use racing-domain conditions rather than generic software
status names. New dashboards will default to the Functional color system, while
the Styled system will allow intentional palette authorship without changing
Critical, Fault, or RaceControl colors. Existing dashboard themes will migrate
without silently changing their authored appearance.

The result will be verified primarily through Sprint's native Avalonia journey
and visual-smoke harness at both supported window sizes, supplemented by focused
behavioral, serialization, rendering, token, contrast, keyboard, automation, and
accessibility tests.

## User Stories

1. As a driver, I want actual live data to be visually separate from labels and chrome, so that I can read it with minimal attention.
2. As a driver, I want Glance values to remain in stable positions as telemetry changes, so that I do not have to reacquire them.
3. As a driver, I want unavailable telemetry to show an honest placeholder and connection state, so that I never mistake stale data for live data.
4. As a driver, I want primary values to remain neutral at rest, so that semantic colors retain their urgency.
5. As a driver, I want cold or too-low telemetry to use the expected blue treatment, so that I can identify an under-range condition quickly.
6. As a driver, I want TC or ABS intervention to use a distinct AssistActive state, so that blue intervention cannot be confused with cold telemetry.
7. As a driver, I want warnings to be stable orange and critical conditions to be unmistakably red, so that attention matches operational severity.
8. As a driver, I want critical inversion to be tightly bounded and used only for immediate action, so that alerts remain effective rather than exhausting.
9. As a driver, I want race-control signals to retain their literal protocol colors, so that Sprint never reinterprets regulated meanings.
10. As a driver, I want fastest-overall timing to appear purple and personal best timing to appear green, so that lap and sector comparison matches racing expectations.
11. As a driver, I want wheel values, units, and precision to remain spatially stable, so that rapid updates remain readable.
12. As a dash author, I want new dashboards to begin with the Functional color system, so that the safest and clearest mapping is the default.
13. As a dash author, I want complete theme presets with rendered previews and representative-color swatches, so that I can compare the Functional Graphite result with optics-first palettes without understanding an internal color-system model.
14. As a dash author, I want Styled palettes to preserve Critical, Fault, and RaceControl colors, so that visual authorship cannot erase essential meaning.
15. As a dash author, I want existing custom themes to preserve their appearance after migration, so that an update does not silently redesign my dashboard.
16. As a dash author, I want the editor to hide internal Functional/Styled terminology, so that theme selection remains direct and understandable.
17. As a dash author, I want palette presets to remain coherent units without per-condition or legacy accent controls, so that visual changes are predictable.
18. As a dash author, I want the editor preview to use wheel semantics inside the canvas and application semantics outside it, so that the two color domains do not leak into one another.
19. As a dash author, I want alerts previewed without continuous playback, so that I can inspect both stable and inverted phases comfortably.
20. As a desktop user, I want the application to use one solid layered surface hierarchy, so that it feels like one instrument rather than floating cards.
21. As a desktop user, I want orange-filled controls to share one top-lit material language, so that actions and selections feel related and intentional.
22. As a desktop user, I want primary, secondary, and tertiary actions to be visibly distinct, so that the next action is obvious.
23. As a desktop user, I want no more than one primary action in a local action group, so that orange does not compete with itself.
24. As a desktop user, I want ordinary text buttons to remain compact rounded rectangles, so that dense workflows retain alignment and space efficiency.
25. As a desktop user, I want circular icon buttons and capsules used only where their role justifies them, so that shape communicates function.
26. As a desktop user, I want labeled filled-neutral inputs with stable units, so that setup and configuration values are unambiguous.
27. As a desktop user, I want validation to explain the correction without shifting the form unexpectedly, so that errors are easy to resolve.
28. As a desktop user, I want tables to align numeric values and avoid card or zebra-striping noise, so that comparison is fast.
29. As a desktop user, I want charts to preserve the measured data shape, so that smoothing cannot imply values that were not recorded.
30. As a desktop user, I want current and comparison chart series to be visually distinct, so that I can compare telemetry without excess color.
31. As a desktop user, I want reversible edits to apply immediately and save silently, so that routine work feels direct.
32. As a desktop user, I want failed persistence to retain my work and offer recovery, so that optimistic editing does not hide data loss.
33. As a desktop user, I want hardware and remote operations to remain Pending until acknowledged, so that Sprint never claims an external result prematurely.
34. As a desktop user, I want relevant unavailable actions to explain why they cannot run, so that disabled controls are not mysterious.
35. As a desktop user, I want loading, listening, waiting, unavailable, and fault states to be distinct, so that I understand what Sprint is doing.
36. As a desktop user, I want recoverable deletion to offer Undo, so that routine cleanup is quick and safe.
37. As a desktop user, I want irreversible deletion to name the object and consequence, so that I can make an informed decision.
38. As a keyboard user, I want a clear focus ring that remains distinct from selection, so that I always know where the next action will occur.
39. As a pointer user, I want hover, press, focus, and selection feedback to be immediate, so that the interface feels direct.
40. As a pointer user, I want hover never to resize or scale controls, so that dense layouts do not jitter.
41. As a user who reduces motion, I want spatial transitions removed without losing state feedback, so that Sprint remains comfortable and understandable.
42. As a user with low vision, I want primary Glance and wheel values to meet the stricter operational contrast target, so that critical data remains readable.
43. As a user with color-vision differences, I want labels, icons, signs, positions, and threshold direction to reinforce color, so that meaning never depends on hue alone.
44. As a user of Windows contrast themes, I want system colors and focus behavior respected, so that custom styling does not break accessibility.
45. As a user who increases text size, I want controls and content to reflow at 200% text scaling, so that information is not clipped or lost.
46. As a screen-reader user, I want controls and live states to expose accurate names, roles, values, and changes, so that primary journeys are operable without sight.
47. As a user at the minimum window size, I want secondary panes to collapse before operational content shrinks, so that Sprint remains useful at 1120×720.
48. As a user at the default window size, I want the full information hierarchy visible at 1440×900, so that the application uses available space without waste.
49. As a maintainer, I want shared semantic tokens instead of per-component visual values, so that desktop and related consumers stay consistent.
50. As a maintainer, I want one native journey-level visual seam to reveal system-wide regressions, so that visual changes are reviewed in context.
51. As a maintainer, I want focused token, state, serialization, and rendering tests beneath that seam, so that failures identify the affected contract.
52. As a maintainer, I want historical Figma artifacts treated as references rather than authority, so that implementation follows the accepted Graphite contract.

## Implementation Decisions

- The canonical Graphite contract, design glossary, and accepted ADRs govern implementation. Historical Figma artifacts do not override them.
- Implement shared semantic tokens for neutral surfaces, text, edges, the four radius roles, contextual spacing, icon sizes, focus, and motion classes.
- Implement three shared orange fill materials: Action, Selection, and Telemetry. Action is flat `#FF6A00`; active tabs use it and segmented controls use a neutral active fill. Selection is reserved for selected data regions, while Telemetry may use restrained same-family shading. Thin orange functional marks remain solid.
- Keep all neutral surfaces solid. Do not introduce neutral gradients, glass, backdrop blur, ambient glow, metallic shading, or decorative shadows.
- Update application component theming so buttons, inputs, navigation, tables, charts, overlays, icons, focus, availability, validation, loading, and fault states consume shared roles.
- Keep Inter as the application typeface. Use Saira Semi Condensed only for numeric wheel values and Inter for wheel labels. Continuously changing numeric values use tabular figures.
- Implement the four radius roles at 6, 8, 12, and 16 pixels. Circular and capsule shapes remain role-based exceptions.
- Use the Workbench and Glance spacing rhythms from the canonical contract. Responsive layouts collapse or reflow secondary regions before weakening actual-data hierarchy.
- Preserve the 1440×900 default and 1120×720 minimum window sizes.
- Replace duration-on-every-state styling with direct feedback. Color and border state changes are immediate; geometry motion is used only for actual position or size continuity.
- Implement modality-aware keyboard focus as an immediate 2-pixel solid-orange ring with system-color behavior in Windows contrast themes. Selection remains independent.
- Keep the integrated sidebar dimensions and navigation order. Selected navigation uses the brighter neutral raised surface, stronger text, and a solid-orange indicator or icon; hover remains neutral.
- Apply the agreed three-level button hierarchy. Destructive semantics use red, not orange.
- Implement filled-neutral inputs with persistent external labels, stable units, explicit validation, and stable error geometry.
- Implement one outline icon system with 16-pixel control, 20-pixel navigation, and 24-pixel emphasis roles. Icon-only controls require accessible names and tooltips.
- Implement charts with a solid orange current series, solid blue comparison series, optional Telemetry-material area fill, linear continuous data, and stepped discrete state.
- Implement continuous comparison tables with quiet headers, subtle separators, right-aligned tabular numeric values, neutral hover, and Selection-material selection.
- Model Glance readouts explicitly so label, value, unit, reserved format width, stable precision, state, and availability do not shift during live updates.
- Replace stale or unavailable telemetry with an honest placeholder and explicit connection state. Never leave a last-known number visually indistinguishable from live data.
- Replace generic wheel palette concepts with named racing-domain conditions: Neutral, Good/OnTarget, ColdLow, AssistActive, Warning, Critical, Fault, and RaceControl.
- Add the Timing comparison family with fastest-overall, personal-best, and neutral states.
- Retain the dashboard-level Functional or Styled color-system property as an internal persistence and rendering classification. New dashboards default to Functional; the editor does not expose it as a control.
- Migrate dashboards with no explicit palette overrides to Functional. Migrate existing dashboards with explicit theme overrides to Styled so authored appearance is preserved.
- Present complete theme presets with a rendered preview of the current dashboard and a representative-color swatch. Graphite uses Functional racing colors and a neutral swatch; optical presets use their primary accent. Do not expose per-condition or legacy generic accent overrides in the editor.
- Enforce protected Styled states at model validation, editing, persistence, and rendering boundaries: Critical and Fault remain red; RaceControl preserves literal protocol color.
- Keep car-authentic override behavior explicit and profile-scoped. It must not silently change the Functional defaults for other dashboards.
- Implement the attention ladder without decorative motion. Critical wheel inversion is optional, bounded to at most 2Hz, and requires an immediate-action condition. Desktop application alerts never flash.
- Preserve the current wheel canvas and production page information architecture while applying the accepted readout, color, typography, and attention rules.
- Treat reversible local mutations as silent optimistic edits. Preserve unsaved work and expose recovery on persistence failure.
- Model hardware, engineer, invitation, cloud, and other external mutations as Pending, Confirmed, or Failed. Never claim acknowledgement early.
- Implement recoverable deletion with a time-limited Undo affordance. Require consequence-aware confirmation only for irreversible deletion; reserve typed confirmation for unusually broad loss.
- Use one elevated-surface treatment only for physical overlap. Persistent panes and inline content use tone and functional edges without shadows.
- Preserve current primary information architecture and keyboard shortcuts unless a separate product decision changes them.
- Update shared consumers when token or serialized dashboard contracts change. Backend and web changes are required only where an affected shared contract has an active consumer.

## Testing Decisions

- Test externally observable behavior and rendered outcomes rather than private style construction or internal helper calls.
- The highest and primary seam is the native Avalonia journey and visual-smoke harness. It must render every production journey at 1440×900 and 1120×720 and generate inspectable PNG artifacts.
- Add representative Glance, Workbench, navigation, form, table, chart, loading, disconnected, fault, Styled-dashboard, Functional-dashboard, and destructive-action states to the native review matrix.
- Visually inspect every relevant generated artifact before considering the implementation complete. Verify primary content at distance, calm hierarchy at normal viewing distance, and baseline, spacing, border, icon, material, and radius precision close up.
- Extend existing Graphite token tests to cover semantic roles, exact radius and icon-size roles, neutral-surface solidity, orange material direction, focus thickness, and allowed motion classes.
- Extend shell behavior tests for focus-versus-selection, collapsed and expanded navigation, responsive pane behavior, supported window bounds, and keyboard shortcuts.
- Extend headless component tests for immediate visual-state changes, explained unavailable actions, explicit loading/listening/waiting states, stable validation geometry, and accessible names.
- Add contrast checks for every token/background pairing. Enforce 4.5:1 normal text, 3:1 large text and meaningful control boundaries, 7:1 target for primary Glance and wheel values, and 4.5:1 semantic wheel colors.
- Verify primary journeys entirely by keyboard, including logical tab order, arrow-key behavior where appropriate, Enter/Space activation, Escape cancellation, and focus restoration after overlays.
- Verify UI Automation names, roles, values, and state changes with the Windows accessibility tooling used by the repository. Include Narrator smoke coverage for primary journeys.
- Verify Windows contrast themes and 200% text scaling at both supported window sizes. Text and controls must reflow without clipping, overlap, missing actions, or horizontal page scrolling.
- Run color-vision simulations on the application accent states, racing-domain wheel conditions, timing comparison, charts, and alerts. Confirm that non-color cues preserve meaning.
- Add serialization and migration tests for Functional/Styled selection, named condition overrides, protected colors, legacy empty themes, and legacy explicit themes.
- Extend wheel-render tests for Neutral, Good/OnTarget, ColdLow, AssistActive, Warning, Critical, Fault, RaceControl, fastest-overall, and personal-best states.
- Test that Critical inversion never exceeds 2Hz, stops when the condition clears, and is unavailable to non-Critical conditions.
- Test that telemetry formatting reserves width, uses stable units and precision, and never reflows adjacent readouts as representative values change.
- Test that stale, invalid, disconnected, and faulted telemetry never remains visually equivalent to live data.
- Test optimistic persistence success without a success notification, persistence failure with retained edits and retry, and acknowledged operations through Pending, Confirmed, and Failed outcomes.
- Test recoverable deletion through Undo and irreversible deletion through explicit consequence-aware confirmation.
- Run the complete desktop suite, agent UI review, visual-smoke suite, token tests, and affected shared-UI checks after focused tests pass.

## Out of Scope

- Changing Sprint's primary information architecture, navigation destinations, or established keyboard shortcuts.
- Adding new telemetry sources, games, hardware protocols, cloud capabilities, engineer transport, or session-analysis features.
- Redesigning API persistence or introducing backend services solely for visual-system work.
- Rebuilding historical Figma files or making them authoritative.
- Literal imitation of Apple, Ferrari, watchOS, macOS, or native Windows visuals.
- Introducing a light theme, glassmorphism, decorative gradients, ambient glow, carbon fiber, fake metal, racing motifs, or a generic gaming HUD.
- Re-authoring every user-created dashboard into the Functional palette; migration must preserve explicit existing themes as Styled.
- Changing real race-control protocols or car-authentic color mappings beyond the explicit profile mechanism.
- Publishing, deployment, release packaging, or broad unrelated refactoring.

## Further Notes

- This specification implements an already accepted design direction; it does not
  reopen the product-design interview.
- Exact orange material stops remain calibration work within the accepted
  same-family, top-lit system. They must meet the contrast gates and pass native
  visual review before becoming tokens.
- Primary-source research supporting racing-dashboard color semantics and direct
  UI motion is retained in the repository alongside the design documentation.
- The work is intentionally cross-cutting and should be delivered in tracer
  increments that leave the application usable and visually coherent after each
  increment.
