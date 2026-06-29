import 'react'

// Wails frameless-window drag regions are expressed as the `app-region`
// attribute (see index.css). Augment React's HTML attribute typing so the
// attribute can be used directly on any intrinsic element.
declare module 'react' {
  interface HTMLAttributes<T> {
    'app-region'?: 'drag' | 'no-drag'
  }
}
