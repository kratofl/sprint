/**
 * How the main window's chrome is drawn for the current OS state. Pure, so the
 * decision is testable without Electron; `main.ts` applies the result.
 *
 * Mica is the Windows 11 (22H2+) system backdrop behind the title bar and the
 * navigation pane. When the OS can't draw it, or the user has turned
 * "Transparency effects" off in Windows, the window falls back to the solid
 * `--mica` colour — the same colour Windows itself uses as Mica's fallback.
 */
export type WindowChrome =
  | { kind: 'mica'; symbol: string }
  | { kind: 'solid'; background: string; symbol: string }

export type ChromeInput = {
  dark: boolean
  reducedTransparency: boolean
  micaSupported: boolean
}

/** Fully transparent, so the system backdrop shows through the page and the caption buttons. */
export const TRANSPARENT = '#00000000'

/**
 * Chrome colours for the current OS theme. These mirror `--mica` and `--label`
 * in @sprint/tokens/windows.css: the main process cannot read CSS custom
 * properties, so the token values are repeated here.
 */
export function windowChrome({ dark, reducedTransparency, micaSupported }: ChromeInput): WindowChrome {
  const symbol = dark ? '#ffffff' : '#1a1a1a'
  if (micaSupported && !reducedTransparency) return { kind: 'mica', symbol }
  return { kind: 'solid', background: dark ? '#202020' : '#f3f3f3', symbol }
}

/** Mica needs Windows 11 22H2, build 22621. `release` is `os.release()`, e.g. `10.0.26200`. */
export function supportsMica(platform: string, release: string): boolean {
  if (platform !== 'win32') return false
  const build = Number(release.split('.')[2])
  return Number.isInteger(build) && build >= 22621
}
