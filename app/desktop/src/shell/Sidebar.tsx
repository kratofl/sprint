import { Fragment, type RefObject } from 'react'
import { PanelLeft } from 'lucide-react'
import sprintMark from '../assets/sprint-mark.svg'
import { platform } from '../platform'
import { footerNav, primaryNav, type NavItem } from './nav'
import { AccountRow } from './AccountRow'
import type { RunningBuild } from './build'
import type { Account, AppView } from '../bridge'

/** Lucide's default stroke is heavier than the brand's line icons; 1.6 matches the mockups. */
const NAV_ICON_STROKE = 1.6

/**
 * The full-height 224px sidebar. Its top band, level with the toolbar, holds the
 * Sprint mark and name, then the toggle, which collapses the sidebar to a 56px
 * rail of icons (the persisted `sidebarCollapsed` setting): labels leave, and each
 * item keeps its name as tooltip and accessible name. The selected item gets the
 * strong fill and the brand icon. Rows sit under quiet section headings (`NavGroup`).
 * The footer holds Settings (with a dot when an update is available) and Help, the
 * running build's version (a dev run's branch), then the account row under a hairline
 * (absent while Sprint web is off).
 *
 * A development or pre-release build wears a tag beside the name (in the version line
 * on macOS, whose band has no name), and a dot on the toggle while collapsed. Stable
 * builds wear nothing.
 *
 * On macOS (styles.mac.css) the band has no mark: the traffic lights sit in its
 * first 80px, with the toggle on the right, and collapsing hides the sidebar
 * entirely, as in Finder or Mail; the toolbar then offers it back.
 */
export function Sidebar({
  view,
  collapsed,
  onToggleCollapsed,
  toggleRef,
  onSelect,
  accountRow,
  updateAvailable,
  build,
}: {
  view: AppView
  collapsed: boolean
  onToggleCollapsed: () => void
  toggleRef: RefObject<HTMLButtonElement | null>
  onSelect: (view: AppView) => void
  /** Null hides the row: Sprint web is off. */
  accountRow: { account: Account | null; onOpen: () => void } | null
  updateAvailable: boolean
  /** Null until the host reports the version. */
  build: RunningBuild | null
}) {
  const tag = build ? buildTag(build) : null
  // On macOS the tag sits in the version line, which then has no room for the word "Version".
  const buildLine = build ? buildText(build, platform === 'mac' && tag !== null) : ''
  return (
    <nav className={collapsed ? 'navview collapsed' : 'navview'} aria-label="Main navigation">
      <div className="navview-band">
        {platform === 'mac' ? null : (
          <span className="navview-brand">
            <img src={sprintMark} alt="" aria-hidden="true" />
            Sprint
            {tag}
          </span>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="navview-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <PanelLeft size={16} strokeWidth={NAV_ICON_STROKE} />
          {build && build.kind !== 'stable' ? <span className={`navview-build-dot ${build.kind}`} aria-hidden="true" /> : null}
        </button>
      </div>
      {primaryNav.map((item, index) => (
        <Fragment key={item.view}>
          {item.group && item.group !== primaryNav[index - 1]?.group ? (
            // Collapsed, the heading is a hairline: the rail has no room for words.
            <div className="nav-group" role="presentation">
              <span className="nav-group-label">{item.group}</span>
            </div>
          ) : null}
          {renderItem(item, view, collapsed, onSelect, false)}
        </Fragment>
      ))}
      <div className="navview-spacer" />
      {accountRow && <AccountRow account={accountRow.account} collapsed={collapsed} onOpen={accountRow.onOpen} />}
      {footerNav.map((item) => renderItem(item, view, collapsed, onSelect, item.view === 'Settings' && updateAvailable))}
      {build ? (
        <div className="navview-build">
          {platform === 'mac' ? tag : null}
          <span className="navview-build-text tabular" title={buildLine}>{buildLine}</span>
        </div>
      ) : null}
    </nav>
  )
}

function buildTag(build: RunningBuild) {
  if (build.kind === 'stable') return null
  return build.kind === 'development'
    ? <span className="chip chip-warning">Dev</span>
    : <span className="chip chip-info">Pre-release</span>
}

function buildText(build: RunningBuild, tagged: boolean): string {
  if (build.kind === 'development') return build.branch ?? 'Development build'
  return tagged ? build.version : `Version ${build.version}`
}

function renderItem(item: NavItem, activeView: AppView, collapsed: boolean, onSelect: (view: AppView) => void, badge: boolean) {
  const isActive = item.view === activeView || (item.also?.includes(activeView) ?? false)
  const Icon = item.icon
  const label = badge ? `${item.label} — update available` : item.label
  return (
    <button
      type="button"
      key={item.view}
      className={isActive ? 'nav-item active' : 'nav-item'}
      aria-current={isActive ? 'page' : undefined}
      // A collapsed rail hides the visible label, so the name moves here.
      aria-label={badge || collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={() => onSelect(item.view)}
    >
      <Icon size={16} strokeWidth={NAV_ICON_STROKE} />
      <span className="nav-item-label">{item.label}</span>
      {badge ? <span className="nav-item-badge" aria-hidden="true" /> : null}
    </button>
  )
}
