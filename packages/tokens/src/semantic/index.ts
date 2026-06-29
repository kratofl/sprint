import { primitiveColor, primitiveRadius, primitiveSpace } from '../primitive'

/**
 * Semantic tokens: product meaning. Dark-only, single mode.
 *
 * Mirrors the Figma `Semantic` variable set exactly (Surface / Text / Border /
 * Primary / Success / Error / Warning / Info). This is the default API for app
 * and shared UI code.
 */
export const semanticTokens = {
  color: {
    bg: {
      // Surface/Screen — dash canvas, darkest
      base: primitiveColor.neutral[990],
      deep: primitiveColor.neutral[990],
      canvas: primitiveColor.neutral[990],
      // Surface/App — app window body
      app: primitiveColor.neutral[925],
    },
    surface: {
      // Surface/App #0F0F0F
      app: primitiveColor.neutral[925],
      // Surface/Panel #141414 — sidebar, side panels
      panel: primitiveColor.neutral[900],
      // Surface/Tile #1F1F1F — controls, inputs, tiles
      raised: primitiveColor.neutral[800],
      tile: primitiveColor.neutral[800],
      // Surface/Tile 2 #2E2E2E — hover/selected
      inset: primitiveColor.neutral[700],
      tile2: primitiveColor.neutral[700],
      // Surface/Tile 3 #424242
      tile3: primitiveColor.neutral[600],
      tile4: primitiveColor.neutral[700],
      // Surface/Screen #050505 — solid overlay backdrops
      overlay: primitiveColor.neutral[990],
    },
    text: {
      // Text/Default #F6F6F6
      primary: primitiveColor.neutral[50],
      // Text/Muted #A0A0A0
      muted: primitiveColor.neutral[300],
      // Text/Subtle #7A7A7A
      subtle: primitiveColor.neutral[400],
      disabled: primitiveColor.neutral[400],
      // Text/Dark #141414 — text on accent/light fills
      dark: primitiveColor.neutral[900],
      inverse: primitiveColor.neutral[900],
    },
    border: {
      // Border/Default #2E2E2E
      default: primitiveColor.neutral[700],
      // Border/Strong #424242
      strong: primitiveColor.neutral[600],
      // Drawn window frame (Layout page)
      window: '#404040',
      focus: primitiveColor.orange[500],
    },
    action: {
      // Primary/Primary — Orange/500 #FF6A00
      primary: primitiveColor.orange[500],
      primaryHover: primitiveColor.orange[400],
      // Primary text on accent = Text/Dark
      primaryText: primitiveColor.neutral[900],
      // Primary/Border — Orange/700 #BF4D00
      primaryBorder: primitiveColor.orange[700],
      // Icon-button inner stroke — Orange/400 #FF8636
      primaryStroke: primitiveColor.orange[400],
      // Primary/BG-Soft — #FF6A001A (10% orange)
      primaryMuted: '#FF6A001A',
    },
    status: {
      // Success — Green 500 / 700 / 950
      success: primitiveColor.green[500],
      successBorder: primitiveColor.green[700],
      successMuted: primitiveColor.green[950],
      // Warning — Yellow 500 / 700 / 950
      warning: primitiveColor.yellow[500],
      warningBorder: primitiveColor.yellow[700],
      warningMuted: primitiveColor.yellow[950],
      // Error — Red 500 / 800 / 950
      danger: primitiveColor.red[500],
      dangerBorder: primitiveColor.red[800],
      dangerMuted: primitiveColor.red[950],
      // Info — Blue 500 / 700 / 950
      info: primitiveColor.blue[500],
      infoBorder: primitiveColor.blue[700],
      infoMuted: primitiveColor.blue[950],
      // Primary status channel
      primaryMuted: '#FF6A001A',
      primaryBorder: primitiveColor.orange[700],
    },
    data: {
      driver: primitiveColor.orange[500],
      positive: primitiveColor.green[500],
      negative: primitiveColor.red[500],
      comparison: primitiveColor.blue[500],
      reference: primitiveColor.neutral[300],
    },
  },
  radius: {
    tag: primitiveRadius.xxs,
    icon: primitiveRadius.md,
    badge: primitiveRadius.xxs,
    control: primitiveRadius.xl,
    card: primitiveRadius.xl,
    panel: primitiveRadius.xl,
    alert: primitiveRadius.md,
    tile: primitiveRadius.md,
    pill: primitiveRadius.pill,
  },
  space: {
    inline: primitiveSpace[2],   // 4px
    row: primitiveSpace[3],      // 6px
    group: primitiveSpace[4],    // 8px
    grid: primitiveSpace[5],     // 10px
    card: primitiveSpace[6],     // 14px
    page: primitiveSpace[7],     // 16px
  },
} as const
