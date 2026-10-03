# Sprint Tokens

CSS custom properties for Sprint's two app surfaces. The rules for using them live in
`docs/design/design-system/DESIGN.md` and `docs/DESIGN.md`.

| File | Consumer | What it is |
| --- | --- | --- |
| `windows.css` | Desktop app (`app/desktop`) | Windows Fluent tokens — Mica, content layer, Segoe UI Variable, 4px controls, 8px cards. Light and dark. |
| `web.css` | Web app (`web/`) | Web CI tokens, verbatim from `docs/design/design-system/tokens.css`. Regenerate from `tokens.json`; never edit values here by hand. |

Import one of them as a stylesheet (`@import '@sprint/tokens/windows.css'`). Only the brand and
status scales are shared between the two. A missing token goes into the file for both themes.

The wheel dash (`packages/dashboard`) is hardware output and keeps its own palette; it does not
use these tokens.
