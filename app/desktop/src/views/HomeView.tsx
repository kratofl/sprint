import type { ReactNode } from 'react'
import { BarChart3, ChevronRight, Gamepad2, ListChecks, Plus } from 'lucide-react'
import type { AppView } from '../bridge'
import { PageHeader } from '../shell/PageHeader'
import type { RuntimeState } from '../shell/runtime'
import { Status } from '../shell/Status'
import type { StatusTone } from '../shell/Status'
import type { NavigationTarget } from '../shell/ViewRouter'
import { TELEMETRY_STATUS_TONE } from '../shell/telemetry'
import { dayLabel, formatGap, formatLapSeconds } from './AnalysisDomain'
import { DeviceImage } from './DeviceImage'
import { homeDevices, homeGame, openPlans, overviewPrimary, planFacts, recentSessions } from './HomeDomain'
import type { HomeDevice, HomeGame, HomeSession, OverviewPrimary, RecentSessions } from './HomeDomain'
import { PLAN_STATUS_TONE, formatClock, formatLapTime } from './SessionPlannerDomain'
import type { SessionPlan } from './SessionPlannerDomain'
import './HomeView.css'

/**
 * Overview: "can I drive now, and how did it go?". The plan you are driving next (or a prompt to
 * plan one), the rig as status cards — the game link, then every screen device — and the recent
 * sessions with the newest opened up: best lap, gap to your earlier best on the same car and
 * track, and its sectors. Every card and row opens its item on the owning page.
 */
export function HomeView({
  runtime,
  onNavigate,
  onOpenItem,
  onImportResults,
}: {
  runtime: RuntimeState
  onNavigate: (view: AppView) => void
  onOpenItem: (target: NavigationTarget) => void
  /** Opens the shell's results import dialog; absent when the game has no results archive. */
  onImportResults?: () => void
}) {
  if (runtime.kind === 'loading') {
    return (
      <div className="overview">
        <OverviewHeader primary={{ kind: 'plan-session', draft: null }} onNavigate={onNavigate} onOpenItem={onOpenItem} />
        <div className="card skeleton overview-plan-skeleton" />
        <div className="overview-rig">
          {[0, 1, 2].map((index) => (
            <div key={index} className="card skeleton overview-rig-skeleton" />
          ))}
        </div>
        <div className="card skeleton overview-sessions-skeleton" />
      </div>
    )
  }

  const { sprint } = runtime
  const primary = overviewPrimary(openPlans(sprint))
  const sessions = recentSessions(sprint)

  return (
    <div className="overview">
      <OverviewHeader primary={primary} onNavigate={onNavigate} onOpenItem={onOpenItem} />

      {primary.kind === 'open-plan' ? (
        <NextUpCard plan={primary.plan} onOpen={() => onOpenItem({ view: 'SessionPlanner', planId: primary.plan.id })} />
      ) : (
        <NoPlanCard draft={primary.draft} onOpenDraft={(planId) => onOpenItem({ view: 'SessionPlanner', planId })} />
      )}

      <Rig
        game={homeGame(sprint.telemetry)}
        devices={homeDevices(sprint)}
        onOpenGame={() => onNavigate('Help')}
        onOpenDevice={(deviceId) => onOpenItem({ view: 'Devices', deviceId })}
        onAddDevice={() => onNavigate('Devices')}
      />

      {sessions ? (
        <SessionsCard
          sessions={sessions}
          onOpen={(sessionId) => onOpenItem({ view: 'Analysis', sessionId })}
          onOpenAll={() => onNavigate('Analysis')}
        />
      ) : (
        <NoSessionsCard onImportResults={onImportResults} />
      )}
    </div>
  )
}

function OverviewHeader({
  primary,
  onNavigate,
  onOpenItem,
}: {
  primary: OverviewPrimary
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
          Open plan
        </button>
      ) : (
        <button type="button" className="button primary" onClick={() => onNavigate('SessionPlanner')}>
          <ListChecks />
          Plan a session
        </button>
      )}
    </PageHeader>
  )
}

// ── Plan ─────────────────────────────────────────────────────────────────

function NextUpCard({ plan, onOpen }: { plan: SessionPlan; onOpen: () => void }) {
  const facts = planFacts(plan)
  const meta = [plan.car, plan.track, plan.qualifyingIncluded ? 'qualifying + race' : 'race'].filter(Boolean).join(' · ')

  return (
    <button type="button" className="card overview-plan" onClick={onOpen}>
      <span className="overview-plan-head">
        <span className="overview-plan-text">
          <span className="overview-eyebrow">{plan.status === 'Tracking' ? 'Driving now' : 'Next up'}</span>
          <span className="overview-plan-name">{plan.name}</span>
          <span className="overview-secondary">{meta}</span>
        </span>
        <Status tone={PLAN_STATUS_TONE[plan.status]}>{plan.status}</Status>
      </span>
      <span className="overview-facts">
        <Fact label="Starts" value={facts.startsAt ? formatClock(facts.startsAt) : '—'} />
        <Fact label="Race" value={facts.raceLength ?? '—'} />
        <Fact label="Target lap" value={formatLapTime(facts.targetLapSeconds)} />
        <Fact label="Fuel per lap" value={facts.fuelPerLapLiters === null ? '—' : `${facts.fuelPerLapLiters.toFixed(1)} L`} />
      </span>
    </button>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="overview-fact">
      <span className="overview-fact-label">{label}</span>
      <span className="overview-fact-value tabular">{value}</span>
    </span>
  )
}

function NoPlanCard({ draft, onOpenDraft }: { draft: SessionPlan | null; onOpenDraft: (planId: string) => void }) {
  return (
    <section className="card overview-empty-card" aria-label="Session plan">
      <span className="overview-empty-icon" aria-hidden="true">
        <ListChecks />
      </span>
      <span className="overview-empty-text">
        <strong>No plan for your next session</strong>
        <span className="overview-secondary">Fuel, stints and a target lap, worked out before you join a server.</span>
      </span>
      {draft && (
        <span className="overview-secondary overview-draft">
          {draft.name} is a draft ·{' '}
          <button type="button" className="text-button" onClick={() => onOpenDraft(draft.id)}>
            Continue it
          </button>
        </span>
      )}
    </section>
  )
}

// ── Rig ──────────────────────────────────────────────────────────────────

function Rig({
  game,
  devices,
  onOpenGame,
  onOpenDevice,
  onAddDevice,
}: {
  game: HomeGame
  devices: readonly HomeDevice[]
  onOpenGame: () => void
  onOpenDevice: (deviceId: string) => void
  onAddDevice: () => void
}) {
  return (
    <div className="overview-rig" role="list" aria-label="Rig">
      <RigCard
        picture={
          <span className="overview-rig-picture" aria-hidden="true">
            <Gamepad2 strokeWidth={1.5} />
          </span>
        }
        name={game.name}
        tone={TELEMETRY_STATUS_TONE[game.tone]}
        status={game.statusLabel}
        detail={game.detail}
        onOpen={onOpenGame}
      />
      {devices.map((entry) => (
        <RigCard
          key={entry.device.id}
          picture={<DeviceImage image={entry.image} dim={!entry.connected} className="overview-rig-picture" />}
          name={entry.device.name}
          tone={TELEMETRY_STATUS_TONE[entry.statusTone]}
          status={entry.statusLabel}
          detail={entry.connected ? entry.dashName : null}
          onOpen={() => onOpenDevice(entry.device.id)}
        />
      ))}
      {devices.length === 0 && (
        <div role="listitem">
          <button type="button" className="card overview-rig-card overview-rig-add" onClick={onAddDevice}>
            <span className="overview-rig-picture" aria-hidden="true">
              <Plus strokeWidth={1.5} />
            </span>
            <span className="overview-rig-text">
              <span className="overview-rig-name">Add a wheel or screen</span>
              <span className="overview-rig-detail">Shows your dash on it while you drive</span>
            </span>
            <ChevronRight className="overview-chevron" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

function RigCard({
  picture,
  name,
  tone,
  status,
  detail,
  onOpen,
}: {
  picture: ReactNode
  name: string
  tone: StatusTone
  status: string
  detail: string | null
  onOpen: () => void
}) {
  return (
    <div role="listitem">
      <button type="button" className="card overview-rig-card" onClick={onOpen} title={detail ?? undefined}>
        {picture}
        <span className="overview-rig-text">
          <span className="overview-rig-name">{name}</span>
          <span className="overview-rig-status">
            <Status tone={tone} quiet>
              {status}
            </Status>
            {detail && <span className="overview-rig-detail">{detail}</span>}
          </span>
        </span>
        <ChevronRight className="overview-chevron" aria-hidden="true" />
      </button>
    </div>
  )
}

// ── Sessions ─────────────────────────────────────────────────────────────

const gapClass = (gap: number) => (gap < 0 ? 'overview-gap faster' : gap > 0 ? 'overview-gap slower' : 'overview-gap')

function SessionsCard({
  sessions,
  onOpen,
  onOpenAll,
}: {
  sessions: RecentSessions
  onOpen: (sessionId: string) => void
  onOpenAll: () => void
}) {
  const { last, comparison, earlier } = sessions
  const meta = [dayLabel(last.startedAt), last.kind, last.track, last.car, `${last.lapCount} ${last.lapCount === 1 ? 'lap' : 'laps'}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="card list-card overview-sessions" aria-labelledby="overview-sessions-title">
      <div className="card-header">
        <h2 id="overview-sessions-title" className="card-title">
          Recent sessions
        </h2>
        <button type="button" className="text-button" onClick={onOpenAll}>
          All in Analysis
        </button>
      </div>

      <button type="button" className="list-row overview-last" onClick={() => onOpen(last.id)}>
        <span className="overview-last-main">
          <span className="overview-secondary overview-last-meta">{meta}</span>
          <span className="overview-last-best">
            <span className="overview-last-time tabular">{formatLapSeconds(last.bestLapSeconds)}</span>
            {comparison.gapSeconds !== null && (
              <span>
                <span className={`${gapClass(comparison.gapSeconds)} tabular`}>{formatGap(comparison.gapSeconds)}</span>{' '}
                <span className="overview-secondary">vs your best here</span>
              </span>
            )}
            {comparison.gapSeconds !== null && comparison.gapSeconds < 0 && <span className="chip">Personal best</span>}
          </span>
        </span>
        <ChevronRight className="overview-chevron" aria-hidden="true" />
        {last.bestSectors.length > 0 && (
          <span className="overview-sectors">
            {last.bestSectors.map((time, index) => {
              const gap = comparison.sectorGaps[index] ?? null
              return (
                <span key={index} className="overview-sector">
                  <span className="overview-fact-label">Sector {index + 1}</span>
                  <span>
                    <span className="overview-sector-time tabular">{time.toFixed(3)}</span>
                    {gap !== null && <span className={`${gapClass(gap)} tabular`}> {formatGap(gap)}</span>}
                  </span>
                </span>
              )
            })}
          </span>
        )}
      </button>

      {earlier.length > 0 && (
        <ul className="list-rows">
          {earlier.map((session) => (
            <SessionRow key={session.id} session={session} onOpen={() => onOpen(session.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}

function SessionRow({ session, onOpen }: { session: HomeSession; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="list-row overview-session-columns" onClick={onOpen}>
        <span className="overview-cell overview-secondary">{dayLabel(session.startedAt)}</span>
        <span className="overview-cell">{session.kind}</span>
        <span className="overview-cell">{session.track || '—'}</span>
        <span className="overview-cell overview-secondary">{session.car || '—'}</span>
        <span className="overview-num overview-secondary tabular">{session.lapCount}</span>
        <span className="overview-num overview-best tabular">{formatLapSeconds(session.bestLapSeconds)}</span>
        <ChevronRight className="overview-chevron" aria-hidden="true" />
      </button>
    </li>
  )
}

function NoSessionsCard({ onImportResults }: { onImportResults?: () => void }) {
  return (
    <section className="card list-card overview-sessions" aria-labelledby="overview-sessions-title">
      <div className="card-header">
        <h2 id="overview-sessions-title" className="card-title">
          Recent sessions
        </h2>
      </div>
      <div className="overview-empty-card overview-sessions-empty">
        <span className="overview-empty-icon" aria-hidden="true">
          <BarChart3 />
        </span>
        <span className="overview-empty-text">
          <strong>No laps yet</strong>
          <span className="overview-secondary">Drive and each session shows up here with your best lap and sectors.</span>
        </span>
        {onImportResults && (
          <button type="button" className="button" onClick={onImportResults}>
            Import race results
          </button>
        )}
      </div>
    </section>
  )
}
