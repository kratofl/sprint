import type { Config } from 'tailwindcss'
import tokens from '@sprint/tokens/tailwind'

const config: Config = {
  ...tokens,
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [],
}

export default config
