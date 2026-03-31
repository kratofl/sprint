/**
 * Shadow tokens — designed for dark UIs.
 *
 * On dark backgrounds, cold black drop shadows have near-zero perceptual contrast
 * and create a "heavy" feeling. The fix:
 *   - Cards use NO drop shadow — border + glass-highlight handle depth.
 *   - Only overlapping surfaces (dropdowns, modals) get a subtle drop shadow.
 *   - Glow effects (warm-tinted) replace shadows on accent-colored interactive elements.
 */
export const shadows = {
  /** Barely-there — only for very tight inset elements */
  sm: '0 1px 2px rgba(0,0,0,0.18)',
  /** Dropdown / popover lift — subtle, not heavy */
  md: '0 2px 8px rgba(0,0,0,0.22)',
  /** Modal / sheet — present but not crushing */
  lg: '0 8px 24px rgba(0,0,0,0.32)',

  /** Warm glow on orange accent interactive elements */
  glow:         '0 0 14px rgba(239,129,24,0.22)',
  /** Warm glow on teal accent interactive elements */
  'glow-teal':  '0 0 14px rgba(30,165,140,0.22)',

  // Legacy aliases — kept for backwards compat, point at new values
  /** @deprecated use shadow-md */
  card:  '0 2px 8px rgba(0,0,0,0.22)',
  /** @deprecated use shadow-lg */
  modal: '0 8px 24px rgba(0,0,0,0.32)',
} as const
