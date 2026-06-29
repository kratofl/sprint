import { componentTokens } from './component'
import { primitive } from './primitive'
import { semanticTokens } from './semantic'

type TokenType = 'color' | 'dimension' | 'fontFamily' | 'duration'
type TokenValue = string | number
type TokenNode = { $type: TokenType; $value: TokenValue } | TokenTree
type TokenTree = { readonly [key: string]: TokenNode }

const typedScale = <T extends Record<string | number, string>>(scale: T, $type: TokenType) =>
  Object.fromEntries(
    Object.entries(scale).map(([key, value]) => [key, { $type, $value: value }]),
  ) as { [K in keyof T]: { $type: TokenType; $value: T[K] } }

/**
 * DTCG-style token tree for design-tool export.
 *
 * Figma collection mapping:
 * - Primitive: `Color / Orange / 500`, `Radius / md`, `Space / 4`
 * - Semantic: `Color / Surface / Panel`, `Color / Action / Primary`
 * - Component: `Button / Primary / Bg`, `Dash Editor / Rail`
 */
export const figmaTokens = {
  primitive: {
    color: {
      orange: typedScale(primitive.color.orange, 'color'),
      green: typedScale(primitive.color.green, 'color'),
      red: typedScale(primitive.color.red, 'color'),
      yellow: typedScale(primitive.color.yellow, 'color'),
      blue: typedScale(primitive.color.blue, 'color'),
      purple: typedScale(primitive.color.purple, 'color'),
      neutral: typedScale(primitive.color.neutral, 'color'),
    },
    radius: typedScale(primitive.radius, 'dimension'),
    space: typedScale(primitive.space, 'dimension'),
  },
  semantic: {
    color: {
      bg: {
        base: { $type: 'color', $value: semanticTokens.color.bg.base },
        deep: { $type: 'color', $value: semanticTokens.color.bg.deep },
        canvas: { $type: 'color', $value: semanticTokens.color.bg.canvas },
      },
      surface: {
        panel: { $type: 'color', $value: semanticTokens.color.surface.panel },
        raised: { $type: 'color', $value: semanticTokens.color.surface.raised },
        inset: { $type: 'color', $value: semanticTokens.color.surface.inset },
        overlay: { $type: 'color', $value: semanticTokens.color.surface.overlay },
      },
      text: {
        primary: { $type: 'color', $value: semanticTokens.color.text.primary },
        muted: { $type: 'color', $value: semanticTokens.color.text.muted },
        disabled: { $type: 'color', $value: semanticTokens.color.text.disabled },
      },
      action: {
        primary: { $type: 'color', $value: semanticTokens.color.action.primary },
        primaryMuted: { $type: 'color', $value: semanticTokens.color.action.primaryMuted },
      },
      status: {
        success: { $type: 'color', $value: semanticTokens.color.status.success },
        warning: { $type: 'color', $value: semanticTokens.color.status.warning },
        danger: { $type: 'color', $value: semanticTokens.color.status.danger },
        info: { $type: 'color', $value: semanticTokens.color.status.info },
      },
      border: {
        default: { $type: 'color', $value: semanticTokens.color.border.default },
        strong: { $type: 'color', $value: semanticTokens.color.border.strong },
      },
    },
    radius: typedScale(semanticTokens.radius, 'dimension'),
    space: typedScale(semanticTokens.space, 'dimension'),
  },
  component: {
    shell: {
      window: {
        bg: { $type: 'color', $value: componentTokens.shell.window.bg },
        border: { $type: 'color', $value: componentTokens.shell.window.border },
      },
      titleBar: {
        bg: { $type: 'color', $value: componentTokens.shell.titleBar.bg },
        text: { $type: 'color', $value: componentTokens.shell.titleBar.text },
        height: { $type: 'dimension', $value: componentTokens.shell.titleBar.height },
      },
      nav: {
        bg: { $type: 'color', $value: componentTokens.shell.nav.bg },
        activeBg: { $type: 'color', $value: componentTokens.shell.nav.itemBgActive },
        activeText: { $type: 'color', $value: componentTokens.shell.nav.itemTextActive },
        indicator: { $type: 'color', $value: componentTokens.shell.nav.itemIndicator },
      },
      pageHeader: {
        bg: { $type: 'color', $value: componentTokens.shell.pageHeader.bg },
        border: { $type: 'color', $value: componentTokens.shell.pageHeader.border },
      },
    },
    button: {
      primary: {
        bg: { $type: 'color', $value: componentTokens.button.primary.bg },
        text: { $type: 'color', $value: componentTokens.button.primary.text },
        border: { $type: 'color', $value: componentTokens.button.primary.border },
        radius: { $type: 'dimension', $value: componentTokens.button.primary.radius },
      },
      secondary: {
        bg: { $type: 'color', $value: componentTokens.button.secondary.bg },
        text: { $type: 'color', $value: componentTokens.button.secondary.text },
        border: { $type: 'color', $value: componentTokens.button.secondary.border },
        radius: { $type: 'dimension', $value: componentTokens.button.secondary.radius },
      },
    },
    card: {
      bg: { $type: 'color', $value: componentTokens.card.bg },
      border: { $type: 'color', $value: componentTokens.card.border },
      radius: { $type: 'dimension', $value: componentTokens.card.radius },
      padding: { $type: 'dimension', $value: componentTokens.card.padding },
    },
    input: {
      bg: { $type: 'color', $value: componentTokens.input.bg },
      border: { $type: 'color', $value: componentTokens.input.border },
      borderFocus: { $type: 'color', $value: componentTokens.input.borderFocus },
      radius: { $type: 'dimension', $value: componentTokens.input.radius },
    },
    dashEditor: {
      well: { $type: 'color', $value: componentTokens.dashEditor.well },
      rail: { $type: 'color', $value: componentTokens.dashEditor.rail },
      railHead: { $type: 'color', $value: componentTokens.dashEditor.railHead },
      inset: { $type: 'color', $value: componentTokens.dashEditor.inset },
      seam: { $type: 'color', $value: componentTokens.dashEditor.seam },
    },
  },
} as const satisfies TokenTree
