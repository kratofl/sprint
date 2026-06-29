import { primitiveColor, primitiveSpace, primitiveRadius } from '../primitive'
import { semanticTokens } from '../semantic'

/**
 * Component tokens: concrete recipes for reusable UI parts.
 *
 * These map to the Figma `Component` variable set (Button / Input / Badges /
 * Toast / Toggle / Segmented / Nav). Dark-only, single mode.
 */
export const componentTokens = {
  shell: {
    window: {
      // Layout page: app window bg Surface/App, drawn frame border #404040
      bg: semanticTokens.color.bg.app,
      border: semanticTokens.color.border.window,
    },
    titleBar: {
      bg: semanticTokens.color.surface.panel,
      border: semanticTokens.color.border.default,
      text: semanticTokens.color.text.primary,
      mutedText: semanticTokens.color.text.subtle,
      height: '45px',
    },
    commandButton: {
      bg: 'transparent',
      bgHover: semanticTokens.color.surface.inset,
      bgPressed: primitiveColor.neutral[850],
      text: semanticTokens.color.text.muted,
      textHover: semanticTokens.color.text.primary,
      radius: primitiveRadius.xl,
    },
    nav: {
      bg: semanticTokens.color.surface.panel,
      itemBgHover: semanticTokens.color.surface.inset,
      itemBgActive: semanticTokens.color.surface.inset,
      itemText: semanticTokens.color.text.muted,
      itemTextActive: semanticTokens.color.action.primary,
      itemIndicator: semanticTokens.color.action.primary,
      border: semanticTokens.color.border.default,
      radius: primitiveRadius.xl,
    },
    pageHeader: {
      bg: semanticTokens.color.surface.panel,
      border: semanticTokens.color.border.default,
      title: semanticTokens.color.text.primary,
      caption: semanticTokens.color.text.subtle,
    },
  },
  button: {
    paddingX: primitiveSpace[7],  // 16
    paddingY: primitiveSpace[3],  // 6
    radius: primitiveRadius.xl,   // 18
    gap: primitiveSpace[2],       // 4
    primary: {
      bg: semanticTokens.color.action.primary,        // #FF6A00
      bgHover: semanticTokens.color.action.primaryHover,
      text: semanticTokens.color.text.dark,           // #141414
      border: semanticTokens.color.action.primary,
      stroke: semanticTokens.color.action.primaryStroke, // icon-btn inner #FF8636
      radius: primitiveRadius.xl,
      height: '25px',
    },
    secondary: {
      bg: semanticTokens.color.surface.tile,          // #1F1F1F
      text: semanticTokens.color.text.primary,        // #F6F6F6
      icon: semanticTokens.color.text.primary,
      border: semanticTokens.color.border.default,    // #2E2E2E
      radius: primitiveRadius.xl,
      height: '25px',
    },
    destructive: {
      bg: semanticTokens.color.surface.tile,          // #1F1F1F
      text: semanticTokens.color.status.danger,       // #F02744
      border: semanticTokens.color.border.default,
      radius: primitiveRadius.xl,
      height: '25px',
    },
    disabled: {
      bg: semanticTokens.color.surface.panel,         // #141414
      text: semanticTokens.color.text.subtle,         // #7A7A7A
      border: semanticTokens.color.border.default,
      radius: primitiveRadius.xl,
      height: '25px',
    },
  },
  card: {
    bg: semanticTokens.color.surface.panel,
    border: semanticTokens.color.border.default,
    radius: semanticTokens.radius.card,
    padding: semanticTokens.space.card,
  },
  input: {
    bg: semanticTokens.color.surface.tile,            // #1F1F1F
    border: semanticTokens.color.border.default,      // #2E2E2E
    borderFocus: semanticTokens.color.border.focus,   // #FF6A00
    text: semanticTokens.color.text.primary,
    radius: primitiveRadius.xl,                        // 18
    paddingX: primitiveSpace[5],                       // 10
    paddingY: primitiveSpace[4],                       // 8
    height: '32px',
  },
  badge: {
    // {Icon = family/500, Border = family/700, Background = family/950}
    neutral: {
      bg: primitiveColor.neutral[900],
      text: primitiveColor.neutral[300],
      border: primitiveColor.neutral[700],
      radius: primitiveRadius.xxs,
    },
    primary: {
      bg: primitiveColor.orange[950],
      text: primitiveColor.orange[500],
      border: primitiveColor.orange[700],
      radius: primitiveRadius.xxs,
    },
    success: {
      bg: primitiveColor.green[950],
      text: primitiveColor.green[500],
      border: primitiveColor.green[700],
      radius: primitiveRadius.xxs,
    },
    danger: {
      bg: primitiveColor.red[950],
      text: primitiveColor.red[500],
      border: primitiveColor.red[700],
      radius: primitiveRadius.xxs,
    },
    info: {
      bg: primitiveColor.blue[950],
      text: primitiveColor.blue[500],
      border: primitiveColor.blue[700],
      radius: primitiveRadius.xxs,
    },
  },
  toast: {
    bg: semanticTokens.color.surface.tile,            // #1F1F1F
    title: semanticTokens.color.text.primary,         // #F6F6F6
    message: semanticTokens.color.text.muted,         // #A0A0A0
    radius: primitiveRadius.pill,
  },
  toggle: {
    trackOn: semanticTokens.color.status.success,     // #16B566
    trackOff: semanticTokens.color.surface.tile,      // #1F1F1F
    trackOnDisabled: primitiveColor.green[800],       // #0F5B38
    knob: semanticTokens.color.text.primary,          // #F6F6F6
    knobDisabled: primitiveColor.neutral[600],        // #424242
    radius: primitiveRadius.pill,
  },
  segmented: {
    bg: semanticTokens.color.surface.tile,            // #1F1F1F
    border: semanticTokens.color.border.default,
    activeBg: semanticTokens.color.action.primary,    // #FF6A00
    activeText: semanticTokens.color.text.dark,       // #141414
    inactiveText: semanticTokens.color.text.primary,
    radius: primitiveRadius.pill,
  },
  nav: {
    railBg: semanticTokens.color.surface.panel,
    itemBgActive: semanticTokens.color.surface.inset, // #2E2E2E
    itemTextActive: semanticTokens.color.action.primary,
    itemTextIdle: semanticTokens.color.text.muted,
    itemBorderActive: semanticTokens.color.action.primaryBorder,
    radius: primitiveRadius.xl,
  },
  table: {
    rowBorder: semanticTokens.color.border.default,
    headerText: semanticTokens.color.text.muted,
    valueText: semanticTokens.color.text.primary,
    bestText: semanticTokens.color.action.primary,
    invalidText: semanticTokens.color.status.danger,
  },
  dashEditor: {
    well: semanticTokens.color.bg.deep,
    wellTop: semanticTokens.color.bg.deep,
    rail: semanticTokens.color.surface.panel,
    railHead: semanticTokens.color.surface.tile,
    inset: semanticTokens.color.bg.deep,
    seam: semanticTokens.color.bg.deep,
    seamHairline: 'rgba(255,255,255,.022)',
  },
} as const
