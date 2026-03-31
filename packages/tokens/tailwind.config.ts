import type { Config } from 'tailwindcss'

// ── Atomic token imports ───────────────────────────────────────────────────
import { orange, teal, neutral, semantic, dataViz } from './src/atoms/colors'
import { fontFamily }                                from './src/atoms/typography'
import { borderRadius }                              from './src/atoms/radii'
import { surfaces, solidBorder }                     from './src/molecules/surfaces'

/**
 * Shared design tokens for the Sprint platform.
 * Flat data-app aesthetic: solid surfaces, visible borders, near-zero radius.
 */
const tokens: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Shadcn-compatible semantic aliases ───────────────────────────
        primary:     { DEFAULT: orange[500], foreground: '#FFFFFF' },
        secondary:   { DEFAULT: teal[500],   foreground: '#FFFFFF' },
        destructive: { DEFAULT: semantic.destructive, foreground: '#FFFFFF' },
        success:     { DEFAULT: semantic.success,     foreground: '#FFFFFF' },
        warning:     { DEFAULT: semantic.warning,     foreground: '#000000' },

        // ── Surface hierarchy ────────────────────────────────────────────
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
          muted:      'rgba(239,129,24,0.12)',
          border:     'rgba(239,129,24,0.45)',
          foreground: '#FFFFFF',
        },

        // ── Teal variants — teal (engineer-originated / secondary) ───────
        teal: {
          DEFAULT:    teal[500],
          hover:      teal[400],
          dark:       teal[600],
          muted:      'rgba(30,165,140,0.12)',
          border:     'rgba(30,165,140,0.45)',
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

        // ── Borders — solid, structural ───────────────────────────────────
        border: {
          DEFAULT: solidBorder.DEFAULT,
          base:    solidBorder.DEFAULT,
          muted:   solidBorder.muted,
          strong:  solidBorder.strong,
          accent:  'rgba(239,129,24,0.45)',
          teal:    'rgba(30,165,140,0.45)',
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

      // No custom shadows — borders carry all elevation information
      boxShadow: {
        // Only for floating surfaces that need spatial separation
        overlay: '0 8px 24px rgba(0,0,0,0.5)',
        panel:   '0 2px 8px rgba(0,0,0,0.35)',
      },
    },
  },
}

export default tokens
