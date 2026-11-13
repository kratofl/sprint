import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleDot, CircleOff, Download, Flag, ListChecks, NotebookPen, Pencil, Play, Plus, Route, Settings, Square, Timer, Trash2, Zap } from 'lucide-react'
import { bridge } from '../bridge'
import type { EstimateFigure, PlanContextChoices, PlanDetection, PlanFuelPreview, PlanFuelRequest, PlanTargetOption, PlanTargetScopeGroup, RaceFuelEstimate, SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { ConfirmDialog, ContentDialog } from '../shell/ContentDialog'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { usePageUp } from '../shell/pageUp'
import { Status } from '../shell/Status'
import { SuggestBox } from '../shell/SuggestBox'
import { Switch } from '../shell/Switch'
import { ListRow } from './SettingsLayout'
import {
  PLAN_STATUS_TONE,
  activePlan,
  buildPlanArm,
  buildPlanClearTarget,
  buildPlanCreate,
  buildPlanDelete,
  buildPlanDisarm,
  buildPlanReleaseActive,
  buildPlanSetTarget,
  buildPlanStart,
  buildPlanStop,
  buildPlanUpdate,
  buildPlannerSettings,
  choicesForGame,
  derivedPlanName,
  detectedFormatLabel,
  EMPTY_FIGURE,
  figureNote,
  figureText,
  figureValue,
  fuelGap,
  historyRequest,
  planFuelRequest,
  prefillFigures,
  sameContext,
  storedFigure,
  detectedRaceFormat,
  figureSource,
  formatLapTime,
  groupPlans,
  headlineTarget,
  isPickedTarget,
  nextSegment,
  nextStepLabel,
  openSegment,
  parsePlans,
  planLapStats,
  practiceSummary,
  formatRaceLength,
  maxRaceLength,
  PLAN_LIMITS,
  quickPlanInput,
  RESERVE_CHOICES,
  raceLengthShort,
  raceLengthUnit,
  readPlannerSettings,
  recentLapTimes,
  reserveLabel,
  reserveNote,
  sessionState,
  startingRaceSkipsQualifying,
  stintsLabel,
  targetSummary,
  targetTierNote,
  targetsFor,
  upNextPlan,
  weekendTimeline,
} from './SessionPlannerDomain'
import type { CreatePlanInput, FigureField, FuelHistoryChoice, PlanFigures, PlanSegment, PlanStatus, PlanTarget, PlannerSettings, PracticeSummary, QuickPlanAnswers, RaceLengthFormat, SegmentKind, SessionPlan } from './SessionPlannerDomain'
import { presetChoices } from './choices'
import { commandErrorMessage } from './DevicesDomain'
import './SessionPlannerView.css'

/**
 * Session planner: a race weekend's plan (docs/internals/session-planner.md).
 *
 * The page lands on the plan list (the plan that's next on top); a plan opens on an explicit
 * click and "All plans" leads back. Leaving the page closes the plan, because the router
 * remounts the view.
 *
 * An opened plan is the weekend as a lap: practice → qualifying → race → finish, a card per
 * session saying what it chases. The plan follows the game: once armed, the host opens
 * qualifying and then the race as the game reaches them (`SessionPlannerService`), so the one
 * primary action is Arm plan; starting a session by hand is the quiet fallback. Skipping
 * qualifying, taking over the active slot and deleting each go through a confirm.
 *
 * Targets are picked from laps that were driven (`GET /api/planner/targets`, `plan.setTarget`),
 * never typed. The list's CommandBar leads with Quick plan (the one primary: a plan for the session
 * about to be driven, from what the game and the lap history already say), then New plan… (the full
 * sheet) and "Import results" when the game has a results archive; the import dialog itself is the
 * shell's, because the startup prompt can appear on any page. The gear opens the planner's own
 * defaults. The race fuel each plan shows is the host's (`state.planFuel`).
 */
export function SessionPlannerView({
  runtime,
  send,
  focusPlanId,
  onImportResults,
}: {
  runtime: RuntimeState
  send: (command: SprintCommand) => Promise<void>
  /** A plan to open on mount (Home's plan tile), applied once — see the effect below. */
  focusPlanId?: string
  /** Opens the shell's import dialog; absent when the game has no results archive. */
  onImportResults?: () => void
}) {
  const plans = runtime.kind === 'ready' ? parsePlans(runtime.sprint.plans) : []
  const planFuel = runtime.kind === 'ready' ? runtime.sprint.planFuel : {}
  const settings = readPlannerSettings(runtime.kind === 'ready' ? runtime.sprint.settings : {})
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanForm | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirm, setConfirm] = useState<PlannerConfirm | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // `focusPlanId` only ever names a live plan for one render (the shell clears it right
  // after handing it off — see App.tsx), so this only ever opens the plan once; the
  // guard also means a request for a plan that no longer exists is silently ignored.
  useEffect(() => {
    if (focusPlanId && plans.some((plan) => plan.id === focusPlanId)) setOpenId(focusPlanId)
  }, [focusPlanId, plans])

  const opened = openId ? (plans.find((plan) => plan.id === openId) ?? null) : null
  usePageUp(opened ? 'All plans' : null, () => setOpenId(null))

  if (runtime.kind === 'loading') {
    return (
      <div className="planner-page">
        <PageHeader title="Session planner" />
        <div className="card skeleton planner-upnext-skeleton" />
        <div className="card skeleton planner-card-skeleton" />
      </div>
    )
  }

  const runAction = async (command: SprintCommand) => {
    setActionError(null)
    try {
      await send(command)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The plan could not be updated.')
    }
  }

  // `plan.releaseActive` frees whatever plan currently holds the slot; arming the plan the
  // driver actually asked for is the natural next step, so the takeover is one confirmed
  // action instead of two separate clicks (spec 2.1: "explicit takeover").
  const releaseAndArm = async (planId: string) => {
    setActionError(null)
    try {
      await send(buildPlanReleaseActive())
      await send(buildPlanArm(planId))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The plan could not be armed.')
    }
  }

  const active = activePlan(plans)
  const editing = form?.kind === 'edit' ? (plans.find((plan) => plan.id === form.planId) ?? null) : null
  const blockedBy = opened && active && active.id !== opened.id ? active : null

  const confirmAction = () => {
    if (!confirm) return
    setConfirm(null)
    switch (confirm.kind) {
      case 'delete':
        if (openId === confirm.plan.id) setOpenId(null)
        void runAction(buildPlanDelete(confirm.plan.id))
        return
      case 'takeOver':
        void releaseAndArm(confirm.plan.id)
        return
      case 'skipQualifying':
        void runAction(buildPlanStart(confirm.plan.id, 'Race'))
        return
    }
  }

  return (
    <div className="planner-page">
      <PageHeader title="Session planner">
        {opened ? (
          <PlanCommands
            plan={opened}
            blockedBy={blockedBy}
            onArm={() => (blockedBy ? setConfirm({ kind: 'takeOver', plan: opened, active: blockedBy }) : void runAction(buildPlanArm(opened.id)))}
            onDisarm={() => void runAction(buildPlanDisarm(opened.id))}
            onStart={(kind) =>
              kind === 'Race' && startingRaceSkipsQualifying(opened)
                ? setConfirm({ kind: 'skipQualifying', plan: opened })
                : void runAction(buildPlanStart(opened.id, kind))
            }
            onStop={() => void runAction(buildPlanStop(opened.id))}
            onEdit={() => setForm({ kind: 'edit', planId: opened.id })}
            onDelete={() => setConfirm({ kind: 'delete', plan: opened })}
          />
        ) : (
          <>
            <button type="button" className="button primary" onClick={() => setForm({ kind: 'quick' })}>
              <Zap /> Quick plan
            </button>
            <button type="button" className="button" onClick={() => setForm({ kind: 'create' })}>
              <Plus /> New plan…
            </button>
            {onImportResults && (
              <button type="button" className="button subtle" onClick={onImportResults}>
                <Download /> Import results
              </button>
            )}
            <span className="command-spacer" />
            <button type="button" className="button subtle" onClick={() => setSettingsOpen(true)}>
              <Settings /> Planner settings
            </button>
          </>
        )}
      </PageHeader>

      {actionError && (
        <div className="infobar error" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">Plan not updated</strong>
          <span className="infobar-message">{actionError}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setActionError(null)}>
            <DismissGlyph />
          </button>
        </div>
      )}

      {opened ? (
        <PlanDetail
          plan={opened}
          fuel={planFuel[opened.id] ?? null}
          blockedBy={blockedBy}
          onBack={() => setOpenId(null)}
          onCommand={(command) => void runAction(command)}
        />
      ) : plans.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ListChecks size={28} strokeWidth={1.5} />
            <h2>No session plans yet</h2>
            <p>A plan follows a race weekend: what you chase in qualifying and the race, and the fuel it takes.</p>
          </div>
        </div>
      ) : (
        <PlanLists plans={plans} onOpen={setOpenId} />
      )}

      {(form?.kind === 'create' || form?.kind === 'quick') && (
        <NewPlanDialog
          kind={form.kind}
          reserve={settings.fuelReserveLaps}
          onClose={() => setForm(null)}
          onSubmit={async (input) => {
            await send(buildPlanCreate(input))
            setForm(null)
          }}
        />
      )}

      {editing && (
        <PlanFormDialog
          initial={editing}
          choices={NO_CHOICES}
          onClose={() => setForm(null)}
          onSubmit={async (input) => {
            await send(
              buildPlanUpdate(editing.id, {
                name: input.name,
                qualifyingIncluded: input.qualifyingIncluded,
                raceLengthFormat: input.raceLengthFormat,
                raceLengthValue: input.raceLengthValue,
                fuelReserveLaps: input.fuelReserveLaps,
                avgLapTimeSeconds: input.avgLapTimeSeconds,
                fuelPerLapLiters: input.fuelPerLapLiters,
                notes: input.notes,
              }),
            )
            setForm(null)
          }}
        />
      )}

      {confirm && <PlannerConfirmDialog confirm={confirm} onConfirm={confirmAction} onCancel={() => setConfirm(null)} />}

      {settingsOpen && <PlannerSettingsDialog settings={settings} onChange={(patch) => void runAction(buildPlannerSettings(patch))} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

type PlanForm = { kind: 'quick' } | { kind: 'create' } | { kind: 'edit'; planId: string }

type PlannerConfirm =
  | { kind: 'delete'; plan: SessionPlan }
  | { kind: 'takeOver'; plan: SessionPlan; active: SessionPlan }
  | { kind: 'skipQualifying'; plan: SessionPlan }

function PlanStatusLabel({ status }: { status: PlanStatus }) {
  return <Status tone={PLAN_STATUS_TONE[status]}>{status}</Status>
}

const lower = (kind: SegmentKind) => kind.toLowerCase()

const formatDay = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Command bar of an opened plan ──────────────────────────────────────────

/**
 * Arm plan is the one primary action, and only while the plan is not armed: once it is, the
 * game moves the plan on. Starting the next session by hand and disarming stay as quiet
 * buttons, finishing a tracked plan as a standard one. Edit and Delete trail them.
 */
function PlanCommands({
  plan,
  blockedBy,
  onArm,
  onDisarm,
  onStart,
  onStop,
  onEdit,
  onDelete,
}: {
  plan: SessionPlan
  blockedBy: SessionPlan | null
  onArm: () => void
  onDisarm: () => void
  onStart: (kind: SegmentKind) => void
  onStop: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const next = nextSegment(plan)

  return (
    <>
      {plan.status === 'Tracking' ? (
        <button type="button" className="button" onClick={onStop}>
          <Square /> Finish plan
        </button>
      ) : plan.status === 'Armed' ? (
        <>
          <button type="button" className="button subtle" onClick={() => onStart(next)}>
            <Play /> Start {lower(next)} now
          </button>
          <button type="button" className="button subtle" onClick={onDisarm}>
            <CircleOff /> Disarm
          </button>
        </>
      ) : (
        <button type="button" className="button primary" onClick={onArm} title={blockedBy ? `Releases “${blockedBy.name}” first` : undefined}>
          <CircleDot /> Arm plan
        </button>
      )}
      <CommandDivider />
      <button type="button" className="button subtle" onClick={onEdit}>
        <Pencil /> Edit
      </button>
      <button type="button" className="button subtle" onClick={onDelete}>
        <Trash2 /> Delete
      </button>
    </>
  )
}

// ── The weekend as a lap ───────────────────────────────────────────────────

/**
 * Practice → the plan's sessions → the finish, drawn like the first-run timeline: the line
 * fills in brand orange up to the dot, which sits on the session being driven or coming next.
 */
function WeekendTimeline({ plan, compact = false }: { plan: SessionPlan; compact?: boolean }) {
  const { stops, at } = weekendTimeline(plan)
  const position = (index: number) => `${(index / (stops.length - 1)) * 100}%`
  return (
    <div className={compact ? 'planner-timeline compact' : 'planner-timeline'} role="img" aria-label={`At ${stops[at]}`}>
      <div className="planner-timeline-track">
        <div className="planner-timeline-done" style={{ width: position(at) }} />
        {stops.slice(0, -1).map((stop, index) => (
          <span key={stop} className={index <= at ? 'planner-timeline-sector done' : 'planner-timeline-sector'} style={{ left: position(index) }} />
        ))}
        <span className="planner-timeline-car" style={{ left: position(at) }} />
      </div>
      <ol className="planner-timeline-labels">
        {stops.map((stop, index) => (
          <li key={stop} className={index === at ? 'current' : index < at ? 'done' : undefined} style={{ left: position(index) }}>
            {stop === 'Finish' && <Flag size={12} />}
            {stop}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── Plan list (the page's landing) ─────────────────────────────────────────

function PlanLists({ plans, onOpen }: { plans: readonly SessionPlan[]; onOpen: (planId: string) => void }) {
  const { open, finished } = groupPlans(plans)
  const upNext = upNextPlan(plans)

  return (
    <>
      {upNext && <UpNextCard plan={upNext} onOpen={() => onOpen(upNext.id)} />}
      <PlanListCard title="Open" plans={open} emptyText="No open plans. Arm a finished plan again, or create a new one." onOpen={onOpen} />
      {finished.length > 0 && <PlanListCard title="Done" plans={finished} onOpen={onOpen} />}
    </>
  )
}

/** The plan that's next: its name, how far along the weekend it is, and what it chases. */
function UpNextCard({ plan, onOpen }: { plan: SessionPlan; onOpen: () => void }) {
  const target = headlineTarget(plan)
  const kind = openSegment(plan)?.kind ?? nextSegment(plan)
  const context = [plan.car, plan.track].filter((value) => value.length > 0).join(' · ')
  return (
    <section className="card planner-upnext" aria-label="Up next">
      <div className="planner-upnext-main">
        <span className="planner-kicker">{plan.status === 'Tracking' ? 'Live' : 'Up next'}</span>
        <span className="planner-upnext-name">{plan.name}</span>
        {context && <span className="muted">{context}</span>}
      </div>
      <WeekendTimeline plan={plan} compact />
      <div className="planner-upnext-facts">
        <span>
          <span className="muted">{kind} target</span>
          <b className="tabular">{target ? formatLapTime(target.lapTimeSeconds) : '—'}</b>
        </span>
        <span>
          <span className="muted">Race</span>
          <b>{raceLengthShort(plan)}</b>
        </span>
      </div>
      <button type="button" className="button" onClick={onOpen}>
        Open plan <ChevronRight />
      </button>
    </section>
  )
}

function PlanListCard({ title, plans, emptyText, onOpen }: { title: string; plans: readonly SessionPlan[]; emptyText?: string; onOpen: (planId: string) => void }) {
  return (
    <section className="card list-card" aria-label={title}>
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        <span className="muted tabular">{plans.length}</span>
      </div>
      <div className="list-header planner-plan-columns">
        <span>Plan</span>
        <span>Car · Track</span>
        <span>Status</span>
        <span>Next</span>
        <span>Target</span>
        <span>Laps</span>
        <span />
      </div>
      {plans.length === 0 ? (
        <p className="muted list-card-empty">{emptyText}</p>
      ) : (
        <div className="list-rows">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} onOpen={() => onOpen(plan.id)} />
          ))}
        </div>
      )}
    </section>
  )
}

function PlanRow({ plan, onOpen }: { plan: SessionPlan; onOpen: () => void }) {
  const context = [plan.car, plan.track].filter((value) => value.length > 0).join(' · ')
  const { laps } = planLapStats(plan)
  const target = headlineTarget(plan)
  const when = plan.endedAt ? `Ended ${formatDay(plan.endedAt)}` : plan.createdAt ? `Made ${formatDay(plan.createdAt)}` : ''

  // The whole row opens the plan; the name is its keyboard target (Enter/Space click it, and
  // the click bubbles here).
  return (
    <div className="list-row planner-plan-columns planner-row" onClick={onOpen}>
      <span className="planner-row-plan">
        <span className="planner-row-title">
          <button type="button" className="planner-row-name" title={plan.name}>
            {plan.name}
          </button>
          {plan.mode === 'Quick' && <span className="chip chip-muted">Quick</span>}
        </span>
        {when && <span className="planner-sub">{when}</span>}
      </span>
      <span className="planner-row-context" title={context}>
        {context || 'No car or track'}
      </span>
      <PlanStatusLabel status={plan.status} />
      <span className="muted">{nextStepLabel(plan)}</span>
      <span className="tabular">{target ? formatLapTime(target.lapTimeSeconds) : '—'}</span>
      <span className="planner-row-laps">
        <LapStrip times={recentLapTimes(plan)} />
        <span className="muted tabular">{laps}</span>
      </span>
      <ChevronRight size={14} className="planner-row-chevron" />
    </div>
  )
}

/**
 * Lap times as a bar strip (oldest → newest, faster = taller, the best one in full label colour).
 * Nothing driven shows the route glyph — an empty plot would read as "all laps were zero".
 */
function LapStrip({ times, bar = 3, height = 16 }: { times: readonly number[]; bar?: number; height?: number }) {
  if (times.length === 0) return <Route size={14} className="planner-strip-empty" aria-label="No laps recorded" />

  const gap = bar > 4 ? 2 : 1
  const min = Math.min(...times)
  const span = Math.max(...times) - min
  const width = times.length * (bar + gap) - gap
  return (
    <svg className="planner-strip" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${times.length} laps`}>
      {times.map((time, index) => {
        const tall = span > 0 ? 4 + (1 - (time - min) / span) * (height - 4) : height / 2
        return <rect key={index} className={time === min ? 'best' : undefined} x={index * (bar + gap)} y={height - tall} width={bar} height={tall} rx={1} />
      })}
    </svg>
  )
}

// ── An opened plan ─────────────────────────────────────────────────────────

function segmentSummary(segment: PlanSegment): string {
  const validTimes = segment.laps.filter((lap) => lap.isValid).map((lap) => lap.lapTimeSeconds)
  const laps = segment.laps.length
  const lapWord = laps === 1 ? 'lap' : 'laps'
  return validTimes.length > 0 ? `${laps} ${lapWord} · best ${formatLapTime(Math.min(...validTimes))}` : `${laps} ${lapWord}`
}

/**
 * The plan's target choices, read when the plan opens and again when it records a lap (a new
 * lap can be a new fastest). A focused host endpoint: they come from every lap-history file.
 */
function usePlanTargets(plan: SessionPlan): PlanTargetScopeGroup[] | null {
  const [groups, setGroups] = useState<PlanTargetScopeGroup[] | null>(null)
  const { laps } = planLapStats(plan)
  useEffect(() => {
    let live = true
    void bridge.planTargets(plan.id).then((loaded) => {
      if (live) setGroups(loaded)
    })
    return () => {
      live = false
    }
  }, [plan.id, laps])
  return groups
}

function PlanDetail({
  plan,
  fuel,
  blockedBy,
  onBack,
  onCommand,
}: {
  plan: SessionPlan
  fuel: RaceFuelEstimate | null
  blockedBy: SessionPlan | null
  onBack: () => void
  onCommand: (command: SprintCommand) => void
}) {
  const context = [plan.car, plan.track].filter((value) => value.length > 0).join(' · ')
  const tracking = openSegment(plan)
  const warning = plan.warnings.length > 0 ? plan.warnings[plan.warnings.length - 1] : null
  const canArm = plan.status !== 'Armed' && plan.status !== 'Tracking'
  const groups = usePlanTargets(plan)
  const [picking, setPicking] = useState<SegmentKind | null>(null)
  const next = nextSegment(plan)
  const canPick = groups !== null && groups.length > 0

  return (
    <>
      <div className="planner-plan-head">
        <button type="button" className="button subtle planner-back" onClick={onBack}>
          <ChevronLeft /> All plans
        </button>
        <div className="planner-plan-heading">
          <h2 className="planner-plan-name">{plan.name}</h2>
          <PlanStatusLabel status={plan.status} />
          {plan.mode === 'Quick' && <span className="chip chip-muted">Quick</span>}
        </div>
        {context && <span className="muted">{context}</span>}
      </div>

      {tracking ? (
        <div className="infobar success" role="status">
          <span className="infobar-icon">
            <Check />
          </span>
          <strong className="infobar-title">Tracking {lower(tracking.kind)}</strong>
          <span className="infobar-message">
            {segmentSummary(tracking)}
            {tracking.kind === 'Qualifying' && ' · moves on to the race when the game does'}
          </span>
        </div>
      ) : plan.status === 'Armed' ? (
        <div className="infobar info" role="status">
          <span className="infobar-icon">i</span>
          <strong className="infobar-title">Waiting for {lower(next)}</strong>
          <span className="infobar-message">The plan starts by itself when the game is in {lower(next)}.</span>
        </div>
      ) : null}

      {warning && (
        <div className="infobar warning" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">Check the plan</strong>
          <span className="infobar-message">{warning.message}</span>
        </div>
      )}

      {canArm && blockedBy && (
        <div className="infobar info" role="status">
          <span className="infobar-icon">i</span>
          <strong className="infobar-title">“{blockedBy.name}” is {blockedBy.status.toLowerCase()}</strong>
          <span className="infobar-message">Only one plan can be active. Arming this plan releases it.</span>
        </div>
      )}

      <WeekendTimeline plan={plan} />

      <div className="planner-sessions">
        <PracticeCard fuel={fuel} practice={groups === null ? undefined : practiceSummary(groups)} />
        <SessionCard plan={plan} kind="Qualifying" canPick={canPick} onChange={() => setPicking('Qualifying')} />
        <SessionCard plan={plan} kind="Race" fuel={fuel} canPick={canPick} onChange={() => setPicking('Race')} />
      </div>

      {plan.notes && (
        <section className="card planner-notes" aria-label="Notes">
          <span className="planner-session-icon">
            <NotebookPen size={15} />
          </span>
          <p>{plan.notes}</p>
        </section>
      )}

      {picking && groups && (
        <TargetDialog
          kind={picking}
          groups={groups}
          current={targetsFor(plan, picking)?.lapTime ?? null}
          fromNextLap={plan.status === 'Tracking'}
          onPick={(option) => {
            setPicking(null)
            onCommand(buildPlanSetTarget(plan.id, picking, option))
          }}
          onClear={() => {
            setPicking(null)
            onCommand(buildPlanClearTarget(plan.id, picking))
          }}
          onCancel={() => setPicking(null)}
        />
      )}
    </>
  )
}

/**
 * Practice is never started: every lap at this car and track is recorded, plan or no plan. Its
 * facts are the figures the race fuel rests on: the lap history's medians, else the plan's values.
 */
function PracticeCard({ fuel, practice }: { fuel: RaceFuelEstimate | null; practice: PracticeSummary | null | undefined }) {
  return (
    <section className={practice ? 'card planner-session done' : 'card planner-session'} aria-label="Practice">
      <div className="planner-session-head">
        <span className="planner-session-icon">
          <Route size={16} />
        </span>
        <h3>Practice</h3>
        {practice && <span className="muted tabular">{practice.laps === 1 ? '1 lap' : `${practice.laps} laps`}</span>}
      </div>
      {practice === undefined ? (
        <div className="planner-session-figure planner-figure-skeleton skeleton" />
      ) : practice === null ? (
        <p className="muted planner-session-empty">No practice here yet. Every lap you drive with this car at this track shows up here.</p>
      ) : (
        <>
          <div className="planner-session-figure">
            <span className="muted">Best</span>
            <span className="planner-big tabular">{formatLapTime(practice.best)}</span>
            <span className="planner-sub">Median {formatLapTime(practice.median)}</span>
          </div>
          <LapStrip times={practice.times.slice(-24)} bar={10} height={28} />
        </>
      )}
      <dl className="planner-facts">
        <Fact label="Fuel per lap">
          <FigureValue figure={fuel?.fuelPerLap ?? null} format={(liters) => `${liters.toFixed(2)} L`} />
        </Fact>
        <Fact label="Lap time">
          <FigureValue figure={fuel?.lapTime ?? null} format={formatLapTime} />
        </Fact>
      </dl>
    </section>
  )
}

const SESSION_BADGE: Record<'live' | 'next' | 'done', { label: string; className: string }> = {
  live: { label: 'Live', className: 'chip chip-success' },
  next: { label: 'Next', className: 'chip' },
  done: { label: 'Done', className: 'chip chip-muted' },
}

/**
 * Qualifying or the race: what it chases and where that comes from, then its facts. The race's
 * are the host's fuel estimate (`fuel`) and the race format the game reported, once it has.
 */
function SessionCard({
  plan,
  kind,
  fuel = null,
  canPick,
  onChange,
}: {
  plan: SessionPlan
  kind: SegmentKind
  fuel?: RaceFuelEstimate | null
  canPick: boolean
  onChange: () => void
}) {
  const state = sessionState(plan, kind)
  const target = targetsFor(plan, kind)?.lapTime ?? null
  const segment = plan.segments.find((candidate) => candidate.kind === kind) ?? null
  const badge = state === 'live' || state === 'next' || state === 'done' ? SESSION_BADGE[state] : null
  const notInPlan = kind === 'Qualifying' && !plan.qualifyingIncluded

  return (
    <section className={`card planner-session ${state}`} aria-label={kind}>
      <div className="planner-session-head">
        <span className="planner-session-icon">{kind === 'Qualifying' ? <Timer size={16} /> : <Flag size={16} />}</span>
        <h3>{kind}</h3>
        {badge && <span className={badge.className}>{badge.label}</span>}
      </div>
      {notInPlan ? (
        <p className="muted planner-session-empty">Not in this plan. Edit the plan to add qualifying.</p>
      ) : (
        <div className="planner-session-figure with-action">
          <span className="muted">Target</span>
          <span className="planner-big tabular">{target ? formatLapTime(target.lapTimeSeconds) : '—'}</span>
          <span className="planner-sub" title={target ? targetTierNote(target) : undefined}>
            {target ? targetSummary(target) : canPick ? 'No target yet' : 'Drive or import laps here to pick one'}
          </span>
          {canPick && state !== 'done' && state !== 'skipped' && (
            <button type="button" className="button subtle planner-change" onClick={onChange}>
              {target ? 'Change…' : 'Pick…'}
            </button>
          )}
        </div>
      )}
      {!notInPlan && (
        <dl className="planner-facts">
          {kind === 'Race' && <RaceFacts plan={plan} fuel={fuel} />}
          {segment && <Fact label="Driven">{segmentSummary(segment)}</Fact>}
          {kind === 'Qualifying' && !segment && <Fact label="Starts">When the game is in qualifying</Fact>}
        </dl>
      )}
    </section>
  )
}

/** The race's length, the format the game runs it in, its fuel and that fuel per stint. */
function RaceFacts({ plan, fuel }: { plan: SessionPlan; fuel: RaceFuelEstimate | null }) {
  const laps = fuel?.laps ?? null
  const detected = detectedRaceFormat(plan)
  const detectedLabel = detected !== null ? detectedFormatLabel(detected) : null
  return (
    <>
      <Fact label="Length">{laps !== null && plan.raceLengthFormat === 'TimeBased' ? `${raceLengthShort(plan)} · ≈${laps} laps` : raceLengthShort(plan)}</Fact>
      {detectedLabel && <Fact label="Game runs it">{detectedLabel}</Fact>}
      <Fact label="Fuel for the race">
        {fuel?.totalLiters != null ? (
          <>
            ≈{Math.ceil(fuel.totalLiters)} L<span className="planner-sub">{reserveNote(fuel.reserveLaps)}</span>
          </>
        ) : (
          '—'
        )}
      </Fact>
      {fuel?.totalLiters != null && (
        <Fact label="Per stint">
          {fuel.stints ? (
            <>
              {stintsLabel(fuel.stints.liters)}
              <span className="planner-sub">{fuel.stints.lapsPerStint} laps on a full tank</span>
            </>
          ) : (
            <span className="muted">Needs the tank size, from a lap in this car</span>
          )}
        </Fact>
      )}
    </>
  )
}

/** An estimate's figure and where it came from, or "Not set" when neither history nor the plan has it. */
function FigureValue({ figure, format }: { figure: EstimateFigure | null; format: (value: number) => string }) {
  if (figure === null) return <span className="muted">Not set</span>
  return (
    <>
      {format(figure.value)}
      <span className="planner-sub">{figureSource(figure)}</span>
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="planner-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * Picks a session's target from laps that were driven: a scope (practice, qualifying, …), then
 * its fastest, median or slowest lap, or any one of its laps. A pick applies at once (from the
 * next lap while tracking); there is no typed lap time.
 */
function TargetDialog({
  kind,
  groups,
  current,
  fromNextLap,
  onPick,
  onClear,
  onCancel,
}: {
  kind: SegmentKind
  groups: readonly PlanTargetScopeGroup[]
  current: PlanTarget | null
  fromNextLap: boolean
  onPick: (option: PlanTargetOption) => void
  onClear: () => void
  onCancel: () => void
}) {
  const initial = groups.findIndex((group) => current !== null && group.scope === current.scope && group.programType === (current.programType ?? null))
  const [scopeIndex, setScopeIndex] = useState(Math.max(0, initial))
  const [specific, setSpecific] = useState(current?.statistic === 'Custom')
  const group = groups[scopeIndex] ?? groups[0]

  const lapSub = (option: PlanTargetOption) =>
    [option.lapSessionStartedAt ? formatDay(option.lapSessionStartedAt) : null, option.tierNote].filter((part) => part !== null).join(' · ')
  const row = (option: PlanTargetOption, label: string, sub: string) => {
    const picked = isPickedTarget(current, option)
    return (
      <button
        key={`${option.statistic}-${option.lapSessionId}-${option.lapNumber}`}
        type="button"
        className={picked ? 'planner-pick picked' : 'planner-pick'}
        aria-pressed={picked}
        onClick={() => onPick(option)}
      >
        <span className="planner-pick-text">
          <span>{label}</span>
          <span className="planner-sub">{sub}</span>
        </span>
        <span className="tabular planner-pick-time">{formatLapTime(option.lapTimeSeconds)}</span>
      </button>
    )
  }

  return (
    <ContentDialog
      title={`${kind} target`}
      className="planner-target-dialog"
      closeOnSmokeClick
      onCancel={onCancel}
      footer={
        <>
          {current && (
            <button type="button" className="button subtle planner-clear" onClick={onClear}>
              Clear target
            </button>
          )}
          <button type="button" className="button" onClick={onCancel} autoFocus>
            Cancel
          </button>
        </>
      }
    >
      {groups.length > 1 && (
        <div className="segmented planner-scopes" role="radiogroup" aria-label="Laps from">
          {groups.map((candidate, index) => (
            <button
              key={`${candidate.scope}-${candidate.programType ?? ''}`}
              type="button"
              role="radio"
              className="segmented-item"
              aria-checked={index === scopeIndex}
              onClick={() => {
                setScopeIndex(index)
                setSpecific(false)
              }}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}
      {group && (
        <div className="planner-picks">
          {group.options
            .filter((option) => option.statistic !== 'Custom')
            .map((option) => row(option, option.statistic, `Lap ${option.lapNumber} · ${lapSub(option)}`))}
          {specific ? (
            <div className="planner-picks-laps">{group.laps.map((option) => row(option, `Lap ${option.lapNumber}`, lapSub(option)))}</div>
          ) : (
            <button type="button" className="planner-pick" onClick={() => setSpecific(true)}>
              <span className="planner-pick-text">
                <span>A specific lap…</span>
                <span className="planner-sub">
                  Any of {group.laps.length} {group.label.toLowerCase()} {group.laps.length === 1 ? 'lap' : 'laps'}
                </span>
              </span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
      <p className="muted planner-target-foot">{fromNextLap ? 'Applies from the next lap.' : 'Your dash measures against this lap.'}</p>
    </ContentDialog>
  )
}

// ── Dialogs ────────────────────────────────────────────────────────────────

function DismissGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
      <path d="M1 1l8 8M9 1 1 9" />
    </svg>
  )
}

/** Delete, take over the active slot, or race without qualifying. A click on the smoke cancels. */
function PlannerConfirmDialog({ confirm, onConfirm, onCancel }: { confirm: PlannerConfirm; onConfirm: () => void; onCancel: () => void }) {
  const copy: { title: string; body: ReactNode; action: string; destructive: boolean } =
    confirm.kind === 'delete'
      ? {
          title: 'Delete plan?',
          body: (
            <>
              “{confirm.plan.name}” and its tracked segments are deleted. This cannot be undone.
            </>
          ),
          action: 'Delete',
          destructive: true,
        }
      : confirm.kind === 'takeOver'
        ? {
            title: `Release “${confirm.active.name}”?`,
            body:
              confirm.active.status === 'Tracking'
                ? `It is tracking a session right now. Arming “${confirm.plan.name}” stops that first.`
                : `Only one plan can be armed at a time. Arming “${confirm.plan.name}” disarms it.`,
            action: 'Release and arm',
            destructive: false,
          }
        : {
            title: 'Start the race without qualifying?',
            body: `“${confirm.plan.name}” includes qualifying, and it has not run yet.`,
            action: 'Start race',
            destructive: false,
          }

  // A destructive action never takes Enter, so Cancel holds focus (ConfirmDialog's default).
  return (
    <ConfirmDialog
      title={copy.title}
      message={copy.body}
      confirmLabel={copy.action}
      destructive={copy.destructive}
      className="planner-confirm"
      closeOnSmokeClick
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

const FORM_STEPS = ['Where and what', 'Sessions and length', 'Fuel'] as const

const RACE_LENGTH_FORMATS: readonly { value: RaceLengthFormat; label: string }[] = [
  { value: 'Unknown', label: 'Not set' },
  { value: 'TimeBased', label: 'Time-based' },
  { value: 'LapBased', label: 'Lap-based' },
]

/** Nothing detected: Quick plan asks for everything. */
const NOTHING_DETECTED: PlanDetection = { context: { game: '', car: '', track: '' }, raceLength: null, hasFuelHistory: false, missing: ['Context', 'RaceLength', 'Fuel'] }

/** Editing locks game/car/track, so it needs nothing recorded to pick from. */
const NO_CHOICES: PlanContextChoices = { prefill: { game: '', car: '', track: '' }, games: [], tracks: [], cars: [], byGame: [], detection: NOTHING_DETECTED }

/** How long the context may take before the dialog says it is loading, so a fast read never flashes. */
const CONTEXT_LOADING_DELAY_MS = 200

/**
 * Quick plan and New plan…: fetch the prefill, the recorded game/car/track choices and what the
 * host detected first (a focused host endpoint — they come from every lap-history file, too much
 * for the polled state), then open the dialog on them, so its initial values (and its "unsaved
 * changes" baseline) are the prefill. Detection is taken once, here: a field never vanishes under
 * the driver's cursor because the game reported something meanwhile. Suggestions are a
 * convenience: a failed read still opens the dialog, asking for everything, fully typeable.
 */
function NewPlanDialog({
  kind,
  reserve,
  onClose,
  onSubmit,
}: {
  kind: 'quick' | 'create'
  /** The planner's default reserve, which a new plan starts with. */
  reserve: number
  onClose: () => void
  /** Creates the plan; rejects with the host's reason, and the dialog stays open showing it. */
  onSubmit: (input: CreatePlanInput) => Promise<void>
}) {
  const [choices, setChoices] = useState<PlanContextChoices | null>(null)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => setSlow(true), CONTEXT_LOADING_DELAY_MS)
    bridge
      .planContext()
      .then((loaded) => {
        if (live) setChoices(loaded)
      })
      .catch((error: unknown) => {
        console.error('Loading recorded cars and tracks failed', error)
        if (live) setChoices(NO_CHOICES)
      })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [])

  if (choices) {
    return kind === 'quick' ? (
      <QuickPlanDialog choices={choices} reserve={reserve} onClose={onClose} onSubmit={onSubmit} />
    ) : (
      <PlanFormDialog choices={choices} reserve={reserve} onClose={onClose} onSubmit={onSubmit} />
    )
  }
  if (!slow) return null
  return (
    <ContentDialog
      title={kind === 'quick' ? 'Quick plan' : 'New plan'}
      onCancel={onClose}
      closeOnSmokeClick
      footer={
        <button type="button" className="button" onClick={onClose} autoFocus>
          Cancel
        </button>
      }
    >
      <p className="content-dialog-text muted" role="status">
        Loading recorded cars and tracks…
      </p>
    </ContentDialog>
  )
}

/**
 * Quick plan (#183): a plan for the session about to be driven, quick enough for a daily race. What
 * Sprint detected shows as summary rows; it asks only for what it could not detect (the context, the
 * race length outside a race), then the fuel calculator: lap time and fuel per lap, filled from the
 * driver's laps here and editable, and the reserve (the planner's default). The race's laps, fuel and
 * stints follow the inputs live — worked out by the host (`usePlanFuel`), never here. The plan keeps
 * the figures as confirmed, is marked Quick, named after its track and car (the host's rule, previewed
 * while they are typed); practice programs are not offered as its targets (the host leaves them out).
 */
function QuickPlanDialog({
  choices,
  reserve,
  onClose,
  onSubmit,
}: {
  choices: PlanContextChoices
  reserve: number
  onClose: () => void
  onSubmit: (input: CreatePlanInput) => Promise<void>
}) {
  const { detection } = choices
  const { saving, error, save } = usePlanSave(onSubmit)
  const asks = (field: PlanDetection['missing'][number]) => detection.missing.includes(field)
  const [answers, setAnswers] = useState<QuickPlanAnswers>({
    ...detection.context,
    raceLengthFormat: 'TimeBased',
    raceLength: '',
    lapTime: EMPTY_FIGURE,
    fuelPerLap: EMPTY_FIGURE,
    fuelReserveLaps: reserve,
  })
  const set = (patch: Partial<QuickPlanAnswers>) => setAnswers((current) => ({ ...current, ...patch }))
  const plan = quickPlanInput(detection, answers)
  const fuel = usePlanFuel(planFuelRequest(plan))
  usePrefillFigures(fuel, plan, setAnswers)
  const narrowed = choicesForGame(choices, answers.game)
  const asking = asks('Context') || asks('RaceLength')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save(plan)
  }

  return (
    <ContentDialog
      title="Quick plan"
      onSubmit={submit}
      onCancel={onClose}
      closeOnSmokeClick
      footer={
        <>
          <button type="submit" className="button primary" autoFocus={!asking} disabled={saving}>
            Create plan
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      {error && <PlanSaveError title="Plan not created" message={error} />}

      {asks('Context') && <p className="content-dialog-text muted">The game has not said where you are driving yet.</p>}

      {asks('Context') && (
        <div className="planner-form-grid">
          <label className="field">
            <span>Game</span>
            <SuggestBox value={answers.game} onChange={(game) => set({ game })} suggestions={choices.games} placeholder="e.g. Le Mans Ultimate" autoFocus />
          </label>
          <label className="field">
            <span>Car</span>
            <SuggestBox value={answers.car} onChange={(car) => set({ car })} suggestions={narrowed.cars} placeholder="e.g. Hypercar Porsche" />
          </label>
          <label className="field planner-form-wide">
            <span>Track</span>
            <SuggestBox value={answers.track} onChange={(track) => set({ track })} suggestions={narrowed.tracks} placeholder="e.g. Spa-Francorchamps" />
          </label>
        </div>
      )}

      <dl className="planner-facts planner-quick-detected" aria-label="Plan">
        {asks('Context') ? (
          <Fact label="Name">{derivedPlanName(plan.track, plan.car)}</Fact>
        ) : (
          <Fact label="Car · Track">
            {plan.car}
            <span className="planner-sub">{plan.track}</span>
          </Fact>
        )}
        {detection.raceLength && <Fact label="Race">{formatRaceLength(detection.raceLength.format, detection.raceLength.value)}</Fact>}
      </dl>

      {asks('RaceLength') && (
        <div className="field">
          <span id="planner-quick-length-label">Race length</span>
          <div className="planner-race-length">
            <div className="segmented" role="radiogroup" aria-labelledby="planner-quick-length-label">
              {RACE_LENGTH_FORMATS.filter((option) => option.value !== 'Unknown').map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={answers.raceLengthFormat === option.value}
                  className="segmented-item"
                  onClick={() => set({ raceLengthFormat: option.value === 'LapBased' ? 'LapBased' : 'TimeBased' })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="planner-unit-input">
              <input
                type="number"
                min={0}
                max={maxRaceLength(answers.raceLengthFormat)}
                value={answers.raceLength}
                onChange={(event) => set({ raceLength: event.target.value })}
                aria-label={`Race length in ${raceLengthUnit(answers.raceLengthFormat)}`}
                autoFocus={!asks('Context')}
              />
              <span className="muted">{raceLengthUnit(answers.raceLengthFormat)}</span>
            </span>
          </div>
        </div>
      )}

      <div className="planner-quick-figures">
        <FigureInput label="Lap time (s)" field={answers.lapTime} kind="lapTime" onChange={(lapTime) => set({ lapTime })} />
        <FigureInput label="Fuel per lap (L)" field={answers.fuelPerLap} kind="fuel" onChange={(fuelPerLap) => set({ fuelPerLap })} />
        <label className="field">
          <span>Reserve</span>
          <select value={answers.fuelReserveLaps} onChange={(event) => set({ fuelReserveLaps: Number(event.target.value) })}>
            {presetChoices(RESERVE_CHOICES, answers.fuelReserveLaps).map((laps) => (
              <option key={laps} value={laps}>
                {reserveLabel(laps)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QuickPlanFuel plan={plan} preview={fuel?.preview ?? null} />
    </ContentDialog>
  )
}

/**
 * The calculator's result under Quick plan's inputs: the race's laps, its fuel with the reserve,
 * and that fuel per stint once the tank is known — the host's answer, or what it still needs.
 */
function QuickPlanFuel({ plan, preview }: { plan: CreatePlanInput; preview: PlanFuelPreview | null }) {
  const estimate = preview?.outcome === 'ready' ? preview.estimate : null
  const gap = estimate ? fuelGap(plan, estimate) : null
  return (
    <dl className="planner-facts planner-quick-result" aria-label="Race fuel" aria-live="polite">
      <Fact label="Laps">{estimate?.laps != null ? (plan.raceLengthFormat === 'TimeBased' ? `≈${estimate.laps}` : estimate.laps) : '—'}</Fact>
      <Fact label="Fuel for the race">
        {estimate?.totalLiters != null ? (
          <>
            ≈{Math.ceil(estimate.totalLiters)} L<span className="planner-sub">{reserveNote(estimate.reserveLaps)}</span>
          </>
        ) : (
          <>
            —
            {preview?.outcome === 'invalid' ? <span className="planner-sub field-error">{preview.error}</span> : gap && <span className="planner-sub">{gap}</span>}
          </>
        )}
      </Fact>
      {estimate?.totalLiters != null && (
        <Fact label="Per stint">
          {estimate.stints ? (
            <>
              {stintsLabel(estimate.stints.liters)}
              <span className="planner-sub">{estimate.stints.lapsPerStint} laps on a full tank</span>
            </>
          ) : (
            <span className="muted">Needs the tank size, from a lap in this car</span>
          )}
        </Fact>
      )}
    </dl>
  )
}

/**
 * A plan dialog's lap time or fuel per lap: what the driver's laps filled in, named under it ("From
 * your 11 laps", the lap time also read as m:ss.d), until the driver types — then it is theirs.
 */
function FigureInput({
  label,
  field,
  kind,
  onChange,
}: {
  label: string
  field: FigureField
  kind: 'lapTime' | 'fuel'
  onChange: (field: FigureField) => void
}) {
  const value = figureValue(field)
  const hint = [kind === 'lapTime' && value !== null ? formatLapTime(value) : null, figureNote(field)].filter((part): part is string => part !== null).join(' · ')
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={kind === 'lapTime' ? PLAN_LIMITS.minLapTimeSeconds : 0}
        max={kind === 'lapTime' ? PLAN_LIMITS.maxLapTimeSeconds : PLAN_LIMITS.maxFuelPerLapLiters}
        step="any"
        value={figureText(field)}
        onChange={(event) => onChange({ source: 'typed', text: event.target.value })}
        placeholder="Optional"
      />
      {hint && <span className="field-hint tabular">{hint}</span>}
    </label>
  )
}

/** How long the calculator waits after the inputs last changed before asking: typing a figure is several changes. */
const FUEL_ESTIMATE_DELAY_MS = 250

type PlanFuelAnswer = { request: PlanFuelRequest; preview: PlanFuelPreview }

/**
 * The host's fuel calculator for `request` (`POST /api/planner/fuel-estimate`): asked at once, then a
 * moment after the request last changed, keeping only the latest answer. The previous answer stays
 * while the next is on its way, so the dialog does not flicker. Null until the first answer.
 */
function usePlanFuel(request: PlanFuelRequest): PlanFuelAnswer | null {
  const key = JSON.stringify(request)
  const [answer, setAnswer] = useState<PlanFuelAnswer | null>(null)
  useEffect(() => {
    let live = true
    const timer = setTimeout(
      () => {
        void bridge.planFuelEstimate(request).then((preview) => {
          if (live) setAnswer({ request, preview })
        })
      },
      answer === null ? 0 : FUEL_ESTIMATE_DELAY_MS,
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
    // Keyed on the request's content: a new object asking the same is the same question.
  }, [key])
  return answer
}

/**
 * Fills a dialog's lap time and fuel per lap from the driver's laps whenever an answer arrives for
 * the car and track the dialog names now (`prefillFigures`): never over a typed value, and never
 * from an answer about a car or track the driver has since changed.
 */
function usePrefillFigures<T extends PlanFigures>(
  fuel: PlanFuelAnswer | null,
  context: { game: string; car: string; track: string },
  update: (apply: (current: T) => T) => void,
) {
  useEffect(() => {
    if (fuel?.preview.outcome !== 'ready' || !sameContext(fuel.request, context)) return
    const { history } = fuel.preview
    update((current) => prefillFigures(current, history))
    // Only a new answer fills; the context is read as it stands when that answer arrives.
  }, [fuel])
}

/**
 * New plan… or Edit plan: a ContentDialog that walks three short steps (docs/internals/session-planner.md): where and what, sessions and length, fuel. Nothing is validated
 * per step, so the step indicator also jumps directly. Closing with changes asks first.
 * Editing locks game/car/track and mode — `plan.update` does not accept them. The name is
 * optional: its placeholder is the name the plan gets without one (`derivedPlanName`).
 *
 * Game, car and track are suggest boxes over what Sprint has recorded (the deleted Avalonia
 * `SuggestingField`): picking a recorded spelling keys the plan onto the lap-history bucket the
 * corpus already holds, while typing a car or track never driven stays possible. Cars and tracks
 * narrow to the typed game. A new plan starts from `choices.prefill` — the last game/car/track the
 * sim reported, else the most recent plan's.
 *
 * Average lap time and fuel per lap stay typeable (a car not driven yet, a number known by heart) but
 * fill from the driver's laps with the car at the track, asked again whenever those change, and say
 * so under the field. A value the driver typed is never overwritten (`FigureField`).
 */
function PlanFormDialog({
  initial,
  choices,
  reserve = 1,
  onClose,
  onSubmit,
}: {
  initial?: SessionPlan
  choices: PlanContextChoices
  /** The reserve a new plan starts with (the planner's default); an edited plan keeps its own. */
  reserve?: number
  onClose: () => void
  /** Saves the plan; rejects with the host's reason, and the dialog stays open showing it. */
  onSubmit: (input: CreatePlanInput) => Promise<void>
}) {
  const isEdit = initial !== undefined
  const { saving, error, save } = usePlanSave(onSubmit)
  const [step, setStep] = useState(0)
  const [discarding, setDiscarding] = useState(false)
  const [name, setName] = useState(initial?.name ?? '')
  const [game, setGame] = useState(initial?.game ?? choices.prefill.game)
  const [car, setCar] = useState(initial?.car ?? choices.prefill.car)
  const [track, setTrack] = useState(initial?.track ?? choices.prefill.track)
  const [qualifyingIncluded, setQualifyingIncluded] = useState(initial?.qualifyingIncluded ?? true)
  const [raceLengthFormat, setRaceLengthFormat] = useState<RaceLengthFormat>(initial?.raceLengthFormat ?? 'Unknown')
  const [raceLengthValue, setRaceLengthValue] = useState(String(initial?.raceLengthValue ?? ''))
  const [fuelReserveLaps, setFuelReserveLaps] = useState(String(initial?.fuelReserveLaps ?? reserve))
  // A stored plan's own figures are the driver's; plans stored before the host refused 0 kept it
  // for "not typed", which shows as empty. Empty figures fill from the driver's laps here.
  const [figures, setFigures] = useState<PlanFigures>({
    lapTime: storedFigure(initial?.avgLapTimeSeconds ?? null),
    fuelPerLap: storedFigure(initial?.fuelPerLapLiters ?? null),
  })
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const context = { game: game.trim(), car: car.trim(), track: track.trim() }
  usePrefillFigures(usePlanFuel(historyRequest(context)), context, setFigures)

  // What the driver's laps filled in is not a change of theirs: only typed figures count.
  const typed = (field: FigureField) => (field.source === 'typed' ? field.text : '')
  const snapshot = JSON.stringify([name, game, car, track, qualifyingIncluded, raceLengthFormat, raceLengthValue, fuelReserveLaps, typed(figures.lapTime), typed(figures.fuelPerLap), notes])
  const [initialSnapshot] = useState(snapshot)
  const dirty = snapshot !== initialSnapshot

  const requestClose = () => (dirty ? setDiscarding(true) : onClose())

  const title = isEdit ? 'Edit plan' : 'New plan'
  const narrowed = choicesForGame(choices, game)
  const lastStep = step === FORM_STEPS.length - 1

  const submit = () => {
    const parsedRaceLengthValue = Number(raceLengthValue)
    const parsedFuelReserveLaps = Number(fuelReserveLaps)

    void save({
      name: name.trim(),
      game: game.trim(),
      car: car.trim(),
      track: track.trim(),
      mode: initial?.mode ?? 'Planned',
      qualifyingIncluded,
      raceLengthFormat,
      raceLengthValue: Number.isFinite(parsedRaceLengthValue) ? parsedRaceLengthValue : 0,
      fuelReserveLaps: Number.isFinite(parsedFuelReserveLaps) ? Math.max(0, parsedFuelReserveLaps) : reserve,
      avgLapTimeSeconds: figureValue(figures.lapTime),
      fuelPerLapLiters: figureValue(figures.fuelPerLap),
      notes,
    })
  }

  // Enter in any field is the primary action: next step, or create/save on the last one.
  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (lastStep) submit()
    else setStep(step + 1)
  }

  // The discard prompt replaces the form inside the same ContentDialog (Fluent shows one dialog
  // at a time), so focus still returns to whatever opened the form once it closes.
  if (discarding) {
    return (
      <ContentDialog
        title="Discard changes?"
        role="alertdialog"
        className="planner-confirm"
        onCancel={() => setDiscarding(false)}
        footer={
          <>
            <button type="button" className="button destructive-solid" onClick={onClose}>
              Discard
            </button>
            <button type="button" className="button" onClick={() => setDiscarding(false)} autoFocus>
              Keep editing
            </button>
          </>
        }
      >
        <p className="content-dialog-text">{isEdit ? `Your changes to “${initial.name}” are lost.` : 'The new plan is not created.'}</p>
      </ContentDialog>
    )
  }

  return (
    <ContentDialog
      title={title}
      onSubmit={onFormSubmit}
      onCancel={requestClose}
      closeOnSmokeClick
      footer={
        <>
          <button type="submit" className="button primary" disabled={lastStep && saving}>
            {lastStep ? (isEdit ? 'Save changes' : 'Create plan') : 'Next'}
          </button>
          {step > 0 && (
            <button type="button" className="button" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="button" className="button" onClick={requestClose}>
            Cancel
          </button>
        </>
      }
    >
      <ol className="planner-steps" aria-label="Steps">
        {FORM_STEPS.map((label, index) => (
          <li key={label} className={index < step ? 'done' : index === step ? 'current' : undefined}>
            <button type="button" className="planner-step" aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)}>
              <span className="planner-step-marker">{index < step ? <Check size={12} strokeWidth={2.5} /> : index + 1}</span>
              <span className="planner-step-label">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {error && <PlanSaveError title={isEdit ? 'Changes not saved' : 'Plan not created'} message={error} />}

      {step === 0 && (
        <div className="planner-form-grid">
          <label className="field">
            <span>Game</span>
            <SuggestBox value={game} onChange={setGame} suggestions={choices.games} placeholder="e.g. Le Mans Ultimate" disabled={isEdit} autoFocus={!isEdit} />
          </label>
          <label className="field">
            <span>Car</span>
            <SuggestBox value={car} onChange={setCar} suggestions={narrowed.cars} placeholder="e.g. Porsche 963" disabled={isEdit} />
          </label>
          <label className="field">
            <span>Track</span>
            <SuggestBox value={track} onChange={setTrack} suggestions={narrowed.tracks} placeholder="e.g. Spa-Francorchamps" disabled={isEdit} />
          </label>
          <label className="field">
            <span>Name (optional)</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={derivedPlanName(track, car)} autoFocus={isEdit} />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="planner-form-stack">
          <label className="planner-checkbox">
            <input type="checkbox" checked={qualifyingIncluded} onChange={(event) => setQualifyingIncluded(event.target.checked)} autoFocus />
            <span>Qualifying included</span>
          </label>
          <div className="field">
            <span id="planner-length-label">Race length</span>
            <div className="planner-race-length">
              <div className="segmented" role="radiogroup" aria-labelledby="planner-length-label">
                {RACE_LENGTH_FORMATS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={raceLengthFormat === option.value}
                    className="segmented-item"
                    onClick={() => setRaceLengthFormat(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {raceLengthFormat !== 'Unknown' && (
                <span className="planner-unit-input">
                  <input
                    type="number"
                    min={0}
                    max={maxRaceLength(raceLengthFormat)}
                    value={raceLengthValue}
                    onChange={(event) => setRaceLengthValue(event.target.value)}
                    aria-label={`Race length in ${raceLengthUnit(raceLengthFormat)}`}
                  />
                  <span className="muted">{raceLengthUnit(raceLengthFormat)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="planner-form-grid">
          <label className="field">
            <span>Fuel reserve (laps)</span>
            <input type="number" min={0} max={PLAN_LIMITS.maxFuelReserveLaps} value={fuelReserveLaps} onChange={(event) => setFuelReserveLaps(event.target.value)} autoFocus />
          </label>
          <span />
          <FigureInput label="Avg lap time (s)" field={figures.lapTime} kind="lapTime" onChange={(lapTime) => setFigures((current) => ({ ...current, lapTime }))} />
          <FigureInput label="Fuel per lap (L)" field={figures.fuelPerLap} kind="fuel" onChange={(fuelPerLap) => setFigures((current) => ({ ...current, fuelPerLap }))} />
          <label className="field planner-form-wide">
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Optional" />
          </label>
        </div>
      )}
    </ContentDialog>
  )
}

/**
 * A plan dialog's save: the dialog stays open until the host accepts the plan (the parent closes
 * it then) and shows the host's reason when it refuses, so nothing typed is lost.
 */
function usePlanSave(onSubmit: (input: CreatePlanInput) => Promise<void>) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async (input: CreatePlanInput) => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(input)
    } catch (failure) {
      setError(commandErrorMessage(failure, 'The plan could not be saved.'))
      setSaving(false)
    }
  }
  return { saving, error, save }
}

/** Why the host refused a plan dialog's save, above its fields. */
function PlanSaveError({ title, message }: { title: string; message: string }) {
  return (
    <div className="infobar error" role="alert">
      <span className="infobar-icon">!</span>
      <strong className="infobar-title">{title}</strong>
      <span className="infobar-message">{message}</span>
    </div>
  )
}

/** Reads a `<select>`'s value back as a fuel history choice. */
const fuelHistoryChoice = (value: string): FuelHistoryChoice => (value === 'MatchingSessionType' ? 'MatchingSessionType' : 'AllValidLaps')

/**
 * The planner's own defaults (#103), behind the gear in its header: a feature owns its defaults.
 * Each change applies at once through `planner.settings`, so the dialog only closes. Defaults seed
 * new plans; a plan's own reserve stays its own.
 */
function PlannerSettingsDialog({ settings, onChange, onClose }: { settings: PlannerSettings; onChange: (patch: Partial<PlannerSettings>) => void; onClose: () => void }) {
  const reserves = presetChoices(RESERVE_CHOICES, settings.fuelReserveLaps)
  return (
    <ContentDialog
      title="Planner settings"
      className="planner-settings-dialog"
      closeOnSmokeClick
      onCancel={onClose}
      footer={
        <button type="button" className="button" onClick={onClose} autoFocus>
          Close
        </button>
      }
    >
      <div className="planner-settings">
        <ListRow id="planner-settings-reserve" label="Fuel reserve" detail="What a new plan carries on top of the race. Each plan can change its own.">
          {(labels) => (
            <select {...labels} value={settings.fuelReserveLaps} onChange={(event) => onChange({ fuelReserveLaps: Number(event.target.value) })}>
              {reserves.map((laps) => (
                <option key={laps} value={laps}>
                  {reserveLabel(laps)}
                </option>
              ))}
            </select>
          )}
        </ListRow>
        <ListRow id="planner-settings-history" label="Fuel and lap time from" detail="Your laps with the plan’s car at its track.">
          {(labels) => (
            <select {...labels} value={settings.fuelHistorySource} onChange={(event) => onChange({ fuelHistorySource: fuelHistoryChoice(event.target.value) })}>
              <option value="AllValidLaps">All valid laps</option>
              <option value="MatchingSessionType">Race laps only</option>
            </select>
          )}
        </ListRow>
        <ListRow id="planner-settings-mismatch" label="Warn about the race format" detail="When the game runs the race by laps and the plan by time, or the other way round.">
          {(labels) => <Switch {...labels} checked={settings.warnOnRaceFormatMismatch} onChange={(next) => onChange({ warnOnRaceFormatMismatch: next })} />}
        </ListRow>
      </div>
    </ContentDialog>
  )
}
