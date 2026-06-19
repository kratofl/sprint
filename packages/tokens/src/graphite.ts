import { primitiveColor, primitiveRadius } from './primitive'
import { duration, easing } from './atoms/motion'

/**
 * Canonical Graphite product tokens.
 *
 * This is the public contract mirrored by globals.css for desktop and shared UI
 * consumers that need the compact Graphite variable names.
 */
export const graphiteTokens = {
  color: {
    bg: primitiveColor.neutral[950],
    panel: primitiveColor.neutral[900],
    panel2: primitiveColor.neutral[800],
    panel3: primitiveColor.neutral[750],
    line: primitiveColor.neutral[600],
    line2: primitiveColor.neutral[500],
    text: primitiveColor.neutral[50],
    text2: primitiveColor.neutral[400],
    text3: primitiveColor.neutral[300],
    accent: primitiveColor.orange[500],
  },
  status: {
    green: primitiveColor.green[500],
    red: primitiveColor.red[500],
    yellow: primitiveColor.yellow[500],
    blue: primitiveColor.blue[500],
    purple: primitiveColor.purple[500],
  },
  radius: {
    radius: primitiveRadius.panel,
    r: primitiveRadius.panel,
    panel: primitiveRadius.panel,
    alert: primitiveRadius.alert,
    control: primitiveRadius.control,
    tile: primitiveRadius.tile,
    badge: primitiveRadius.badge,
    pill: primitiveRadius.pill,
  },
  motion: {
    instant: duration.instant,
    fast: duration.fast,
    normal: duration.normal,
    slow: duration.slow,
    ease: easing.default,
    easeOut: easing.out,
    easeIn: easing.in,
  },
} as const
