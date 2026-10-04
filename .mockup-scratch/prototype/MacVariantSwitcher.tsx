// PROTOTYPE — throwaway (see macVariants.css). Only loaded when the URL carries ?variant=.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './macVariants.css'

const variants = [
  { key: 'A', name: 'Components from the sheet' },
  { key: 'B', name: 'Mockup toolbar' },
  { key: 'C', name: 'macOS 26 glass' },
  { key: 'D', name: 'B + macOS 27 HIG' },
] as const

function readVariant(): number {
  const key = new URLSearchParams(window.location.search).get('variant')
  return Math.max(0, variants.findIndex((variant) => variant.key === key))
}

function Switcher() {
  const [index, setIndex] = useState(readVariant)

  useEffect(() => {
    const key = variants[index].key
    document.documentElement.dataset.macVariant = key
    const url = new URL(window.location.href)
    url.searchParams.set('variant', key)
    window.history.replaceState(null, '', url)
  }, [index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) return
      if (event.key === 'ArrowLeft') setIndex((current) => (current + variants.length - 1) % variants.length)
      if (event.key === 'ArrowRight') setIndex((current) => (current + 1) % variants.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const variant = variants[index]
  return (
    <div className="mac-variant-switcher" role="group" aria-label="Prototype variant">
      <button type="button" aria-label="Previous variant" onClick={() => setIndex((index + variants.length - 1) % variants.length)}>
        ‹
      </button>
      <span>
        {variant.key} · {variant.name}
      </span>
      <button type="button" aria-label="Next variant" onClick={() => setIndex((index + 1) % variants.length)}>
        ›
      </button>
    </div>
  )
}

export function mountMacVariantSwitcher(): void {
  const host = document.createElement('div')
  document.body.append(host)
  createRoot(host).render(<Switcher />)
}
