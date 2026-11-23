import { useEffect } from 'react'
import type { ColourTheme } from '@sprint/dashboard'

/**
 * Puts the driver's colour theme on `<html data-colours>`, which picks the `--heat-*` colours the
 * app paints its cold–good–warm–hot values in (styles.css). Each window root that shows such
 * values calls it with the theme from its state.
 */
export function useColourTheme(theme: ColourTheme): void {
  useEffect(() => {
    document.documentElement.dataset.colours = theme
  }, [theme])
}
