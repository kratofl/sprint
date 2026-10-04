# Sprint Tokens

CSS custom properties for Sprint's app surfaces. The rules for using them live in
[`docs/design/DESIGN.md`](../../docs/design/DESIGN.md).

| File | Consumer | What it is |
| --- | --- | --- |
| `windows.css` | Desktop app (`app/desktop`) | Windows Fluent tokens — Mica, content layer, Segoe UI Variable, 4px controls, 8px cards. Light and dark. The base the macOS overlay sits on. |
| `macos.css` | Desktop app on macOS | An overlay on `windows.css`, not a standalone file: under `:root[data-platform="mac"]` it redefines every `windows.css` token with the same name — SF, 8px controls (6px small), 14px cards, sidebar/toolbar materials, tinted inline-alert text. Brand and status scales come from `windows.css`. `app/desktop/src/macTokens.test.ts` fails when the two files' names drift. |
| `web.css` | Web app (`web/`) | Web CI tokens — the source of truth for web values. Each token's role is in `docs/design/DESIGN.md` ("Web token roles"). |

Import one of them as a stylesheet (`@import '@sprint/tokens/windows.css'`); the desktop imports
`windows.css`, then `macos.css`. Only the brand and status scales are shared between desktop and web.
A missing token goes into the file for both themes; a desktop token goes into `windows.css` and
`macos.css`.

The wheel dash (`packages/dashboard`) is hardware output and keeps its own palette; it does not
use these tokens.
