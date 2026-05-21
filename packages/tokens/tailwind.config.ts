import type { Config } from 'tailwindcss'

// Atomic token imports.
import { orange, cyan, neutral, semantic, dataViz } from './src/atoms/colors'
import { fontFamily }                                from './src/atoms/typography'
import { borderRadius }                              from './src/atoms/radii'
import { surfaces, outlineColor, outlineStrongColor } from './src/molecules/surfaces'
import { borders }                                   from './src/molecules/borders'

/**
 * Shared design tokens for the Sprint platform.
 * "Pitwall" aesthetic: HUD terminal look, Space Grotesk, solid outline borders,
 * orange primary (#ff906c) + cyan secondary (#5af8fb).
 */
const tokens: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Shadcn-compatible semantic aliases.
        primary:     { DEFAULT: orange[500], foreground: '#000000' },
        secondary:   { DEFAULT: cyan[500],   foreground: '#000000' },
        tertiary:    { DEFAULT: semantic.tertiary, foreground: '#000000' },
        destructive: { DEFAULT: semantic.destructive, foreground: '#ffffff' },
        success:     { DEFAULT: semantic.success,     foreground: '#000000' },
        warning:     { DEFAULT: semantic.warning,     foreground: '#000000' },

        // Surface hierarchy.
        background: surfaces.base,
        foreground: neutral[100],
        card:    { DEFAULT: surfaces.base, foreground: neutral[100] },
        popover: { DEFAULT: surfaces.overlayPanel, foreground: neutral[100] },
        muted:   { DEFAULT: surfaces.variant, foreground: neutral[400] },
        input:   surfaces.base,
        ring:    orange[500],

        // Accent variants for driver-owned primary actions.
        accent: {
          DEFAULT:    orange[500],
          hover:      orange[400],
          dark:       orange[600],
          muted:      'rgba(255,144,108,0.08)',
          border:     'rgba(255,144,108,0.30)',
          foreground: '#000000',
        },

        // Secondary cyan variants.
        teal: {
          DEFAULT:    cyan[500],
          hover:      cyan[400],
          dark:       cyan[600],
          muted:      'rgba(90,248,251,0.08)',
          border:     'rgba(90,248,251,0.30)',
          foreground: '#000000',
        },

        // Background and surface scale.
        bg: {
          base:      surfaces.base,
          shell:     surfaces.shell,
          container: surfaces.container,
          // backward-compat aliases
          surface:   surfaces.container,
          panel:     surfaces.variant,
          subtle:    surfaces.variant,
          elevated:  surfaces.elevated,
          overlay:   surfaces.overlay,
          'overlay-panel': surfaces.overlayPanel,
        },

        // Text hierarchy.
        text: {
          primary:   neutral[100],
          secondary: neutral[300],
          muted:     neutral[400],
          disabled:  neutral[500],
        },

        // "On-surface" aliases matching the HTML reference naming.
        'on-surface':         neutral[100],
        'on-surface-variant': neutral[400],

        // Border and outline tokens.
        border: {
          DEFAULT: borders.outline,
          base:    borders.outline,
          subtle:  borders.outlineSubtle,
          // keep 'strong' alias for any focus ring overrides
          strong:  outlineStrongColor,
          accent:  borders.accent,
          teal:    borders.teal,
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
        sans:     fontFamily.sans,
        mono:     fontFamily.mono,
        headline: fontFamily.display,
        body:     fontFamily.sans,
      },

      boxShadow: {
        overlay:    '0 8px 24px rgba(0,0,0,0.40)',
        panel:      '0 2px 8px rgba(0,0,0,0.30)',
        glow:       '0 0 14px rgba(255,144,108,0.25)',
        'glow-teal':'0 0 14px rgba(90,248,251,0.20)',
      },
    },
  },
}

export default tokens
