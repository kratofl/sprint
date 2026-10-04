import {
  BarChart3,
  CircleHelp,
  Cpu,
  Home,
  LayoutDashboard,
  ListChecks,
  Radio,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import type { AppView } from '../bridge'

export type NavIcon = typeof Home

export type NavItem = { view: AppView; label: string; icon: NavIcon }

// Primary rail order. Mirrors the AppView union in bridge.ts, which is the
// current contract for this shell (nine views); Settings and Help are pinned
// to the bottom of the rail separately as a dedicated footer group.
export const primaryNav: NavItem[] = [
  { view: 'Home', label: 'Overview', icon: Home },
  { view: 'SessionPlanner', label: 'Session planner', icon: ListChecks },
  { view: 'Analysis', label: 'Analysis', icon: BarChart3 },
  { view: 'Dashes', label: 'Dashes', icon: LayoutDashboard },
  { view: 'Devices', label: 'Devices', icon: Cpu },
  { view: 'Setups', label: 'Setups', icon: SlidersHorizontal },
  { view: 'RaceEngineer', label: 'Race engineer', icon: Radio },
]

export const footerNav: NavItem[] = [
  { view: 'Settings', label: 'Settings', icon: Settings },
  { view: 'Help', label: 'Help & diagnostics', icon: CircleHelp },
]

/** The label a page goes by in the navigation pane; the macOS toolbar shows it as the page title. */
export const viewLabel = (view: AppView): string => [...primaryNav, ...footerNav].find((item) => item.view === view)?.label ?? view
