import { primitiveColor, primitiveRadius } from './primitive'
import { duration, easing } from './atoms/motion'

/**
 * Canonical product color/radius/motion contract, mirrored by globals.css for
 * the legacy compact variable names (`--bg/--panel/--line/--r`…). Values are the
 * Figma flat-UI scale; the back-compat names point at the closest Figma step.
 */
export const graphiteTokens = {
  color: {
    bg: primitiveColor.neutral[925],     // Surface/App #0F0F0F
    panel: primitiveColor.neutral[900],  // Surface/Panel #141414
    panel2: primitiveColor.neutral[800], // Surface/Tile #1F1F1F
    panel3: primitiveColor.neutral[700], // Surface/Tile 2 #2E2E2E
    line: primitiveColor.neutral[700],   // Border/Default #2E2E2E
    line2: primitiveColor.neutral[600],  // Border/Strong #424242
    text: primitiveColor.neutral[50],    // Text/Default #F6F6F6
    text2: primitiveColor.neutral[300],  // Text/Muted #A0A0A0
    text3: primitiveColor.neutral[400],  // Text/Subtle #7A7A7A
    accent: primitiveColor.orange[500],  // Primary #FF6A00
  },
  status: {
    green: primitiveColor.green[500],    // #16B566
    red: primitiveColor.red[500],        // #F02744
    yellow: primitiveColor.yellow[500],  // #E0A30C
    blue: primitiveColor.blue[500],      // #1F7FE6
    purple: primitiveColor.purple[500],  // #8F76FF
  },
  radius: {
    radius: primitiveRadius.xl,   // 18px
    r: primitiveRadius.xl,        // 18px
    panel: primitiveRadius.xl,    // 18px
    alert: primitiveRadius.md,    // 12px
    control: primitiveRadius.xl,  // 18px
    tile: primitiveRadius.md,     // 12px
    badge: primitiveRadius.xxs,   // 4px
    pill: primitiveRadius.pill,   // 999px
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
