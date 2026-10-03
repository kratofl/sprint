import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronLeft, CircleDot, CircleOff, Download, Flag, ListChecks, Pencil, Play, Plus, Route, Square, Trash2 } from 'lucide-react'
import { bridge } from '../bridge'
import type { PlanContextChoices, SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { ConfirmDialog, ContentDialog } from '../shell/ContentDialog'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { Status } from '../shell/Status'
import { SuggestBox } from '../shell/SuggestBox'
import {
  PLAN_STATUS_TONE,
  activePlan,
  buildPlanArm,
  buildPlanCreate,
  buildPlanDelete,
  buildPlanDisarm,
  buildPlanReleaseActive,
  buildPlanStart,
  buildPlanStop,
  buildPlanUpdate,
  choicesForGame,
  formatClock,
  formatLapTime,
  groupPlans,
  nextSegment,
  openSegment,
  parsePlans,
  planLapStats,
  raceLengthLabel,
  raceLengthUnit,
  recentLapTimes,
  startingRaceSkipsQualifying,
  targetSourceLabel,
  targetTierNote,
  targetsFor,
} from './SessionPlannerDomain'
import type { CreatePlanInput, PlanMode, PlanSegment, PlanStatus, RaceLengthFormat, SegmentKind, SessionPlan } from './SessionPlannerDomain'
import './SessionPlannerView.css'

/**
 * Session planner: create/edit/arm/start/stop a race-weekend plan (docs/internals/
 * session-planner.md).
 *
 * The page lands on the plan list; a plan opens on an explicit click and "All plans" leads
 * back. Leaving the page closes the plan, because the router remounts the view. The
 * CommandBar carries exactly one primary action: New plan on the list, the plan's next step
 * (arm → start the next segment → stop) inside a plan. Skipping qualifying, taking over the
 * active slot and deleting each go through a ContentDialog.
 *
 * Plan targets have no write command yet (`RuntimeCoordinator` has no `plan.setTarget`), so
 * they render read-only. Everything else is a real `plan.*` command.
 *
 * The plan list's CommandBar also carries "Import results" (the LMU results archive, #185) when
 * the game has one; the dialog itself is the shell's, because the startup prompt can appear on
 * any page.
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
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanForm | null>(null)
  const [confirm, setConfirm] = useState<PlannerConfirm | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // `focusPlanId` only ever names a live plan for one render (the shell clears it right
  // after handing it off — see App.tsx), so this only ever opens the plan once; the
  // guard also means a request for a plan that no longer exists is silently ignored.
  useEffect(() => {
    if (focusPlanId && plans.some((plan) => plan.id === focusPlanId)) setOpenId(focusPlanId)
  }, [focusPlanId, plans])

  if (runtime.kind === 'loading') {
    return (
      <div className="planner-page">
        <PageHeader title="Session planner" />
        <div className="planner-kpis">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="kpi skeleton planner-kpi-skeleton" />
          ))}
        </div>
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
  const opened = openId ? (plans.find((plan) => plan.id === openId) ?? null) : null
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
            onNew={() => setForm({ kind: 'create' })}
            onEdit={() => setForm({ kind: 'edit', planId: opened.id })}
            onDelete={() => setConfirm({ kind: 'delete', plan: opened })}
          />
        ) : (
          <>
            <button type="button" className="button primary" onClick={() => setForm({ kind: 'create' })}>
              <Plus /> New plan
            </button>
            {onImportResults && (
              <button type="button" className="button subtle" onClick={onImportResults}>
                <Download /> Import results
              </button>
            )}
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
        <PlanDetail plan={opened} blockedBy={blockedBy} onBack={() => setOpenId(null)} />
      ) : plans.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ListChecks size={28} strokeWidth={1.5} />
            <h2>No session plans yet</h2>
            <p>Create a plan to track qualifying and race segments against a fuel and lap-time target.</p>
          </div>
        </div>
      ) : (
        <PlanLists plans={plans} onOpen={setOpenId} onDelete={(plan) => setConfirm({ kind: 'delete', plan })} />
      )}

      {form?.kind === 'create' && (
        <NewPlanDialog
          onClose={() => setForm(null)}
          onSubmit={(input) => {
            setForm(null)
            void runAction(buildPlanCreate(input))
          }}
        />
      )}

      {editing && (
        <PlanFormDialog
          initial={editing}
          choices={NO_CHOICES}
          onClose={() => setForm(null)}
          onSubmit={(input) => {
            setForm(null)
            void runAction(
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
          }}
        />
      )}

      {confirm && <PlannerConfirmDialog confirm={confirm} onConfirm={confirmAction} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

type PlanForm = { kind: 'create' } | { kind: 'edit'; planId: string }

type PlannerConfirm =
  | { kind: 'delete'; plan: SessionPlan }
  | { kind: 'takeOver'; plan: SessionPlan; active: SessionPlan }
  | { kind: 'skipQualifying'; plan: SessionPlan }

// ── Status (dot + word) ────────────────────────────────────────────────────

function PlanStatusLabel({ status }: { status: PlanStatus }) {
  return <Status tone={PLAN_STATUS_TONE[status]}>{status}</Status>
}

// ── Command bar of an opened plan ──────────────────────────────────────────

function PlanCommands({
  plan,
  blockedBy,
  onArm,
  onDisarm,
  onStart,
  onStop,
  onNew,
  onEdit,
  onDelete,
}: {
  plan: SessionPlan
  blockedBy: SessionPlan | null
  onArm: () => void
  onDisarm: () => void
  onStart: (kind: SegmentKind) => void
  onStop: () => void
  onNew: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const next = nextSegment(plan)

  return (
    <>
      {plan.status === 'Tracking' ? (
        <button type="button" className="button primary" onClick={onStop}>
          <Square /> Stop {openSegment(plan)?.kind.toLowerCase() ?? 'tracking'}
        </button>
      ) : plan.status === 'Armed' ? (
        <>
          <button type="button" className="button primary" onClick={() => onStart(next)}>
            <Play /> Start {next.toLowerCase()}
          </button>
          {/* The race is still reachable before qualifying has run — behind a confirm (see onStart). */}
          {next === 'Qualifying' && (
            <button type="button" className="button subtle" onClick={() => onStart('Race')}>
              <Flag /> Start race
            </button>
          )}
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
      <button type="button" className="button subtle" onClick={onNew}>
        <Plus /> New plan
      </button>
      <span className="command-spacer" />
      <button type="button" className="button subtle destructive" onClick={onDelete}>
        <Trash2 /> Delete
      </button>
    </>
  )
}

// ── Plan list (the page's landing) ─────────────────────────────────────────

function PlanLists({ plans, onOpen, onDelete }: { plans: readonly SessionPlan[]; onOpen: (planId: string) => void; onDelete: (plan: SessionPlan) => void }) {
  const { open, finished } = groupPlans(plans)

  return (
    <>
      <PlanListCard title="Open plans" plans={open} emptyText="No open plans. Arm a finished plan again, or create a new one." onOpen={onOpen} onDelete={onDelete} />
      {finished.length > 0 && <PlanListCard title="Completed" plans={finished} onOpen={onOpen} onDelete={onDelete} />}
    </>
  )
}

function PlanListCard({
  title,
  plans,
  emptyText,
  onOpen,
  onDelete,
}: {
  title: string
  plans: readonly SessionPlan[]
  emptyText?: string
  onOpen: (planId: string) => void
  onDelete: (plan: SessionPlan) => void
}) {
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
        <span>Laps</span>
        <span />
      </div>
      {plans.length === 0 ? (
        <p className="muted list-card-empty">{emptyText}</p>
      ) : (
        <div className="list-rows">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} onOpen={() => onOpen(plan.id)} onDelete={() => onDelete(plan)} />
          ))}
        </div>
      )}
    </section>
  )
}

function PlanRow({ plan, onOpen, onDelete }: { plan: SessionPlan; onOpen: () => void; onDelete: () => void }) {
  const context = [plan.car, plan.track].filter((value) => value.length > 0).join(' · ')
  const { laps } = planLapStats(plan)

  // The whole row opens the plan; the name is its keyboard target (Enter/Space click it, and
  // the click bubbles here). The delete button stops its own click from opening the plan.
  return (
    <div className="list-row planner-plan-columns planner-row" onClick={onOpen}>
      <span className="planner-row-plan">
        <button type="button" className="planner-row-name" title={plan.name}>
          {plan.name}
        </button>
        {plan.mode === 'Quick' && <span className="chip chip-muted">Quick</span>}
      </span>
      <span className="planner-row-context" title={context}>
        {context || 'No car or track'}
      </span>
      <PlanStatusLabel status={plan.status} />
      <span className="planner-row-laps">
        <LapStrip times={recentLapTimes(plan)} />
        <span className="muted tabular">{laps}</span>
      </span>
      <button
        type="button"
        className="icon-button planner-row-delete"
        aria-label={`Delete ${plan.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

const STRIP_BAR = 3
const STRIP_GAP = 1
const STRIP_HEIGHT = 16

/**
 * A plan's recent lap times as a bar strip (oldest → newest, slower = taller, one blue series).
 * A plan with no laps shows the route glyph — an empty plot would read as "all laps were zero".
 */
function LapStrip({ times }: { times: readonly number[] }) {
  if (times.length === 0) return <Route size={14} className="planner-strip-empty" aria-label="No laps recorded" />

  const min = Math.min(...times)
  const span = Math.max(...times) - min
  const width = times.length * (STRIP_BAR + STRIP_GAP) - STRIP_GAP
  return (
    <svg className="planner-strip" width={width} height={STRIP_HEIGHT} viewBox={`0 0 ${width} ${STRIP_HEIGHT}`} role="img" aria-label={`${times.length} recent laps`}>
      {times.map((time, index) => {
        const height = span > 0 ? 4 + ((time - min) / span) * (STRIP_HEIGHT - 4) : STRIP_HEIGHT / 2
        return <rect key={index} x={index * (STRIP_BAR + STRIP_GAP)} y={STRIP_HEIGHT - height} width={STRIP_BAR} height={height} />
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

function PlanDetail({ plan, blockedBy, onBack }: { plan: SessionPlan; blockedBy: SessionPlan | null; onBack: () => void }) {
  const context = [plan.game, plan.car, plan.track].filter((value) => value.length > 0).join(' · ')
  const tracking = openSegment(plan)
  const warning = plan.warnings.length > 0 ? plan.warnings[plan.warnings.length - 1] : null
  const canArm = plan.status !== 'Armed' && plan.status !== 'Tracking'
  const { laps, bestLapSeconds } = planLapStats(plan)

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

      {tracking && (
        <div className="infobar success" role="status">
          <span className="infobar-icon">
            <Check />
          </span>
          <strong className="infobar-title">Tracking {tracking.kind.toLowerCase()}</strong>
          <span className="infobar-message">{segmentSummary(tracking)}</span>
        </div>
      )}

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

      <div className="planner-kpis">
        <div className="kpi">
          <span className="kpi-label">Race length</span>
          <span className="kpi-value">{raceLengthLabel(plan)}</span>
          <span className="kpi-delta">{plan.qualifyingIncluded ? 'Qualifying included' : 'No qualifying'}</span>
        </div>
        <TargetKpi plan={plan} kind="Qualifying" />
        <TargetKpi plan={plan} kind="Race" />
        <div className="kpi">
          <span className="kpi-label">Laps recorded</span>
          <span className="kpi-value">{laps}</span>
          <span className="kpi-delta">{bestLapSeconds !== null ? `Best ${formatLapTime(bestLapSeconds)}` : 'Nothing recorded yet'}</span>
        </div>
      </div>

      <div className="planner-detail-grid">
        <section className="card list-card" aria-label="Segments">
          <div className="card-header">
            <h2 className="card-title">Segments</h2>
          </div>
          <div className="list-header planner-segment-columns">
            <span>Session</span>
            <span>Started</span>
            <span>Ended</span>
            <span className="planner-num">Laps</span>
            <span className="planner-num">Best</span>
          </div>
          {plan.segments.length === 0 ? (
            <p className="muted list-card-empty">No segments tracked yet. Starting a segment records its laps here.</p>
          ) : (
            <div className="list-rows">
              {plan.segments.map((segment) => (
                <SegmentRow key={segment.id} segment={segment} />
              ))}
            </div>
          )}
        </section>

        <section className="card planner-facts" aria-label="Plan">
          <h2 className="card-title">Plan</h2>
          <dl>
            <Fact label="Qualifying">{plan.qualifyingIncluded ? 'Included' : 'Skipped'}</Fact>
            <Fact label="Race length">{raceLengthLabel(plan)}</Fact>
            <Fact label="Fuel reserve">
              {plan.fuelReserveLaps} {plan.fuelReserveLaps === 1 ? 'lap' : 'laps'}
            </Fact>
            <Fact label="Avg lap time">{plan.avgLapTimeSeconds !== null ? formatLapTime(plan.avgLapTimeSeconds) : 'Not set'}</Fact>
            <Fact label="Fuel per lap">{plan.fuelPerLapLiters !== null ? `${plan.fuelPerLapLiters} L` : 'Not set'}</Fact>
            <Fact label="Created">{formatClock(plan.createdAt || null)}</Fact>
          </dl>
          {plan.notes && <p className="planner-notes">{plan.notes}</p>}
        </section>
      </div>
    </>
  )
}

function TargetKpi({ plan, kind }: { plan: SessionPlan; kind: SegmentKind }) {
  const target = targetsFor(plan, kind)?.lapTime ?? null
  const skipped = kind === 'Qualifying' && !plan.qualifyingIncluded
  const detail = target
    ? `${targetSourceLabel(target)} · ${target.sampleSize} ${target.sampleSize === 1 ? 'lap' : 'laps'} · ${targetTierNote(target)}`
    : skipped
      ? 'Not part of this plan'
      : 'No target set'

  return (
    <div className="kpi">
      <span className="kpi-label">{kind} target</span>
      <span className="kpi-value">{target ? formatLapTime(target.lapTimeSeconds) : '—'}</span>
      <span className="kpi-delta planner-kpi-detail" title={detail}>
        {detail}
      </span>
    </div>
  )
}

function SegmentRow({ segment }: { segment: PlanSegment }) {
  const validTimes = segment.laps.filter((lap) => lap.isValid).map((lap) => lap.lapTimeSeconds)
  const live = segment.actualStart !== null && segment.actualEnd === null

  return (
    <div className="list-row planner-segment-columns">
      <span className="planner-segment-kind">{segment.kind}</span>
      <span className="muted">{formatClock(segment.actualStart)}</span>
      {live ? (
        <Status tone="success">Tracking</Status>
      ) : (
        <span className="muted">{formatClock(segment.actualEnd)}</span>
      )}
      <span className="planner-num tabular">{segment.laps.length}</span>
      <span className="planner-num tabular">{validTimes.length > 0 ? formatLapTime(Math.min(...validTimes)) : '—'}</span>
    </div>
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

const PLAN_MODES: readonly PlanMode[] = ['Planned', 'Quick']

/** Editing locks game/car/track, so it needs nothing recorded to pick from. */
const NO_CHOICES: PlanContextChoices = { prefill: { game: '', car: '', track: '' }, games: [], tracks: [], cars: [], byGame: [] }

/** How long the context may take before the dialog says it is loading, so a fast read never flashes. */
const CONTEXT_LOADING_DELAY_MS = 200

/**
 * New plan: fetches the prefill and the recorded game/car/track choices first (a focused host
 * endpoint — they come from every lap-history file, too much for the polled state), then opens
 * the form on them, so its initial values (and its "unsaved changes" baseline) are the prefill.
 * Suggestions are a convenience: a failed read still opens the form, empty and fully typeable.
 */
function NewPlanDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: CreatePlanInput) => void }) {
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

  if (choices) return <PlanFormDialog choices={choices} onClose={onClose} onSubmit={onSubmit} />
  if (!slow) return null
  return (
    <ContentDialog
      title="New plan"
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
 * Create or edit a plan in a ContentDialog that walks three short steps (docs/internals/session-planner.md): where and what, sessions and length, fuel. Nothing is validated
 * per step, so the step indicator also jumps directly. Closing with changes asks first.
 * Editing locks game/car/track and mode — `plan.update` does not accept them.
 *
 * Game, car and track are suggest boxes over what Sprint has recorded (the deleted Avalonia
 * `SuggestingField`): picking a recorded spelling keys the plan onto the lap-history bucket the
 * corpus already holds, while typing a car or track never driven stays possible. Cars and tracks
 * narrow to the typed game. A new plan starts from `choices.prefill` — the last game/car/track the
 * sim reported, else the most recent plan's.
 */
function PlanFormDialog({
  initial,
  choices,
  onClose,
  onSubmit,
}: {
  initial?: SessionPlan
  choices: PlanContextChoices
  onClose: () => void
  onSubmit: (input: CreatePlanInput) => void
}) {
  const isEdit = initial !== undefined
  const [step, setStep] = useState(0)
  const [discarding, setDiscarding] = useState(false)
  const [name, setName] = useState(initial?.name ?? '')
  const [game, setGame] = useState(initial?.game ?? choices.prefill.game)
  const [car, setCar] = useState(initial?.car ?? choices.prefill.car)
  const [track, setTrack] = useState(initial?.track ?? choices.prefill.track)
  const [mode, setMode] = useState<PlanMode>(initial?.mode ?? 'Planned')
  const [qualifyingIncluded, setQualifyingIncluded] = useState(initial?.qualifyingIncluded ?? true)
  const [raceLengthFormat, setRaceLengthFormat] = useState<RaceLengthFormat>(initial?.raceLengthFormat ?? 'Unknown')
  const [raceLengthValue, setRaceLengthValue] = useState(String(initial?.raceLengthValue ?? ''))
  const [fuelReserveLaps, setFuelReserveLaps] = useState(String(initial?.fuelReserveLaps ?? 1))
  const [avgLapTimeSeconds, setAvgLapTimeSeconds] = useState(initial?.avgLapTimeSeconds != null ? String(initial.avgLapTimeSeconds) : '')
  const [fuelPerLapLiters, setFuelPerLapLiters] = useState(initial?.fuelPerLapLiters != null ? String(initial.fuelPerLapLiters) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const snapshot = JSON.stringify([name, game, car, track, mode, qualifyingIncluded, raceLengthFormat, raceLengthValue, fuelReserveLaps, avgLapTimeSeconds, fuelPerLapLiters, notes])
  const [initialSnapshot] = useState(snapshot)
  const dirty = snapshot !== initialSnapshot

  const requestClose = () => (dirty ? setDiscarding(true) : onClose())

  const title = isEdit ? 'Edit plan' : 'New plan'
  const narrowed = choicesForGame(choices, game)
  const lastStep = step === FORM_STEPS.length - 1

  const submit = () => {
    const parsedRaceLengthValue = Number(raceLengthValue)
    const parsedFuelReserveLaps = Number(fuelReserveLaps)
    const parsedAvgLapTime = avgLapTimeSeconds.trim().length > 0 ? Number(avgLapTimeSeconds) : null
    const parsedFuelPerLap = fuelPerLapLiters.trim().length > 0 ? Number(fuelPerLapLiters) : null

    onSubmit({
      name: name.trim(),
      game: game.trim(),
      car: car.trim(),
      track: track.trim(),
      mode,
      qualifyingIncluded,
      raceLengthFormat,
      raceLengthValue: Number.isFinite(parsedRaceLengthValue) ? parsedRaceLengthValue : 0,
      fuelReserveLaps: Number.isFinite(parsedFuelReserveLaps) ? Math.max(0, parsedFuelReserveLaps) : 1,
      avgLapTimeSeconds: parsedAvgLapTime !== null && Number.isFinite(parsedAvgLapTime) ? parsedAvgLapTime : null,
      fuelPerLapLiters: parsedFuelPerLap !== null && Number.isFinite(parsedFuelPerLap) ? parsedFuelPerLap : null,
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
          <button type="submit" className="button primary">
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
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New Session Plan" autoFocus={isEdit} />
          </label>
          {!isEdit && (
            <div className="field planner-form-wide">
              <span id="planner-mode-label">Mode</span>
              <div className="segmented" role="radiogroup" aria-labelledby="planner-mode-label">
                {PLAN_MODES.map((option) => (
                  <button key={option} type="button" role="radio" aria-checked={mode === option} className="segmented-item" onClick={() => setMode(option)}>
                    {option}
                  </button>
                ))}
              </div>
              <span className="field-hint">Quick plans are for a session you are about to join; their estimates carry less confidence.</span>
            </div>
          )}
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
            <input type="number" min={0} value={fuelReserveLaps} onChange={(event) => setFuelReserveLaps(event.target.value)} autoFocus />
          </label>
          <span />
          <label className="field">
            <span>Avg lap time (s)</span>
            <input type="number" min={0} step={0.1} value={avgLapTimeSeconds} onChange={(event) => setAvgLapTimeSeconds(event.target.value)} placeholder="Optional" />
          </label>
          <label className="field">
            <span>Fuel per lap (L)</span>
            <input type="number" min={0} step={0.1} value={fuelPerLapLiters} onChange={(event) => setFuelPerLapLiters(event.target.value)} placeholder="Optional" />
          </label>
          <label className="field planner-form-wide">
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Optional" />
          </label>
        </div>
      )}
    </ContentDialog>
  )
}
