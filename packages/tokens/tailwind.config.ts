import type { Config } from 'tailwindcss'

// Atomic token imports.
import { alertRed, orange, heat, cyan, green, neutral, semantic, dataViz } from './src/atoms/colors'
import { fontFamily }                                from './src/atoms/typography'
import { borderRadius }                              from './src/atoms/radii'
import { surfaces, outlineColor, outlineStrongColor } from './src/molecules/surfaces'
import { borders }                                   from './src/molecules/borders'
import { shadows }                                   from './src/molecules/shadows'
import { primitive }                                 from './src/primitive'
import { semanticTokens }                            from './src/semantic'
import { componentTokens }                           from './src/component'

/**
 * Shared design tokens for the Sprint platform.
 * Sprint redesign: true-neutral surfaces, racing orange primary, semantic
 * green/red, and inert compatibility aliases for legacy cyan/glass/glow usage.
 */
const tokens: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primitive: {
          color: primitive.color,
        },
        semantic: {
          bg: semanticTokens.color.bg,
          surface: semanticTokens.color.surface,
          text: semanticTokens.color.text,
          border: semanticTokens.color.border,
          action: semanticTokens.color.action,
          status: semanticTokens.color.status,
          data: semanticTokens.color.data,
          platform: semanticTokens.color.platform,
        },
        component: {
          shell: {
            window: {
              bg: componentTokens.shell.window.bg,
              border: componentTokens.shell.window.border,
            },
            titleBar: {
              bg: componentTokens.shell.titleBar.bg,
              border: componentTokens.shell.titleBar.border,
              text: componentTokens.shell.titleBar.text,
              mutedText: componentTokens.shell.titleBar.mutedText,
            },
            commandButton: {
              hoverBg: componentTokens.shell.commandButton.bgHover,
              pressedBg: componentTokens.shell.commandButton.bgPressed,
              text: componentTokens.shell.commandButton.text,
              hoverText: componentTokens.shell.commandButton.textHover,
            },
            nav: {
              bg: componentTokens.shell.nav.bg,
              itemBgHover: componentTokens.shell.nav.itemBgHover,
              itemBgActive: componentTokens.shell.nav.itemBgActive,
              itemText: componentTokens.shell.nav.itemText,
              itemTextActive: componentTokens.shell.nav.itemTextActive,
              itemIndicator: componentTokens.shell.nav.itemIndicator,
              border: componentTokens.shell.nav.border,
            },
            pageHeader: {
              bg: componentTokens.shell.pageHeader.bg,
              border: componentTokens.shell.pageHeader.border,
              title: componentTokens.shell.pageHeader.title,
              caption: componentTokens.shell.pageHeader.caption,
            },
          },
          button: {
            primary: {
              bg: componentTokens.button.primary.bg,
              text: componentTokens.button.primary.text,
              border: componentTokens.button.primary.border,
            },
            secondary: {
              bg: componentTokens.button.secondary.bg,
              text: componentTokens.button.secondary.text,
              border: componentTokens.button.secondary.border,
            },
            destructive: {
              bg: componentTokens.button.destructive.bg,
              text: componentTokens.button.destructive.text,
              border: componentTokens.button.destructive.border,
            },
          },
          card: {
            bg: componentTokens.card.bg,
            border: componentTokens.card.border,
          },
          input: {
            bg: componentTokens.input.bg,
            border: componentTokens.input.border,
            text: componentTokens.input.text,
          },
          nav: {
            rail: componentTokens.nav.railBg,
            active: componentTokens.nav.itemBgActive,
            activeText: componentTokens.nav.itemTextActive,
          },
        },
        // Shadcn-compatible semantic aliases.
        background: 'var(--bg)',
        foreground: 'var(--text)',
        primary:     { DEFAULT: 'var(--orange)', foreground: '#141414' },
        'primary-foreground': '#141414',
        secondary:   { DEFAULT: 'var(--blue)', foreground: '#ffffff' },
        tertiary:    { DEFAULT: semantic.tertiary, foreground: 'var(--bg)' },
        destructive: { DEFAULT: 'var(--red)', foreground: '#ffffff' },
        success:     { DEFAULT: 'var(--green)', foreground: 'var(--bg)' },
        warning:     { DEFAULT: 'var(--amber)', foreground: '#141414' },
        info:        { DEFAULT: 'var(--blue)', foreground: '#ffffff' },
        heat:        { DEFAULT: heat[500], foreground: '#141414' },
        'border-strong': 'var(--border-2)',
        'bg-panel': 'var(--panel)',
        'bg-panel-2': 'var(--panel-2)',
        'bg-panel-3': 'var(--panel-3)',
        'bg-panel-4': 'var(--panel-4)',

        // Surface hierarchy.
        card:    { DEFAULT: surfaces.container, foreground: 'var(--text)' },
        popover: { DEFAULT: surfaces.overlayPanel, foreground: 'var(--text)' },
        muted:   { DEFAULT: surfaces.elevated, foreground: 'var(--muted)' },
        input:   surfaces.elevated,
        ring:    orange[500],

        // Accent variants for driver-owned primary actions.
        accent: {
          DEFAULT:    orange[500],
          hover:      orange[400],
          dark:       orange[600],
          muted:      'rgba(255,106,0,0.13)',
          border:     'rgba(255,106,0,0.30)',
          foreground: '#141414',
        },

        // Compatibility cyan variants for explicit comparison data only.
        teal: {
          DEFAULT:    cyan[500],
          hover:      cyan[400],
          dark:       cyan[600],
          muted:      'rgba(47,188,193,0.08)',
          border:     'rgba(47,188,193,0.30)',
          foreground: 'var(--bg)',
        },
        cyan,
        orange,
        green,
        red: alertRed,

        // Background and surface scale.
        bg: {
          base:      surfaces.base,
          deep:      surfaces.shell,
          shell:     surfaces.shell,
          container: surfaces.container,
          // backward-compat aliases
          surface:   surfaces.container,
          panel:     surfaces.elevated,
          subtle:    surfaces.elevated,
          elevated:  surfaces.elevated,
          overlay:   surfaces.overlay,
          'overlay-panel': surfaces.overlayPanel,
          inline:    surfaces.variant,
        },

        // Text hierarchy.
        text: {
          primary:   'var(--text)',
          secondary: 'var(--muted)',
          muted:     'var(--muted)',
          disabled:  'var(--muted-2)',
        },

        // "On-surface" aliases matching the HTML reference naming.
        'on-surface':         'var(--text)',
        'on-surface-variant': 'var(--muted)',

        // Border and outline tokens.
        border: {
          DEFAULT: borders.outline,
          base:    borders.outline,
          subtle:  borders.outlineSubtle,
          strong:  outlineStrongColor,
          accent:  borders.accent,
          teal:    borders.teal,
          input:   borders.outlineSubtle,
        },
        outline: outlineColor,

        // Data visualization palette.
        'data-1': dataViz[1],
        'data-2': dataViz[2],
        'data-3': dataViz[3],
        'data-4': dataViz[4],
        'data-5': dataViz[5],
        'data-6': dataViz[6],
      },

      borderRadius,

      fontFamily: {
        display:  fontFamily.display,
        wordmark: fontFamily.wordmark,
        sans:     fontFamily.sans,
        ui:       fontFamily.ui,
        inter:    fontFamily.ui,
        mono:     fontFamily.mono,
        numeric:  fontFamily.numeric,
        saira:    fontFamily.numeric,
        "saira-sc": fontFamily.wordmark,
        space:    fontFamily.display,
        headline: fontFamily.display,
        body:     fontFamily.sans,
      },

      boxShadow: {
        sm:         shadows.sm,
        md:         shadows.md,
        lg:         shadows.lg,
        overlay:    shadows.md,
        panel:      shadows.card,
        window:     shadows.window,
        glow:       shadows.glow,
        'glow-teal':shadows['glow-teal'],
      },
    },
  },
}

export default tokens
