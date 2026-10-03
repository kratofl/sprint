import { BarChart3, ListChecks, Radio } from 'lucide-react'
import '@sprint/dashboard/styles.css'
import { DashRenderer } from '@sprint/dashboard'
import type { AppView } from '../bridge'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import type { RuntimeState } from '../shell/runtime'
import { Status } from '../shell/Status'
import type { NavigationTarget } from '../shell/ViewRouter'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from '../shell/telemetry'
import type { TelemetryDescription } from '../shell/telemetry'
import { toTelemetryFrame } from './DashesDomain'
import { homeDashes, homeDevices, lapHistorySummary, openPlans, overviewPrimary } from './HomeDomain'
import type { HomeDash, HomeDevice, OverviewPrimary } from './HomeDomain'
import { PLAN_STATUS_TONE } from './SessionPlannerDomain'
import type { SessionPlan } from './SessionPlannerDomain'
import './HomeView.css'

// Rows per card before "Open planner" / "Manage devices" / "Manage dashes" takes over.
const ROW_LIMIT = 6

/**
 * Overview: the operational landing page. PageHeader + CommandBar (one accent
 * command for the active plan), the telemetry link as an InfoBar whenever it
 * needs attention, a KPI row of real counts, then list cards for plans,
 * devices and dashes. Every row opens its item in the owning view.
 */
export function HomeView({
  runtime,
  onNavigate,
  onOpenItem,
}: {
  runtime: RuntimeState
  onNavigate: (view: AppView) => void
  onOpenItem: (target: NavigationTarget) => void
}) {
  if (runtime.kind === 'loading') {
    return (
      <div className="overview">
        <OverviewHeader primary={{ kind: 'plan-session' }} telemetry={null} onNavigate={onNavigate} onOpenItem={onOpenItem} />
        <div className="overview-kpis">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="kpi skeleton overview-kpi-skeleton" />
          ))}
        </div>
        <div className="overview-split">
          <div className="card skeleton overview-card-skeleton" />
          <div className="card skeleton overview-card-skeleton" />
        </div>
      </div>
    )
  }

  const { sprint } = runtime
  const telemetry = describeTelemetry(sprint.telemetry)
  const frame = toTelemetryFrame(sprint.telemetry.frame)
  const devices = homeDevices(sprint)
  const connected = devices.filter((entry) => entry.connected).length
  const dashes = homeDashes(sprint)
  const dashesOnScreen = dashes.filter((entry) => entry.assignedDeviceNames.length > 0).length
  const plans = openPlans(sprint)
  const primary = overviewPrimary(plans)
  const history = lapHistorySummary(sprint)

  return (
    <div className="overview">
      <OverviewHeader primary={primary} telemetry={telemetry} onNavigate={onNavigate} onOpenItem={onOpenItem} />

      <TelemetryInfoBar telemetry={telemetry} />

      <div className="overview-kpis">
        <Kpi
          label="Devices connected"
          value={connected}
          detail={devices.length === 0 ? 'No screens saved' : `of ${devices.length} saved ${devices.length === 1 ? 'screen' : 'screens'}`}
        />
        <Kpi label="Dashes" value={dashes.length} detail={`${dashesOnScreen} on a screen`} />
        <Kpi
          label="Open session plans"
          value={plans.length}
          detail={primary.kind === 'open-plan' ? `${primary.plan.status}: ${primary.plan.name}` : 'None armed'}
        />
        <Kpi
          label="Recorded sessions"
          value={history.sessions}
          detail={`${history.laps} ${history.laps === 1 ? 'lap' : 'laps'}`}
        />
      </div>

      <div className="overview-split">
        <section className="card list-card overview-plans" aria-labelledby="overview-plans-title">
          <CardHead id="overview-plans-title" title="Session plans" link="Open planner" onLink={() => onNavigate('SessionPlanner')} />
          {plans.length === 0 ? (
            <p className="list-card-empty">No open plans. Create one before qualifying or joining a server.</p>
          ) : (
            <>
              <div className="list-header" aria-hidden="true">
                <span>Plan</span>
                <span>Car</span>
                <span>Track</span>
                <span>Status</span>
              </div>
              <ul className="list-rows">
                {plans.slice(0, ROW_LIMIT).map((plan) => (
                  <PlanRow key={plan.id} plan={plan} onOpen={() => onOpenItem({ view: 'SessionPlanner', planId: plan.id })} />
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card list-card overview-devices" aria-labelledby="overview-devices-title">
          <CardHead id="overview-devices-title" title="Devices" link="Manage devices" onLink={() => onNavigate('Devices')} />
          {devices.length === 0 ? (
            <p className="list-card-empty">Add a wheel or screen on the Devices page to drive a dash.</p>
          ) : (
            <>
              <div className="list-header" aria-hidden="true">
                <span>Device</span>
                <span>Dash</span>
                <span>Status</span>
              </div>
              <ul className="list-rows">
                {devices.slice(0, ROW_LIMIT).map((entry) => (
                  <DeviceRow
                    key={entry.device.id}
                    entry={entry}
                    onOpen={() => onOpenItem({ view: 'Devices', deviceId: entry.device.id })}
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="card list-card overview-dashes" aria-labelledby="overview-dashes-title">
        <CardHead id="overview-dashes-title" title="Dashes" link="Manage dashes" onLink={() => onNavigate('Dashes')} />
        {dashes.length === 0 ? (
          <p className="list-card-empty">Create your first dash to start designing for a wheel screen.</p>
        ) : (
          <>
            <div className="list-header" aria-hidden="true">
              <span />
              <span>Name</span>
              <span>Screen profile</span>
              <span>Shown on</span>
            </div>
            <ul className="list-rows">
              {dashes.slice(0, ROW_LIMIT).map((entry) => (
                <DashRow
                  key={entry.layout.id}
                  entry={entry}
                  frame={frame}
                  onOpen={() => onOpenItem({ view: 'Dashes', dashId: entry.layout.id })}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function OverviewHeader({
  primary,
  telemetry,
  onNavigate,
  onOpenItem,
}: {
  primary: OverviewPrimary
  telemetry: TelemetryDescription | null
  onNavigate: (view: AppView) => void
  onOpenItem: (target: NavigationTarget) => void
}) {
  return (
    <PageHeader title="Overview">
      {primary.kind === 'open-plan' ? (
        <button
          type="button"
          className="button primary"
          onClick={() => onOpenItem({ view: 'SessionPlanner', planId: primary.plan.id })}
          title={primary.plan.name}
        >
          <ListChecks />
          Open active plan
        </button>
      ) : (
        <button type="button" className="button primary" onClick={() => onNavigate('SessionPlanner')}>
          <ListChecks />
          Plan a session
        </button>
      )}
      <CommandDivider />
      <button type="button" className="button subtle" onClick={() => onNavigate('Analysis')}>
        <BarChart3 />
        Analyze laps
      </button>
      <button type="button" className="button subtle" onClick={() => onNavigate('RaceEngineer')}>
        <Radio />
        Race engineer
      </button>
      <span className="command-spacer" />
      {/* Quiet status while the link is healthy; anything else is an InfoBar below. */}
      {telemetry && telemetry.tone === 'live' && !telemetry.detail && (
        <Status tone="success" quiet role="status" className="overview-status">
          {telemetry.label}
        </Status>
      )}
    </PageHeader>
  )
}

/** The telemetry link as a Fluent InfoBar whenever it is not simply live. Help & diagnostics shows the same bar. */
export function TelemetryInfoBar({ telemetry }: { telemetry: TelemetryDescription }) {
  if (telemetry.tone === 'live' && !telemetry.detail) return null

  const severity = telemetry.tone === 'fault' ? 'error' : telemetry.tone === 'idle' ? 'info' : 'warning'
  const message = telemetry.detail ?? (telemetry.tone === 'idle' ? 'Sprint connects on its own once the game is running.' : null)

  return (
    <div className={`infobar ${severity}`} role={severity === 'info' ? 'status' : 'alert'}>
      <span className="infobar-icon" aria-hidden="true">
        {severity === 'info' ? 'i' : '!'}
      </span>
      <strong className="infobar-title">{telemetry.label}</strong>
      <span className="infobar-message">{message}</span>
    </div>
  )
}

function Kpi({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-delta">{detail}</span>
    </div>
  )
}

function CardHead({ id, title, link, onLink }: { id: string; title: string; link: string; onLink: () => void }) {
  return (
    <div className="card-header">
      <h2 id={id} className="card-title">
        {title}
      </h2>
      <button type="button" className="overview-link" onClick={onLink}>
        {link}
      </button>
    </div>
  )
}

function PlanRow({ plan, onOpen }: { plan: SessionPlan; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="list-row" onClick={onOpen}>
        <span className="overview-cell overview-name">{plan.name}</span>
        <span className="overview-cell overview-secondary">{plan.car || '—'}</span>
        <span className="overview-cell overview-secondary">{plan.track || '—'}</span>
        <Status tone={PLAN_STATUS_TONE[plan.status]}>{plan.status}</Status>
      </button>
    </li>
  )
}

function DeviceRow({ entry, onOpen }: { entry: HomeDevice; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="list-row" onClick={onOpen}>
        <span className="overview-cell overview-name">{entry.device.name}</span>
        <span className="overview-cell overview-secondary">{entry.dashName ?? 'No dash'}</span>
        <Status tone={TELEMETRY_STATUS_TONE[entry.statusTone]}>{entry.statusLabel}</Status>
      </button>
    </li>
  )
}

// Thumbnails fit the 32px row: 24px tall, width from the dash grid's aspect.
const PREVIEW_HEIGHT = 24

function DashRow({
  entry,
  frame,
  onOpen,
}: {
  entry: HomeDash
  frame: ReturnType<typeof toTelemetryFrame>
  onOpen: () => void
}) {
  const previewWidth = Math.min(48, Math.round((PREVIEW_HEIGHT / entry.layout.gridRows) * entry.layout.gridCols))
  const shownOn = entry.assignedDeviceNames.length === 0 ? 'Not on a screen' : entry.assignedDeviceNames.join(', ')

  return (
    <li>
      <button type="button" className="list-row" onClick={onOpen}>
        <span className="overview-dash-preview" aria-hidden="true">
          <DashRenderer layout={entry.layout} frame={frame} width={previewWidth} height={PREVIEW_HEIGHT} />
        </span>
        <span className="overview-cell overview-name">{entry.layout.name}</span>
        <span className="overview-cell overview-secondary">{entry.profileLabel}</span>
        <span className="overview-cell overview-secondary">{shownOn}</span>
      </button>
    </li>
  )
}
