import type { Config } from 'tailwindcss'

/**
 * Shared design tokens for the Sprint platform.
 * Both `web/` and `app/frontend/` extend this config with their own `content` paths.
 */
const tokens: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#EF8118',
          hover: '#F59332',
          muted: 'rgba(239,129,24,0.15)',
          border: 'rgba(239,129,24,0.30)',
        },
        teal: {
          DEFAULT: '#1EA58C',
          hover: '#25C4A8',
          muted: 'rgba(30,165,140,0.15)',
          border: 'rgba(30,165,140,0.30)',
        },
        bg: {
          base: '#080809',
          surface: 'rgba(255,255,255,0.04)',
          elevated: 'rgba(255,255,255,0.07)',
          overlay: 'rgba(255,255,255,0.10)',
        },
        text: {
          primary: '#F4F4F5',
          secondary: '#A1A1AA',
          muted: '#71717A',
          disabled: '#52525B',
        },
        border: {
          glass: 'rgba(255,255,255,0.08)',
          solid: '#27272D',
        },
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.75rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Inter Mono', 'JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        glass: '12px',
        'glass-lg': '20px',
        'glass-xl': '32px',
      },
      boxShadow: {
        card: '0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
        modal: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)',
        glow: '0 0 20px rgba(239,129,24,0.25)',
        'glow-teal': '0 0 20px rgba(30,165,140,0.25)',
      },
    },
  },
}

export default tokens
