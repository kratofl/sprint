// Font stacks for dash widget text. Saira Semi Condensed is reserved for numeric values on
// the rendered wheel-instrument display, which is exactly what this package draws. Labels and
// every other piece of supporting text use Inter.
//
// This package ships no font files — the host app bundles "Saira SemiCondensed" and Inter
// locally; without them these fall back to system-ui.

const LABEL_FONTS = ['Inter', 'system-ui', 'sans-serif']

export const VALUE_FONT_STACK = ['Saira SemiCondensed', 'Saira Semi Condensed', ...LABEL_FONTS].join(', ')
export const LABEL_FONT_STACK = LABEL_FONTS.join(', ')
