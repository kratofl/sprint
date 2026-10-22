import type { AppView, SprintCommand } from '../bridge'
import type { RuntimeState } from './runtime'
import { HomeView } from '../views/HomeView'
import { SessionPlannerView } from '../views/SessionPlannerView'
import { AnalysisView } from '../views/AnalysisView'
import { DashesView } from '../views/DashesView'
import { DevicesView } from '../views/DevicesView'
import { SetupsView } from '../views/SetupsView'
import { RaceEngineerView } from '../views/RaceEngineerView'
import { SettingsView } from '../views/SettingsView'
import { HelpView } from '../views/HelpView'

/**
 * A navigation intent that also names the specific item to open, so a Home
 * launchpad row (dash card, device row, plan tile) can jump straight into
 * that item instead of just switching pages. The id can only accompany the
 * view it belongs to — mirrors `AppView`, but only the views with an
 * item-level destination carry an (optional) id.
 */
export type NavigationTarget =
  | { view: 'Home' }
  | { view: 'SessionPlanner'; planId?: string }
  | { view: 'Analysis' }
  | { view: 'Dashes'; dashId?: string }
  | { view: 'Devices'; deviceId?: string }
  | { view: 'Setups' }
  | { view: 'RaceEngineer' }
  | { view: 'Settings' }
  | { view: 'Help' }

// Views render state and raise intent: `send` for native-host commands,
// `onNavigate` for switching the shell's own view state. None of them fetch
// or hold business logic of their own. `focus` carries at most one pending
// item-open request, scoped to whichever view it names; the shell clears it
// once handed off (see App.tsx), so it is only ever consumed by the view it
// targets, once. `onImportResults` opens the shell-owned results import dialog; it is absent
// when the game has no results archive, and the pages then show no import action.
export function ViewRouter({
  view,
  focus,
  runtime,
  send,
  onNavigate,
  onOpenItem,
  onImportResults,
  onSetUpCloud,
}: {
  view: AppView
  focus: NavigationTarget | null
  runtime: RuntimeState
  send: (command: SprintCommand) => Promise<void>
  onNavigate: (view: AppView) => void
  onOpenItem: (target: NavigationTarget) => void
  onImportResults?: () => void
  /** Opens the Sprint web setup (Settings' "Set up Sprint web"). */
  onSetUpCloud: () => void
}) {
  switch (view) {
    case 'Home':
      return <HomeView runtime={runtime} onNavigate={onNavigate} onOpenItem={onOpenItem} />
    case 'SessionPlanner':
      return (
        <SessionPlannerView
          runtime={runtime}
          send={send}
          focusPlanId={focus?.view === 'SessionPlanner' ? focus.planId : undefined}
          onImportResults={onImportResults}
        />
      )
    case 'Analysis':
      return <AnalysisView runtime={runtime} send={send} onImportResults={onImportResults} />
    case 'Dashes':
      return <DashesView runtime={runtime} send={send} focusDashId={focus?.view === 'Dashes' ? focus.dashId : undefined} />
    case 'Devices':
      return <DevicesView runtime={runtime} send={send} focusDeviceId={focus?.view === 'Devices' ? focus.deviceId : undefined} />
    case 'Setups':
      return <SetupsView runtime={runtime} send={send} />
    case 'RaceEngineer':
      return <RaceEngineerView runtime={runtime} send={send} />
    case 'Settings':
      return <SettingsView runtime={runtime} send={send} onSetUpCloud={onSetUpCloud} />
    case 'Help':
      return <HelpView runtime={runtime} send={send} />
  }
}
