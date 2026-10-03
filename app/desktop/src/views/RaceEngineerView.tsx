import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, RotateCcw, Send, X } from 'lucide-react'
import type { SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { ConfirmDialog } from '../shell/ContentDialog'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { Status } from '../shell/Status'
import type { StatusTone } from '../shell/Status'
import { describeTelemetry, type TelemetryTone } from '../shell/telemetry'
import './RaceEngineerView.css'

// ── Wire shapes, narrowed once at the edge ──────────────────────────────────
// `engineerControls` and `radioLog` are still untyped Record arrays on
// SprintState (the host has not published a strict shape for them), so every
// field is read defensively with a fallback rather than trusted as-is.

type EngineerControlRow = {
  key: string
  label: string
  min: number
  max: number
  step: number
  unit: string
  carValue: number
  stagedValue: number
}

type RadioLogRow = { message: string; detail: string; lap: number; status: string }

type PushState = 'idle' | 'pending' | 'confirmed' | 'failed'

const numberField = (row: Record<string, unknown>, key: string, fallback = 0): number => {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const stringField = (row: Record<string, unknown>, key: string, fallback = ''): string => {
  const value = row[key]
  return typeof value === 'string' ? value : fallback
}

const parseControl = (row: Record<string, unknown>): EngineerControlRow | null => {
  const key = stringField(row, 'key')
  if (!key) return null
  return {
    key,
    label: stringField(row, 'label', key),
    min: numberField(row, 'min', 0),
    max: numberField(row, 'max', 100),
    step: numberField(row, 'step', 1),
    unit: stringField(row, 'unit'),
    carValue: numberField(row, 'carValue'),
    stagedValue: numberField(row, 'stagedValue'),
  }
}

const parseRadioEntry = (row: Record<string, unknown>): RadioLogRow => ({
  message: stringField(row, 'message'),
  detail: stringField(row, 'detail'),
  lap: numberField(row, 'lap'),
  status: stringField(row, 'status', 'SENT'),
})

// The host has no JsonStringEnumConverter for ExternalOperationState (see
// Sprint.Desktop.Features.Engineer.ExternalOperationState), so this crosses
// the wire as its numeric ordinal today: Idle=0, Pending=1, Confirmed=2,
// Failed=3. A matching string is accepted too in case that changes upstream.
const PUSH_STATES: readonly PushState[] = ['idle', 'pending', 'confirmed', 'failed']
const parsePushState = (value: unknown): PushState => {
  if (typeof value === 'number' && value >= 0 && value < PUSH_STATES.length) return PUSH_STATES[value]
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    const match = PUSH_STATES.find((state) => state === lower)
    if (match) return match
  }
  return 'idle'
}

const formatValue = (control: EngineerControlRow, value: number): string => {
  const decimals = control.step < 1 ? 1 : 0
  const formatted = value.toFixed(decimals)
  return control.unit ? `${formatted}${control.unit}` : formatted
}

// The fixed set of canned radio messages offered as one-tap buttons.
const QUICK_MESSAGES = ['BOX THIS LAP', 'PUSH NOW', 'FUEL SAVE', 'YELLOW S2', 'GAP -1.2', 'RADIO CHECK']

const describeFailure = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback)

// Radio log statuses are free-text words from the host (DesktopRuntime.PrependRadioLog and
// the engineer message path). Known ones get a readable word and a tone; anything else is
// shown as it came.
const RADIO_STATUSES: Record<string, { label: string; tone: StatusTone }> = {
  ACK: { label: 'Acknowledged', tone: 'success' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  PENDING: { label: 'Pending', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
  DASH: { label: 'On dash', tone: 'neutral' },
  SENT: { label: 'Sent', tone: 'neutral' },
}

const describeRadioStatus = (status: string): { label: string; tone: StatusTone } =>
  RADIO_STATUSES[status.toUpperCase()] ?? { label: status || 'Sent', tone: 'neutral' }

// The telemetry link shows as an InfoBar while it is not live: idle is informational,
// a link that is connecting or stale needs attention, a broken source is an error.
const TELEMETRY_INFOBAR: Record<TelemetryTone, 'info' | 'warning' | 'error' | null> = {
  live: null,
  idle: 'info',
  attention: 'warning',
  fault: 'error',
}

export function RaceEngineerView({
  runtime,
  send,
}: {
  runtime: RuntimeState
  send: (command: SprintCommand) => Promise<void>
}) {
  // Optimistic staged-value overrides so a stepper click reflects instantly
  // instead of waiting on the next 250ms state poll; cleared per-key once the
  // host's own stagedValue catches up.
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [confirmingRevert, setConfirmingRevert] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const controls = useMemo(
    (): EngineerControlRow[] =>
      runtime.kind === 'ready'
        ? runtime.sprint.engineerControls.map(parseControl).filter((row): row is EngineerControlRow => row !== null)
        : [],
    [runtime],
  )
  const radioLog = useMemo(
    (): RadioLogRow[] => (runtime.kind === 'ready' ? runtime.sprint.radioLog.map(parseRadioEntry) : []),
    [runtime],
  )
  const pushState = runtime.kind === 'ready' ? parsePushState(runtime.sprint.engineerPushState) : 'idle'
  const isPushPending = pushState === 'pending'
  const dirty = controls.filter((control) => Math.abs(control.stagedValue - control.carValue) > 1e-6)

  useEffect(() => {
    setOverrides((previous) => {
      if (Object.keys(previous).length === 0) return previous
      let changed = false
      const next = { ...previous }
      for (const control of controls) {
        const override = next[control.key]
        if (override !== undefined && Math.abs(override - control.stagedValue) < 1e-9) {
          delete next[control.key]
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [controls])

  const stage = async (control: EngineerControlRow, nextValue: number) => {
    const clamped = Math.min(control.max, Math.max(control.min, nextValue))
    setOverrides((previous) => ({ ...previous, [control.key]: clamped }))
    try {
      await send({ type: 'engineer.stage', key: control.key, value: clamped })
    } catch (err) {
      setError(describeFailure(err, `Failed to stage ${control.label}.`))
    }
  }

  const push = async () => {
    setError(null)
    try {
      await send({ type: 'engineer.push' })
    } catch (err) {
      setError(describeFailure(err, 'Failed to push staged changes.'))
    }
  }

  const revert = async () => {
    setConfirmingRevert(false)
    setError(null)
    try {
      await send({ type: 'engineer.revert' })
      setOverrides({})
    } catch (err) {
      setError(describeFailure(err, 'Failed to revert staged changes.'))
    }
  }

  const sendMessage = async (message: string) => {
    setError(null)
    try {
      await send({ type: 'engineer.message', message })
    } catch (err) {
      setError(describeFailure(err, 'Failed to send the message.'))
    }
  }

  const telemetry = runtime.kind === 'ready' ? describeTelemetry(runtime.sprint.telemetry) : null
  const telemetryBar = telemetry ? TELEMETRY_INFOBAR[telemetry.tone] : null

  const commands = (
    <>
      <button
        type="button"
        className="button primary"
        onClick={push}
        disabled={dirty.length === 0 || isPushPending}
        title={isPushPending ? 'Waiting for car acknowledgement.' : dirty.length === 0 ? 'Stage a change before pushing.' : undefined}
      >
        <Send /> Push staged changes
      </button>
      <CommandDivider />
      <button
        type="button"
        className="button subtle"
        onClick={() => setConfirmingRevert(true)}
        disabled={dirty.length === 0 || isPushPending}
        title={isPushPending ? 'Waiting for car acknowledgement.' : dirty.length === 0 ? 'No staged changes to revert.' : undefined}
      >
        <RotateCcw /> Revert
      </button>
    </>
  )

  if (runtime.kind === 'loading') {
    return (
      <div className="engineer">
        <PageHeader title="Race engineer">{commands}</PageHeader>
        <div className="engineer-grid">
          <div className="card skeleton engineer-skeleton-tall" />
          <div className="engineer-side">
            <div className="card skeleton engineer-skeleton" />
            <div className="card skeleton engineer-skeleton" />
          </div>
        </div>
      </div>
    )
  }

  const pushStatus = ((): { label: string; tone: StatusTone } => {
    if (pushState === 'pending') return { label: 'Pending acknowledgement', tone: 'warning' }
    if (pushState === 'confirmed') return { label: 'Confirmed', tone: 'success' }
    if (pushState === 'failed') return { label: 'Push failed', tone: 'danger' }
    return dirty.length === 0 ? { label: 'In sync', tone: 'success' } : { label: `${dirty.length} staged`, tone: 'warning' }
  })()

  return (
    <div className="engineer">
      <PageHeader title="Race engineer">
        {commands}
        <span className="command-spacer" />
        <Status tone={pushStatus.tone}>{pushStatus.label}</Status>
      </PageHeader>

      <div className="engineer-body">
        {telemetry && telemetryBar && (
          <div className={`infobar ${telemetryBar}`} role={telemetryBar === 'info' ? 'status' : 'alert'}>
            <span className="infobar-icon" aria-hidden="true">
              {telemetryBar === 'info' ? 'i' : '!'}
            </span>
            <strong className="infobar-title">{telemetry.label}</strong>
            <span className="infobar-message">{telemetry.detail ?? 'Car values update once telemetry is live.'}</span>
          </div>
        )}
        {pushState === 'failed' && (
          <div className="infobar error" role="alert">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <strong className="infobar-title">Push failed</strong>
            <span className="infobar-message">The target rejected or did not acknowledge the changes. They are still staged — push again to retry.</span>
          </div>
        )}
        {error && (
          <div className="infobar error" role="alert">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <span className="infobar-message">{error}</span>
            <button type="button" className="icon-button" aria-label="Dismiss" title="Dismiss" onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="engineer-grid">
          <section className="card list-card" aria-label="Car controls">
            <div className="card-header">
              <h2 className="card-title">Car controls</h2>
            </div>
            {controls.length === 0 ? (
              <p className="muted list-card-empty">No engineer controls are available from the current telemetry source.</p>
            ) : (
              <>
                <div className="list-header engineer-control-columns" aria-hidden="true">
                  <span>Control</span>
                  <span className="engineer-numeric">Car</span>
                  <span className="engineer-staged-head">Staged</span>
                </div>
                <ul className="list-rows">
                  {controls.map((control) => {
                    const displayed = overrides[control.key] ?? control.stagedValue
                    const isDirty = Math.abs(displayed - control.carValue) > 1e-6
                    return (
                      <li key={control.key} className="list-row static engineer-control-columns">
                        <span className="engineer-control-label">{control.label}</span>
                        <span className="engineer-numeric engineer-secondary tabular">{formatValue(control, control.carValue)}</span>
                        <span className="engineer-stepper">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Decrease ${control.label}`}
                            title={`Decrease ${control.label}`}
                            onClick={() => stage(control, displayed - control.step)}
                            disabled={displayed <= control.min}
                          >
                            <Minus size={14} />
                          </button>
                          <span className={isDirty ? 'engineer-control-value staged tabular' : 'engineer-control-value tabular'}>
                            {formatValue(control, displayed)}
                          </span>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Increase ${control.label}`}
                            title={`Increase ${control.label}`}
                            onClick={() => stage(control, displayed + control.step)}
                            disabled={displayed >= control.max}
                          >
                            <Plus size={14} />
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          <div className="engineer-side">
            <section className="card engineer-card">
              <h2 className="card-title">Staged changes</h2>
              {dirty.length === 0 ? (
                <Status tone="success">In sync with the car</Status>
              ) : (
                <ul className="engineer-diff-list">
                  {dirty.map((control) => (
                    <li key={control.key}>
                      <span>{control.label}</span>
                      <span className="tabular">
                        <span className="engineer-secondary">{formatValue(control, control.carValue)}</span> → {formatValue(control, control.stagedValue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card engineer-card">
              <h2 className="card-title">Quick message</h2>
              <div className="engineer-quick-grid">
                {QUICK_MESSAGES.map((message) => (
                  <button key={message} type="button" className="button" onClick={() => sendMessage(message)}>
                    {message}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="card list-card" aria-label="Radio log">
          <div className="card-header">
            <h2 className="card-title">Radio log</h2>
            <span className="muted tabular">{radioLog.length}</span>
          </div>
          {radioLog.length === 0 ? (
            <p className="muted list-card-empty">No radio activity yet.</p>
          ) : (
            <>
              <div className="list-header engineer-radio-columns" aria-hidden="true">
                <span>Lap</span>
                <span>Message</span>
                <span>Detail</span>
                <span>Status</span>
              </div>
              <ul className="list-rows">
                {radioLog.map((entry, index) => {
                  const status = describeRadioStatus(entry.status)
                  return (
                    <li key={index} className="list-row static engineer-radio-columns">
                      <span className="engineer-secondary tabular">L{entry.lap}</span>
                      <span className="engineer-radio-message">{entry.message}</span>
                      <span className="engineer-radio-detail" title={entry.detail}>
                        {entry.detail}
                      </span>
                      <Status tone={status.tone}>{status.label}</Status>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {confirmingRevert && (
        <ConfirmDialog
          title="Revert staged changes?"
          message={
            <>
              {dirty.length} staged control{dirty.length === 1 ? '' : 's'} will return to the car&apos;s current value
              {dirty.length === 1 ? '' : 's'}. This cannot be undone.
            </>
          }
          confirmLabel="Revert changes"
          destructive
          onConfirm={() => void revert()}
          onCancel={() => setConfirmingRevert(false)}
        />
      )}
    </div>
  )
}
