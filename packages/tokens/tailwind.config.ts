import type { Config } from 'tailwindcss'

// ── Atomic token imports ───────────────────────────────────────────────────
import { orange, teal, neutral, semantic, dataViz } from './src/atoms/colors'
import { fontFamily }                                from './src/atoms/typography'
import { borderRadius }                              from './src/atoms/radii'
import { surfaces }                                  from './src/molecules/surfaces'
import { borders }                                   from './src/molecules/borders'

/**
 * Shared design tokens for the Sprint platform.
 * "Kinetic Monolith" aesthetic: tonal depth, no-border rule, Space Grotesk,
 * glassmorphism for overlays only.
 */
const tokens: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Shadcn-compatible semantic aliases ───────────────────────────
        primary:     { DEFAULT: orange[500], foreground: '#FFFFFF' },
        secondary:   { DEFAULT: teal[500],   foreground: '#FFFFFF' },
        tertiary:    { DEFAULT: semantic.tertiary, foreground: '#000000' },
        destructive: { DEFAULT: semantic.destructive, foreground: '#FFFFFF' },
        success:     { DEFAULT: semantic.success,     foreground: '#FFFFFF' },
        warning:     { DEFAULT: semantic.warning,     foreground: '#000000' },

        // ── Surface hierarchy (tonal depth) ─────────────────────────────
        background: surfaces.base,
        foreground: neutral[100],
        card:    { DEFAULT: surfaces.surface,  foreground: neutral[100] },
        popover: { DEFAULT: surfaces.overlay,  foreground: neutral[100] },
        muted:   { DEFAULT: surfaces.elevated, foreground: neutral[300] },
        input:   surfaces.elevated,
        ring:    orange[500],

        // ── Accent variants — orange (driver-owned / primary) ────────────
        accent: {
          DEFAULT:    orange[500],
          hover:      orange[400],
          dark:       orange[600],
          muted:      'rgba(255,144,108,0.12)',
          border:     'rgba(255,144,108,0.30)',
          foreground: '#FFFFFF',
        },

        // ── Teal variants — teal (engineer-originated / secondary) ───────
        teal: {
          DEFAULT:    teal[500],
          hover:      teal[400],
          dark:       teal[600],
          muted:      'rgba(30,165,140,0.12)',
          border:     'rgba(30,165,140,0.30)',
          foreground: '#FFFFFF',
        },

        // ── Background scale ─────────────────────────────────────────────
        bg: {
          base:     surfaces.base,
          subtle:   neutral[900],
          surface:  surfaces.surface,
          elevated: surfaces.elevated,
          overlay:  surfaces.overlay,
        },

        // ── Text hierarchy ───────────────────────────────────────────────
        text: {
          primary:   neutral[100],
          secondary: neutral[300],
          muted:     neutral[400],
          disabled:  neutral[500],
        },

        // ── Ghost borders — functional separation only ────────────────────
        border: {
          DEFAULT:     borders.ghost,
          base:        borders.ghost,
          subtle:      borders.ghostSubtle,
          strong:      borders.ghostStrong,
          accent:      borders.accent,
          teal:        borders.teal,
        },

        // ── Data visualization palette ───────────────────────────────────
        'data-1': dataViz[1],
        'data-2': dataViz[2],
        'data-3': dataViz[3],
        'data-4': dataViz[4],
        'data-5': dataViz[5],
        'data-6': dataViz[6],
      },

      borderRadius,

      fontFamily: {
        display: fontFamily.display,
        sans:    fontFamily.sans,
        mono:    fontFamily.mono,
      },

      boxShadow: {
        // Tinted ambient shadows for floating surfaces only
        overlay:    '0 8px 24px rgba(0,0,0,0.32)',
        panel:      '0 2px 8px rgba(0,0,0,0.22)',
        glow:       '0 0 14px rgba(255,144,108,0.22)',
        'glow-teal':'0 0 14px rgba(30,165,140,0.22)',
      },
    },
  },
}

export default tokens
