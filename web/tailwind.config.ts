import type { Config } from 'tailwindcss'
import tokens from '@sprint/tokens/tailwind'

const config: Config = {
  ...tokens,
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  plugins: [],
}

export default config
