# Sprint Tokens

CSS custom properties for Sprint's app surfaces. The rules for using them live in
[`docs/design/DESIGN.md`](../../docs/design/DESIGN.md).

| File | Consumer | What it is |
| --- | --- | --- |
| `desktop.css` | Desktop app (`app/desktop`) | The brand look the desktop wears on Windows and Linux: the web app's neutrals under the desktop's token names, Figtree (bundled by `app/desktop`), 6px controls, 10px cards. Light and dark. The base the macOS overlay sits on. |
| `macos.css` | Desktop app on macOS | An overlay on `desktop.css`, not a standalone file: under `:root[data-platform="mac"]` it redefines every `desktop.css` token with the same name — SF, 8px controls (6px small), 14px cards, sidebar/toolbar materials, tinted inline-alert text. Brand and status scales come from `desktop.css`. `app/desktop/src/macTokens.test.ts` fails when the two files' names drift. |
| `web.css` | Web app (`web/`) | Web CI tokens — the source of truth for web values. Each token's role is in `docs/design/DESIGN.md` ("Web token roles"). |

Import one of them as a stylesheet (`@import '@sprint/tokens/desktop.css'`); the desktop imports
`desktop.css`, then `macos.css`. `desktop.css` copies its neutrals from `web.css`, so a brand change
lands in both. A missing token goes into the file for both themes; a desktop token goes into
`desktop.css` and `macos.css`.

The wheel dash (`packages/dashboard`) is hardware output and keeps its own palette; it does not
use these tokens.
