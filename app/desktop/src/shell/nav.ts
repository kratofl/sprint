import {
  BarChart3,
  Car,
  CircleHelp,
  Cpu,
  Flag,
  House,
  LayoutDashboard,
  ListChecks,
  Radio,
  Route,
  Settings,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import type { AppView } from '../bridge'

export type NavIcon = typeof House

/** One page: its name in the palette and the toolbar, and its shorter name as a tab in its area. */
export type NavItem = { view: AppView; label: string; tab: string; icon: NavIcon }

// Page order, which is also the Alt+1..8 / ⌘1..8 order. Settings and Help are pinned to the
// foot of the rail separately.
export const primaryNav: NavItem[] = [
  { view: 'Home', label: 'Overview', tab: 'Overview', icon: House },
  { view: 'SessionPlanner', label: 'Session planner', tab: 'Planner', icon: ListChecks },
  { view: 'OnTrack', label: 'On track', tab: 'On track', icon: Route },
  { view: 'Analysis', label: 'Analysis', tab: 'Analysis', icon: BarChart3 },
  { view: 'Setups', label: 'Setups', tab: 'Setups', icon: SlidersHorizontal },
  { view: 'Dashes', label: 'Dashes', tab: 'Dashes', icon: LayoutDashboard },
  { view: 'Devices', label: 'Devices', tab: 'Devices', icon: Cpu },
  { view: 'RaceEngineer', label: 'Race engineer', tab: 'Race engineer', icon: Radio },
]

export const footerNav: NavItem[] = [
  { view: 'Settings', label: 'Settings', tab: 'Settings', icon: Settings },
  { view: 'Help', label: 'Help & diagnostics', tab: 'Help', icon: CircleHelp },
]

/**
 * The rail's areas, each a few pages shown as tabs over the explorer. Settings and Help are areas of
 * one page each, at the foot of the rail.
 */
export type NavArea = { id: 'home' | 'drive' | 'rig' | 'team' | 'settings' | 'help'; label: string; icon: NavIcon; views: AppView[] }

export const primaryAreas: NavArea[] = [
  { id: 'home', label: 'Home', icon: House, views: ['Home'] },
  { id: 'drive', label: 'Drive', icon: Flag, views: ['SessionPlanner', 'OnTrack', 'Analysis'] },
  { id: 'rig', label: 'Car & rig', icon: Car, views: ['Setups', 'Dashes', 'Devices'] },
  { id: 'team', label: 'Team', icon: Users, views: ['RaceEngineer'] },
]

export const footerAreas: NavArea[] = [
  { id: 'settings', label: 'Settings', icon: Settings, views: ['Settings'] },
  { id: 'help', label: 'Help', icon: CircleHelp, views: ['Help'] },
]

/** The area a page belongs to. */
export const areaOf = (view: AppView): NavArea => [...primaryAreas, ...footerAreas].find((area) => area.views.includes(view)) ?? primaryAreas[0]

/**
 * The pages with an explorer: a list of their items left of the page (shell/Explorer.tsx). The
 * others take the full width.
 */
const EXPLORER_VIEWS: readonly AppView[] = ['SessionPlanner', 'OnTrack', 'Analysis', 'Setups', 'Dashes', 'Devices', 'Settings']

export const hasExplorer = (view: AppView): boolean => EXPLORER_VIEWS.includes(view)

/** The row that stands for a page. */
export const navItemFor = (view: AppView): NavItem | undefined => [...primaryNav, ...footerNav].find((item) => item.view === view)

/** The name a page goes by in the palette; the toolbar shows it after its area. */
export const viewLabel = (view: AppView): string => navItemFor(view)?.label ?? view

/** Where the toolbar says you are: "Drive › Analysis"; a one-page area is just the page. */
export function crumbsFor(view: AppView): string[] {
  const area = areaOf(view)
  return area.views.length > 1 ? [area.label, navItemFor(view)?.tab ?? view] : [viewLabel(view)]
}
