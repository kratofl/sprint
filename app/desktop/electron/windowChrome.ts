/**
 * How the main window's chrome is drawn for the current OS state. Pure, so the
 * decision is testable without Electron; `main.ts` applies the result.
 *
 * Windows: Mica is the Windows 11 (22H2+) system backdrop behind the title bar
 * and the navigation pane. When the OS can't draw it, or the user has turned
 * "Transparency effects" off in Windows, the window falls back to the solid
 * `--mica` colour — the same colour Windows itself uses as Mica's fallback.
 * `symbol` colours the overlaid caption buttons.
 *
 * macOS: the sidebar vibrancy material sits behind the whole window; the
 * renderer paints its content opaque and leaves the sidebar translucent. With
 * "Reduce transparency" on there is no vibrancy, only the solid sidebar colour.
 * The traffic lights draw their own colours, so there is no `symbol`.
 *
 * Vibrancy and Mica only exist on their own OS. Off it (the dev look switch in
 * `main.ts`) the look falls back to its solid colour, like the accessibility
 * settings above.
 */
export type WindowChrome =
  | { kind: 'mica'; symbol: string }
  | { kind: 'solid'; background: string; symbol: string }
  | { kind: 'vibrancy' }
  | { kind: 'opaque'; background: string }

/** Which native look the app wears. Linux has none of its own and keeps the Windows look. */
export type WindowLook = 'windows' | 'mac'

export type ChromeInput =
  | { look: 'windows'; dark: boolean; reducedTransparency: boolean; micaSupported: boolean }
  | { look: 'mac'; dark: boolean; reducedTransparency: boolean; vibrancySupported: boolean }

/** Fully transparent, so the system backdrop shows through the page and the caption buttons. */
export const TRANSPARENT = '#00000000'

/** `platform` is `process.platform`. Also sent to the renderer as `?platform=`. */
export function windowLook(platform: string): WindowLook {
  return platform === 'darwin' ? 'mac' : 'windows'
}

/**
 * Chrome colours for the current OS theme. The main process cannot read CSS
 * custom properties, so token values are repeated here: Windows mirrors
 * `--mica` and `--label` in @sprint/tokens/windows.css, macOS mirrors the
 * solid `--sidebar` in @sprint/tokens/macos.css.
 */
export function windowChrome(input: ChromeInput): WindowChrome {
  if (input.look === 'mac') {
    if (input.vibrancySupported && !input.reducedTransparency) return { kind: 'vibrancy' }
    return { kind: 'opaque', background: input.dark ? '#28282a' : '#f6f6f8' }
  }
  const symbol = input.dark ? '#ffffff' : '#1a1a1a'
  if (input.micaSupported && !input.reducedTransparency) return { kind: 'mica', symbol }
  return { kind: 'solid', background: input.dark ? '#202020' : '#f3f3f3', symbol }
}

/** Mica needs Windows 11 22H2, build 22621. `release` is `os.release()`, e.g. `10.0.26200`. */
export function supportsMica(platform: string, release: string): boolean {
  if (platform !== 'win32') return false
  const build = Number(release.split('.')[2])
  return Number.isInteger(build) && build >= 22621
}
