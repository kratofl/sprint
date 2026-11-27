import type { AppView } from '../bridge'
import { platform } from '../platform'
import { BuildMark } from './BuildMark'
import type { RunningBuild } from './build'
import { areaOf, footerAreas, primaryAreas, type NavArea } from './nav'

/** Lucide's default stroke is heavier than the brand's line icons; 1.6 matches the mockups. */
const ICON_STROKE = 1.6

/**
 * The full-height rail: the Sprint mark in the build's colour (BuildMark.tsx), the areas (Home, Drive, Car & rig, Team), each an icon
 * over its name, then Settings and Help at the foot. The current area gets the strong fill, the
 * brand icon and a brand bar. Pressing an area opens the page last open in it (App.tsx).
 *
 * The top band, level with the toolbar, drags the window. On macOS it has no mark: the traffic
 * lights sit there (styles.mac.css).
 */
export function Rail({
  view,
  build,
  onSelect,
  updateAvailable,
}: {
  view: AppView
  build: RunningBuild | null
  onSelect: (area: NavArea) => void
  updateAvailable: boolean
}) {
  const current = areaOf(view).id
  const item = (area: NavArea) => {
    const Icon = area.icon
    const active = area.id === current
    const badge = area.id === 'settings' && updateAvailable
    return (
      <button
        key={area.id}
        type="button"
        className={active ? 'rail-item active' : 'rail-item'}
        aria-current={active ? 'page' : undefined}
        aria-label={badge ? `${area.label} — update available` : undefined}
        onClick={() => onSelect(area)}
      >
        <Icon size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
        <span className="rail-item-label">{area.label}</span>
        {badge ? <span className="rail-item-badge" aria-hidden="true" /> : null}
      </button>
    )
  }
  return (
    <nav className="rail" aria-label="Main navigation">
      <div className="rail-band">{platform === 'mac' ? null : <BuildMark build={build} />}</div>
      {primaryAreas.map(item)}
      <div className="rail-spacer" />
      {footerAreas.map(item)}
    </nav>
  )
}
