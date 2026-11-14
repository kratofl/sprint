import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * An element's size in CSS pixels, measured when it mounts and on resize only (ResizeObserver),
 * so a chart draws in real pixels and never stretches its text. Nothing repaints continuously.
 * Returns a callback ref, so an element that mounts later is measured too.
 */
export function useSize<T extends HTMLElement>(): [(element: T | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((element: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!element) return
    const measure = () => {
      const box = element.getBoundingClientRect()
      const width = Math.round(box.width)
      const height = Math.round(box.height)
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    measure()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(element)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return [ref, size]
}
