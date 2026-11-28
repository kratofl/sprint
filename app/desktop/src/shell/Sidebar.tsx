import { Fragment } from 'react'
import { PanelLeft } from 'lucide-react'
import type { AppView } from '../bridge'
import { platform } from '../platform'
import { BuildMark } from './BuildMark'
import type { RunningBuild } from './build'
import { footerNav, primaryNav, type NavItem } from './nav'

/** Lucide's default stroke is heavier than the brand's line icons; 1.6 matches the mockups. */
const ICON_STROKE = 1.6

/**
 * The full-height 224px sidebar: every page by name, one click away. Its top band, level with the
 * toolbar, holds the Sprint mark in the build's colour (BuildMark.tsx) and name, then the toggle,
 * which folds the sidebar to a 56px rail of icons (the persisted `sidebarCollapsed` setting):
 * labels leave, each page keeps its name as tooltip and accessible name. Pages sit under their
 * groups (Drive, Car & rig, Team); Settings, with a dot while an update is out, and Help at the
 * foot. The current page has the strong fill with icon and label in full colour; the other icons
 * are dimmed. What is connected lives in the status bar (StatusBar.tsx).
 *
 * On macOS (styles.mac.css) the band has no mark: the traffic lights sit in its first 80px with
 * the toggle on the right, and folding hides the sidebar entirely, as in Finder or Mail; the
 * toolbar then offers it back (TitleBar.tsx).
 */
export function Sidebar({
  view,
  build,
  collapsed,
  onToggle,
  onSelect,
  updateAvailable,
}: {
  view: AppView
  build: RunningBuild | null
  collapsed: boolean
  onToggle: () => void
  onSelect: (view: AppView) => void
  updateAvailable: boolean
}) {
  const item = (page: NavItem, badge: boolean) => {
    const Icon = page.icon
    const current = page.view === view
    const label = badge ? `${page.label} — update available` : page.label
    return (
      <button
        key={page.view}
        type="button"
        className={current ? 'sidebar-item current' : 'sidebar-item'}
        aria-current={current ? 'page' : undefined}
        // Folded, the label is hidden, so the name moves here.
        aria-label={badge || collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        onClick={() => onSelect(page.view)}
      >
        <Icon size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
        <span className="sidebar-item-label">{page.label}</span>
        {badge ? <span className="sidebar-item-badge" aria-hidden="true" /> : null}
      </button>
    )
  }
  return (
    <nav className={collapsed ? 'sidebar collapsed' : 'sidebar'} aria-label="Main navigation">
      <div className="sidebar-band">
        {platform === 'mac' ? null : (
          <span className="sidebar-brand">
            <BuildMark build={build} />
            <span className="sidebar-item-label">Sprint</span>
          </span>
        )}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <PanelLeft size={16} strokeWidth={ICON_STROKE} />
        </button>
      </div>
      {primaryNav.map((page, index) => (
        <Fragment key={page.view}>
          {page.group && page.group !== primaryNav[index - 1]?.group ? (
            // Folded, the heading is a hairline: the rail has no room for words.
            <div className="sidebar-group" role="presentation">
              <span className="sidebar-group-label">{page.group}</span>
            </div>
          ) : null}
          {item(page, false)}
        </Fragment>
      ))}
      <div className="sidebar-spacer" />
      {footerNav.map((page) => item(page, page.view === 'Settings' && updateAvailable))}
    </nav>
  )
}
