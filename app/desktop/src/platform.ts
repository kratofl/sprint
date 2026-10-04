/**
 * The OS look the renderer draws. Electron puts `platform=mac|windows` into the main
 * window's query (electron/windowChrome.ts); anything else, including a plain browser
 * preview without the parameter, is Windows. Parsed once at load: the platform never
 * changes while the page lives. main.tsx mirrors it onto `<html data-platform>` for CSS.
 */
export type Platform = 'windows' | 'mac'

export const platform: Platform = new URLSearchParams(window.location.search).get('platform') === 'mac' ? 'mac' : 'windows'
