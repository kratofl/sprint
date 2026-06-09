import { primitiveColor, primitiveRadius, primitiveSpace } from '../primitive'

/**
 * Semantic tokens: product meaning.
 *
 * These should be the default API for app and shared UI code.
 */
export const semanticTokens = {
  color: {
    bg: {
      base: primitiveColor.neutral[950],
      deep: primitiveColor.neutral[900],
      canvas: primitiveColor.neutral[950],
    },
    surface: {
      panel: primitiveColor.neutral[850],
      raised: primitiveColor.neutral[800],
      inset: primitiveColor.neutral[750],
      tile4: primitiveColor.neutral[700],
      overlay: primitiveColor.neutral[900],
    },
    text: {
      primary: primitiveColor.neutral[50],
      muted: primitiveColor.neutral[400],
      disabled: primitiveColor.neutral[300],
      inverse: primitiveColor.neutral[800],
    },
    border: {
      default: primitiveColor.neutral[600],
      strong: primitiveColor.neutral[500],
      window: '#404040',
      focus: primitiveColor.orange[500],
    },
    action: {
      primary: primitiveColor.orange[500],
      primaryHover: primitiveColor.orange[400],
      primaryMuted: 'rgba(255,106,0,.13)',
      primaryBorder: 'rgba(255,106,0,.30)',
    },
    status: {
      success: primitiveColor.green[500],
      successMuted: '#05281a',
      successBorder: '#0e7445',
      warning: primitiveColor.yellow[500],
      warningMuted: '#2b2003',
      warningBorder: '#8a6507',
      danger: primitiveColor.red[500],
      dangerMuted: '#3a0a10',
      dangerBorder: '#851727',
      info: primitiveColor.blue[500],
      infoMuted: '#071a30',
      infoBorder: '#11457f',
      primaryMuted: '#33170a',
      primaryBorder: '#9c4505',
    },
    data: {
      driver: primitiveColor.orange[500],
      positive: primitiveColor.green[500],
      negative: primitiveColor.red[500],
      comparison: primitiveColor.blue[500],
      reference: primitiveColor.neutral[300],
    },
    platform: {
      winui: {
        mica: primitiveColor.neutral[850],
        micaAlt: primitiveColor.neutral[900],
        layer: primitiveColor.neutral[800],
        layerAlt: primitiveColor.neutral[750],
        control: primitiveColor.neutral[700],
        controlHover: primitiveColor.neutral[600],
        controlPressed: primitiveColor.neutral[850],
        stroke: primitiveColor.neutral[600],
        strokeSubtle: primitiveColor.neutral[500],
        textPrimary: primitiveColor.neutral[50],
        textSecondary: primitiveColor.neutral[400],
        textTertiary: primitiveColor.neutral[300],
        accent: primitiveColor.orange[500],
        accentMuted: 'rgba(255,106,0,.14)',
      },
    },
  },
  radius: {
    tag: primitiveRadius.badge,
    icon: primitiveRadius.tile,
    badge: primitiveRadius.badge,
    control: primitiveRadius.control,
    card: primitiveRadius.panel,
    panel: primitiveRadius.panel,
    alert: primitiveRadius.alert,
    tile: primitiveRadius.tile,
    pill: primitiveRadius.pill,
  },
  space: {
    inline: primitiveSpace[1],
    row: primitiveSpace[2],
    group: primitiveSpace[3],
    grid: primitiveSpace[4],
    card: primitiveSpace[5],
    page: primitiveSpace[6],
  },
} as const
