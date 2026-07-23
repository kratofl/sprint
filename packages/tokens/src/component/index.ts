import { semanticTokens } from '../semantic'

/**
 * Component tokens: concrete recipes for reusable UI parts.
 *
 * These map to Figma component-variable groups such as
 * `Button / Primary / Background`.
 */
export const componentTokens = {
  shell: {
    window: {
      bg: semanticTokens.color.platform.winui.micaAlt,
      border: semanticTokens.color.border.window,
    },
    titleBar: {
      bg: semanticTokens.color.platform.winui.mica,
      border: semanticTokens.color.platform.winui.strokeSubtle,
      text: semanticTokens.color.platform.winui.textPrimary,
      mutedText: semanticTokens.color.platform.winui.textTertiary,
      height: '32px',
    },
    commandButton: {
      bg: 'transparent',
      bgHover: semanticTokens.color.platform.winui.controlHover,
      bgPressed: semanticTokens.color.platform.winui.controlPressed,
      text: semanticTokens.color.platform.winui.textSecondary,
      textHover: semanticTokens.color.platform.winui.textPrimary,
      radius: '6px',
    },
    nav: {
      bg: semanticTokens.color.platform.winui.mica,
      itemBgHover: semanticTokens.color.platform.winui.controlHover,
      itemBgActive: semanticTokens.color.surface.inset,
      itemText: semanticTokens.color.platform.winui.textTertiary,
      itemTextActive: semanticTokens.color.platform.winui.textPrimary,
      itemIndicator: semanticTokens.color.platform.winui.accent,
      border: semanticTokens.color.platform.winui.strokeSubtle,
      radius: semanticTokens.radius.control,
    },
    pageHeader: {
      bg: semanticTokens.color.platform.winui.layer,
      border: semanticTokens.color.platform.winui.strokeSubtle,
      title: semanticTokens.color.platform.winui.textPrimary,
      caption: semanticTokens.color.platform.winui.textTertiary,
    },
  },
  button: {
    primary: {
      bg: semanticTokens.color.action.primary,
      bgHover: semanticTokens.color.action.primaryHover,
      text: semanticTokens.color.text.inverse,
      border: semanticTokens.color.action.primary,
      radius: semanticTokens.radius.control,
      height: '25px',
    },
    secondary: {
      bg: semanticTokens.color.surface.raised,
      text: semanticTokens.color.text.primary,
      border: semanticTokens.color.border.default,
      radius: semanticTokens.radius.control,
      height: '25px',
    },
    destructive: {
      bg: semanticTokens.color.status.dangerMuted,
      bgHover: semanticTokens.color.status.dangerMuted,
      text: semanticTokens.color.status.danger,
      border: semanticTokens.color.status.dangerBorder,
      radius: semanticTokens.radius.control,
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
    bg: semanticTokens.color.surface.raised,
    border: semanticTokens.color.border.default,
    borderFocus: semanticTokens.color.border.focus,
    text: semanticTokens.color.text.primary,
    radius: semanticTokens.radius.control,
    height: '32px',
  },
  badge: {
    neutral: {
      bg: semanticTokens.color.surface.raised,
      text: semanticTokens.color.text.muted,
      border: semanticTokens.color.border.default,
      radius: semanticTokens.radius.badge,
    },
    primary: {
      bg: semanticTokens.color.action.primaryMuted,
      text: semanticTokens.color.action.primary,
      border: semanticTokens.color.action.primaryBorder,
      radius: semanticTokens.radius.badge,
    },
    success: {
      bg: semanticTokens.color.status.successMuted,
      text: semanticTokens.color.status.success,
      border: semanticTokens.color.status.successBorder,
      radius: semanticTokens.radius.badge,
    },
    danger: {
      bg: semanticTokens.color.status.dangerMuted,
      text: semanticTokens.color.status.danger,
      border: semanticTokens.color.status.dangerBorder,
      radius: semanticTokens.radius.badge,
    },
  },
  nav: {
    railBg: semanticTokens.color.bg.deep,
    itemBgActive: semanticTokens.color.surface.inset,
    itemTextActive: semanticTokens.color.text.primary,
    itemTextIdle: semanticTokens.color.text.muted,
    itemBorderActive: semanticTokens.color.action.primaryBorder,
    radius: semanticTokens.radius.control,
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
    wellTop: semanticTokens.color.bg.base,
    rail: semanticTokens.color.surface.panel,
    railHead: semanticTokens.color.surface.raised,
    inset: semanticTokens.color.bg.base,
    seam: semanticTokens.color.bg.deep,
    seamHairline: 'rgba(255,255,255,.022)',
  },
} as const
