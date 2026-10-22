/**
 * How the main window's chrome is drawn for the current OS state. Pure, so the
 * decision is testable without Electron; `main.ts` applies the result.
 *
 * Windows and Linux: the Sprint brand look, a solid window in the brand's
 * background colour (no Mica: the brand canvas is the same on every OS).
 * `symbol` colours the overlaid caption buttons.
 *
 * macOS: the sidebar vibrancy material sits behind the whole window; the
 * renderer paints its content opaque and leaves the sidebar translucent. With
 * "Reduce transparency" on there is no vibrancy, only the solid sidebar colour.
 * The traffic lights draw their own colours, so there is no `symbol`.
 *
 * Vibrancy only exists on macOS. Off it (the dev look switch in `main.ts`) the
 * Mac look falls back to its solid colour, like the accessibility setting above.
 */
export type WindowChrome =
  | { kind: 'solid'; background: string; symbol: string }
  | { kind: 'vibrancy' }
  | { kind: 'opaque'; background: string }

/** Which look the app wears: the native Mac look, or the brand look everywhere else. */
export type WindowLook = 'windows' | 'mac'

export type ChromeInput =
  | { look: 'windows'; dark: boolean }
  | { look: 'mac'; dark: boolean; reducedTransparency: boolean; vibrancySupported: boolean }

/** Fully transparent, so the system backdrop shows through the page. */
export const TRANSPARENT = '#00000000'

/** `platform` is `process.platform`. Also sent to the renderer as `?platform=`. */
export function windowLook(platform: string): WindowLook {
  return platform === 'darwin' ? 'mac' : 'windows'
}

/**
 * Chrome colours for the current OS theme. The main process cannot read CSS
 * custom properties, so token values are repeated here: the brand look mirrors
 * `--window` and `--label` in @sprint/tokens/desktop.css, macOS mirrors the
 * solid `--sidebar` in @sprint/tokens/macos.css.
 */
export function windowChrome(input: ChromeInput): WindowChrome {
  if (input.look === 'mac') {
    if (input.vibrancySupported && !input.reducedTransparency) return { kind: 'vibrancy' }
    return { kind: 'opaque', background: input.dark ? '#28282a' : '#f6f6f8' }
  }
  return input.dark ? { kind: 'solid', background: '#09090b', symbol: '#ededef' } : { kind: 'solid', background: '#fafafa', symbol: '#18181b' }
}
