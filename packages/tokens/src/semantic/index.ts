import { primitiveColor, primitiveRadius, primitiveSpace } from '../primitive'

/**
 * Semantic tokens: product meaning.
 *
 * These should be the default API for app and shared UI code.
 */
export const semanticTokens = {
  material: {
    orange: {
      action: '#FF6A00',
      selection: 'linear-gradient(180deg, #7A3204 0%, #421A02 100%)',
      telemetry: 'linear-gradient(180deg, #FF9F0A 0%, #FF6A00 100%)',
    },
  },
  color: {
    bg: {
      base: primitiveColor.neutral[950],
      deep: primitiveColor.neutral[950],
      canvas: primitiveColor.neutral[950],
    },
    surface: {
      panel: primitiveColor.neutral[925],
      raised: primitiveColor.neutral[900],
      inset: primitiveColor.neutral[850],
      tile4: primitiveColor.neutral[800],
      overlay: primitiveColor.neutral[950],
    },
    text: {
      primary: primitiveColor.neutral[50],
      muted: primitiveColor.neutral[400],
      disabled: primitiveColor.neutral[500],
      inverse: primitiveColor.neutral[900],
    },
    border: {
      default: primitiveColor.neutral[700],
      strong: primitiveColor.neutral[600],
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
      successMuted: primitiveColor.green[950],
      successBorder: primitiveColor.green[700],
      warning: primitiveColor.yellow[500],
      warningMuted: primitiveColor.yellow[950],
      warningBorder: primitiveColor.yellow[700],
      danger: primitiveColor.red[500],
      dangerMuted: primitiveColor.red[950],
      dangerBorder: primitiveColor.red[800],
      info: primitiveColor.blue[500],
      infoMuted: primitiveColor.blue[950],
      infoBorder: primitiveColor.blue[700],
      primaryMuted: 'rgba(255,106,0,.13)',
      primaryBorder: primitiveColor.orange[700],
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
        mica: primitiveColor.neutral[925],
        micaAlt: primitiveColor.neutral[950],
        layer: primitiveColor.neutral[900],
        layerAlt: primitiveColor.neutral[850],
        control: primitiveColor.neutral[900],
        controlHover: primitiveColor.neutral[850],
        controlPressed: primitiveColor.neutral[925],
        stroke: primitiveColor.neutral[700],
        strokeSubtle: primitiveColor.neutral[600],
        textPrimary: primitiveColor.neutral[50],
        textSecondary: primitiveColor.neutral[400],
        textTertiary: primitiveColor.neutral[300],
        accent: primitiveColor.orange[500],
        accentMuted: 'rgba(255,106,0,.14)',
      },
    },
  },
  radius: {
    nested: primitiveRadius.nested,
    control: primitiveRadius.control,
    group: primitiveRadius.group,
    overlay: primitiveRadius.overlay,
    tag: primitiveRadius.nested,
    icon: primitiveRadius.nested,
    badge: primitiveRadius.nested,
    card: primitiveRadius.group,
    panel: primitiveRadius.group,
    alert: primitiveRadius.overlay,
    tile: primitiveRadius.group,
    pill: primitiveRadius.pill,
  },
  icon: {
    control: '16px',
    navigation: '20px',
    emphasis: '24px',
  },
  focus: {
    color: primitiveColor.orange[500],
    thickness: '2px',
  },
  motion: {
    feedback: '0ms',
    contentFade: '100ms',
    spatial: '160ms',
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
