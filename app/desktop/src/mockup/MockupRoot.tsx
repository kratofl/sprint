import { useEffect, useState } from 'react'
import { App } from '../App'
import { isMockupVariant, type Mockup } from './mockup'

// Every mockup on this machine. src/mockups/ is gitignored, so a checkout without any finds none.
const drafts = import.meta.glob<{ default: Mockup }>('../mockups/*.tsx')

type Loaded = { kind: 'loading' } | { kind: 'missing'; reason: string } | { kind: 'ready'; mockup: Mockup }

/**
 * Mounts one option of a design mockup (`?mockup=<name>&variant=A|B|C`, preview build only,
 * main.tsx): inside the real app shell on its page, or alone as one of the app's windows.
 */
export default function MockupRoot({ name, variant }: { name: string; variant: string | null }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })

  useEffect(() => {
    const load = drafts[`../mockups/${name}.tsx`]
    if (!load) {
      setLoaded({ kind: 'missing', reason: `No mockup src/mockups/${name}.tsx` })
      return
    }
    load().then(
      (module) => setLoaded({ kind: 'ready', mockup: module.default }),
      (error: unknown) => setLoaded({ kind: 'missing', reason: String(error) }),
    )
  }, [name])

  // A window mockup fills its window like the real one (main.tsx sets the same for those).
  const surface = loaded.kind === 'ready' && 'window' in loaded.mockup ? loaded.mockup.window : null
  useEffect(() => {
    if (surface === null) return
    document.documentElement.dataset.surface = surface
    if (surface === 'hud') document.documentElement.dataset.theme = 'dark'
  }, [surface])

  if (loaded.kind === 'loading') return null
  if (loaded.kind === 'missing') return <MockupProblem text={loaded.reason} />
  if (!isMockupVariant(variant)) return <MockupProblem text={`variant must be A, B or C (got ${variant ?? 'none'})`} />

  const Variant = loaded.mockup.variants[variant]
  if ('window' in loaded.mockup) return <Variant />
  return <App mockup={{ view: loaded.mockup.view, content: <Variant /> }} />
}

function MockupProblem({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <h2>Mockup not shown</h2>
      <p>{text}</p>
    </div>
  )
}
