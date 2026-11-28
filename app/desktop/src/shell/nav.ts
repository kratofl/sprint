import { BarChart3, CircleHelp, Cpu, House, LayoutDashboard, ListChecks, Radio, Route, Settings, SlidersHorizontal } from 'lucide-react'
import type { AppView } from '../bridge'

export type NavIcon = typeof House

/** The sidebar's group headings, in order. Overview and the foot stand outside them. */
export type NavGroup = 'Drive' | 'Car & rig' | 'Team'

/** One page: its name in the sidebar, the toolbar and the palette, and the group it sits under. */
export type NavItem = { view: AppView; label: string; icon: NavIcon; group?: NavGroup }

// Page order, which is also the Alt+1..8 / ⌘1..8 order. Settings and Help are pinned to the foot
// of the sidebar separately.
export const primaryNav: NavItem[] = [
  { view: 'Home', label: 'Overview', icon: House },
  { view: 'SessionPlanner', label: 'Session planner', icon: ListChecks, group: 'Drive' },
  { view: 'OnTrack', label: 'On track', icon: Route, group: 'Drive' },
  { view: 'Analysis', label: 'Analysis', icon: BarChart3, group: 'Drive' },
  { view: 'Setups', label: 'Setups', icon: SlidersHorizontal, group: 'Car & rig' },
  { view: 'Dashes', label: 'Dashes', icon: LayoutDashboard, group: 'Car & rig' },
  { view: 'Devices', label: 'Devices', icon: Cpu, group: 'Car & rig' },
  { view: 'RaceEngineer', label: 'Race engineer', icon: Radio, group: 'Team' },
]

export const footerNav: NavItem[] = [
  { view: 'Settings', label: 'Settings', icon: Settings },
  { view: 'Help', label: 'Help & diagnostics', icon: CircleHelp },
]

/**
 * Whether a page has an explorer, a list beside it (shell/Explorer.tsx): only Settings, whose
 * section list is its way around. Every other page carries its own list and takes the full width.
 */
export const hasExplorer = (view: AppView): boolean => view === 'Settings'

/** The row that stands for a page. */
export const navItemFor = (view: AppView): NavItem | undefined => [...primaryNav, ...footerNav].find((item) => item.view === view)

/** The name a page goes by in the sidebar, the palette and the toolbar. */
export const viewLabel = (view: AppView): string => navItemFor(view)?.label ?? view
