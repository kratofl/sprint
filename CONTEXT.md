# Sprint — Domain Glossary

Names for the good seams in this codebase. Keep terms here in sync with the
interface vocabulary used in code and tests. Architecture vocabulary (module,
interface, depth, seam, adapter, leverage, locality) is shared across the repo;
this file names the *domain*.

## Render preferences

**RenderPreferences** — the bundle of global, app-level rendering settings that
every screen painter needs: dash theme, domain palette, format preferences
(units), typography, theme-preset library, and render profile (driver
identity). Lives in package `dashboard`.

The Coordinator owns the single authoritative `RenderPreferences` value and
broadcasts it, via one `ApplyRenderPreferences` method on the `ScreenDriver`
seam, to every registered screen driver and to the editor preview painter. This
replaces six separate `SetGlobal*` broadcast methods that the caller previously
had to invoke (and keep) in sync. A newly-registered device is initialized from
the held bundle, so it never renders with default settings.

Decision (2026-06-21): the bundle holds all six fields and the editor preview
honors format preferences (units), correcting a prior asymmetry where the
preview ignored them.
