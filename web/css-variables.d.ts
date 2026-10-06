import 'react'

// Lets a `style` prop carry CSS custom properties (`--motion`, `--i`, …)
// without a type assertion.
declare module 'react' {
  interface CSSProperties {
    [variable: `--${string}`]: string | number
  }
}
