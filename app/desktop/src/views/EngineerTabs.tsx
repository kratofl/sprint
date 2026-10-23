import type { KeyboardEvent } from 'react'
import type { AppView } from '../bridge'

const TABS = [
  { view: 'RaceEngineer', label: 'Engineer' },
  { view: 'LiveLink', label: 'Live link' },
] as const satisfies ReadonlyArray<{ view: AppView; label: string }>

type EngineerTab = (typeof TABS)[number]['view']

/**
 * Race engineer and Live link share one sidebar row (shell/nav.ts `also`); these tabs switch
 * between the two pages. Each page keeps its own header actions.
 */
export function EngineerTabs({ current, onNavigate }: { current: EngineerTab; onNavigate: (view: AppView) => void }) {
  // Left/Right move between the tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = TABS.findIndex((tab) => tab.view === current)
    onNavigate(TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].view)
  }

  return (
    <div className="tabs" role="tablist" aria-label="Race engineer" onKeyDown={onKeyDown}>
      {TABS.map((tab) => (
        <button
          key={tab.view}
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab.view === current}
          tabIndex={tab.view === current ? 0 : -1}
          onClick={() => onNavigate(tab.view)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
