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
    panel: primitiveColor.neutral[925],
    panel2: primitiveColor.neutral[900],
    panel3: primitiveColor.neutral[850],
    line: primitiveColor.neutral[700],
    line2: primitiveColor.neutral[600],
    text: primitiveColor.neutral[50],
    text2: primitiveColor.neutral[400],
    text3: primitiveColor.neutral[500],
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
    radius: primitiveRadius.group,
    r: primitiveRadius.group,
    nested: primitiveRadius.nested,
    control: primitiveRadius.control,
    group: primitiveRadius.group,
    overlay: primitiveRadius.overlay,
    xs: primitiveRadius.xs,
    sm: primitiveRadius.sm,
    md: primitiveRadius.md,
    lg: primitiveRadius.lg,
    xl: primitiveRadius.xl,
    panel: primitiveRadius.panel,
    card: primitiveRadius.card,
    alert: primitiveRadius.alert,
    tile: primitiveRadius.tile,
    icon: primitiveRadius.icon,
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
