import {
  BarChart3,
  CircleHelp,
  Cpu,
  Home,
  LayoutDashboard,
  ListChecks,
  Radio,
  Route,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import type { AppView } from '../bridge'

export type NavIcon = typeof Home

/** The sidebar's section headings, in order. Overview and the footer stand outside them. */
export type NavGroup = 'Drive' | 'Car & rig' | 'Team'

/**
 * One sidebar row. `also` lists pages the row stands for without a row of their own (Live link
 * is a tab of Race engineer), so the row stays selected on them and the toolbar names them by it.
 */
export type NavItem = { view: AppView; label: string; icon: NavIcon; group?: NavGroup; also?: readonly AppView[] }

// Primary rail order, which is also the Alt+1..8 / ⌘1..8 order. Settings and Help are pinned to
// the bottom of the rail separately as a dedicated footer group.
export const primaryNav: NavItem[] = [
  { view: 'Home', label: 'Overview', icon: Home },
  { view: 'SessionPlanner', label: 'Session planner', icon: ListChecks, group: 'Drive' },
  { view: 'OnTrack', label: 'On track', icon: Route, group: 'Drive' },
  { view: 'Analysis', label: 'Analysis', icon: BarChart3, group: 'Drive' },
  { view: 'Setups', label: 'Setups', icon: SlidersHorizontal, group: 'Car & rig' },
  { view: 'Dashes', label: 'Dashes', icon: LayoutDashboard, group: 'Car & rig' },
  { view: 'Devices', label: 'Devices', icon: Cpu, group: 'Car & rig' },
  { view: 'RaceEngineer', label: 'Race engineer', icon: Radio, group: 'Team', also: ['LiveLink'] },
]

export const footerNav: NavItem[] = [
  { view: 'Settings', label: 'Settings', icon: Settings },
  { view: 'Help', label: 'Help & diagnostics', icon: CircleHelp },
]

/** The row that stands for a page: its own, or the one listing it in `also`. */
export const navItemFor = (view: AppView): NavItem | undefined =>
  [...primaryNav, ...footerNav].find((item) => item.view === view || item.also?.includes(view))

/** The label a page goes by in the navigation pane; the toolbar shows it as the page title. */
export const viewLabel = (view: AppView): string => navItemFor(view)?.label ?? view
