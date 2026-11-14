import { useLayoutEffect, useState } from 'react'
import type { DashLayout } from '@sprint/dashboard'
import { fitScreenSize, layoutScreenProfile } from '../views/DashesDomain'

/** The bezel's frame around the screen, in px. */
export const BEZEL = 20

/** The size of an element, followed through window resizes. Measured before paint, so the dash never shows at a wrong size. */
function useElementSize(element: HTMLElement | null): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    if (!element) return
    setSize({ width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return size
}

/**
 * The dash's size on the stage, for the sections that draw it in the bezel (Layout, Alerts,
 * Theme): it fills the `.designer-fit` box handed to `setFitElement`, but is never drawn larger
 * than the panel itself — at 100% the designer shows the dash at the driver's pixels. Null until
 * the box is measured.
 */
export function useStageCanvas(layout: DashLayout): { setFitElement: (element: HTMLDivElement | null) => void; canvas: { width: number; height: number } | null } {
  const [fitElement, setFitElement] = useState<HTMLDivElement | null>(null)
  const fitBox = useElementSize(fitElement)
  const profile = layoutScreenProfile(layout)
  const screen = fitBox ? fitScreenSize(profile, Math.max(160, fitBox.width - 2 * BEZEL), Math.max(96, fitBox.height - 2 * BEZEL)) : null
  const canvas = screen && screen.width > profile.width ? { width: profile.width, height: profile.height } : screen
  return { setFitElement, canvas }
}
