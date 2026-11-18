import { useEffect, useId, useLayoutEffect, useState } from 'react'
import { ChevronLeft, Play, X } from 'lucide-react'
import { dashAlertDefaults, dashAlertFromSettings, previewAlertBanner, previewFrame, resolveDashPalette } from '@sprint/dashboard'
import type { DashAlertSettings, DashAlertType, DashLayout } from '@sprint/dashboard'
import type { ButtonState, SprintCommand } from '../bridge'
import { NumberBox } from '../designer/controls'
import { PageHeader } from '../shell/PageHeader'
import { Slider } from '../shell/Slider'
import { Status } from '../shell/Status'
import { Switch } from '../shell/Switch'
import {
  ACK_FUNCTION,
  ALERT_COPY,
  ALERT_GROUPS,
  UNTIL_ACK_PREVIEW_SECONDS,
  ackRows,
  alertSummary,
  buildAlertUpdate,
  durationAtStep,
  durationRange,
  durationStep,
  durationStepText,
  hasLook,
  lapsLeftText,
  previewDash,
  previewSeconds,
  stampDashAlerts,
  stepLapsLeft,
  type AckRow,
  type AlertChange,
} from './DashSettingsDomain'
import { buttonName } from './DeviceControlsDomain'
import type { Device } from './DevicesDomain'
import { ListRow, SettingsList } from './SettingsLayout'
import { ScaledDash } from './ScaledDash'
import './DashSettings.css'

// The dash the preview plays on shows a healthy racing frame, the same every time.
const PREVIEW_FRAME = previewFrame('mid_lap')
const STAGE_MAX_HEIGHT = 300

/** One type's settings; the bridge always delivers every type, the defaults stand in otherwise. */
const alertOf = (alerts: readonly DashAlertSettings[], type: DashAlertType): DashAlertSettings =>
  alerts.find((alert) => alert.type === type) ?? dashAlertDefaults.find((alert) => alert.type === type) ?? dashAlertDefaults[0]

/**
 * Dashes > Settings, a level below the Dashes overview: what every dash shares. Acknowledge (the
 * wheel button that takes an alert down on every dash), then every alert in groups, each with its
 * switch. The picked alert plays on a real dash on the right, with its size, colours and duration
 * below it; it plays again on every change and on Play again.
 */
export function DashSettings({
  layouts,
  devices,
  alerts,
  buttons,
  send,
  onBack,
}: {
  layouts: readonly DashLayout[]
  devices: readonly Device[]
  /** The app-wide alert settings, every type. */
  alerts: readonly DashAlertSettings[]
  buttons: ButtonState
  send: (command: SprintCommand) => Promise<void>
  onBack: () => void
}) {
  const [picked, setPicked] = useState<DashAlertType>('tc_change')
  const [error, setError] = useState<string | null>(null)
  const alert = alertOf(alerts, picked)

  const run = async (command: SprintCommand): Promise<void> => {
    setError(null)
    try {
      await send(command)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The setting could not be saved.')
      throw failure
    }
  }
  const change = (type: DashAlertType, patch: AlertChange): Promise<void> => run(buildAlertUpdate(type, patch))

  return (
    <div className="dash-settings">
      <PageHeader title="Dashes" />
      <button type="button" className="button subtle device-back" onClick={onBack}>
        <ChevronLeft /> All dashes
      </button>
      <header className="dash-settings-head">
        <h2 className="dash-settings-title">Settings for every dash</h2>
        <span className="muted">Alerts, the Ack button and the lap review show the same on every dash you drive with.</span>
      </header>

      {error && (
        <div className="infobar error dash-settings-infobar" role="alert">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <strong className="infobar-title">Not saved</strong>
          <span className="infobar-message">{error}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="dash-settings-split">
        <div className="dash-settings-lists">
          <AckList rows={ackRows(devices, buttons)} send={(command) => void run(command).catch(() => undefined)} />
          {ALERT_GROUPS.map((group) => (
            <AlertList
              key={group.title}
              title={group.title}
              footer={group.footer}
              types={group.types}
              alerts={alerts}
              picked={picked}
              onPick={setPicked}
              onChange={(type, patch) => void change(type, patch).catch(() => undefined)}
            />
          ))}
        </div>

        <div className="dash-settings-side">
          <AlertPreview alert={alert} alerts={alerts} layouts={layouts} devices={devices} />
          <SettingsList>
            {hasLook(alert.type) && (
              <ListRow id="dash-alert-size" label="Size">
                {(labels) => (
                  <select
                    {...labels}
                    value={alert.size}
                    onChange={(event) => void change(alert.type, { size: event.target.value === 'full' ? 'full' : 'strip' }).catch(() => undefined)}
                  >
                    <option value="strip">Strip</option>
                    <option value="full">Full screen</option>
                  </select>
                )}
              </ListRow>
            )}
            {hasLook(alert.type) && (
              <ListRow id="dash-alert-invert" label="Invert colours" detail="Swaps the fill and lettering colours">
                {(labels) => <Switch checked={alert.invertColors} stateText={false} {...labels} onChange={(invertColors) => void change(alert.type, { invertColors }).catch(() => undefined)} />}
              </ListRow>
            )}
            <ListRow id="dash-alert-duration" label="Duration">
              {(labels) => <DurationSlider key={alert.type} alert={alert} labels={labels} onChange={(step) => change(alert.type, durationAtStep(alert.type, step))} />}
            </ListRow>
          </SettingsList>
        </div>
      </div>
    </div>
  )
}

/**
 * Acknowledge: one row per device whose buttons can run Ack, with its button. Assign asks the host
 * to take the next press; Escape or Cancel stops waiting (the host gives up by itself after ten seconds).
 */
function AckList({ rows, send }: { rows: readonly AckRow[]; send: (command: SprintCommand) => void }) {
  const waiting = rows.some((row) => row.waiting)

  useEffect(() => {
    if (!waiting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') send({ type: 'devices.buttonCancel' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [waiting, send])

  return (
    <SettingsList title="Acknowledge" footer="Pressing Ack hides the alert on every dash, and the engineer's message. Alerts set to Until Ack stay up until you press it.">
      {rows.length === 0 ? (
        <p className="settings-list-row muted dash-settings-none">Add a wheel or a button box on the Devices page to give Ack a button.</p>
      ) : (
        rows.map((row) => (
          <ListRow key={row.deviceId} id={`ack-${row.deviceId}`} label={row.name} detail="Ack button">
            {(labels) =>
              row.waiting ? (
                <>
                  <Status tone="warning" role="status">
                    Press a button on the wheel…
                  </Status>
                  <button type="button" className="button subtle" onClick={() => send({ type: 'devices.buttonCancel' })}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {row.input ? <span className="chip tabular">{buttonName(row.input)}</span> : <span className="muted">Not assigned</span>}
                  <button
                    type="button"
                    className="button"
                    aria-describedby={labels['aria-labelledby']}
                    onClick={() => send({ type: 'devices.buttonListen', deviceId: row.deviceId, command: ACK_FUNCTION })}
                  >
                    {row.input ? 'Change' : 'Assign'}
                  </button>
                  <span className="dash-settings-clear">
                    {row.input && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Clear the Ack button on ${row.name}`}
                        title="Clear"
                        onClick={() => send({ type: 'devices.buttonClear', deviceId: row.deviceId, command: ACK_FUNCTION })}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </span>
                </>
              )
            }
          </ListRow>
        ))
      )}
    </SettingsList>
  )
}

/** A titled list of alerts: each row picks the alert for the preview, and its switch turns it on or off. */
function AlertList({
  title,
  footer,
  types,
  alerts,
  picked,
  onPick,
  onChange,
}: {
  title: string
  footer?: string
  types: readonly DashAlertType[]
  alerts: readonly DashAlertSettings[]
  picked: DashAlertType
  onPick: (type: DashAlertType) => void
  onChange: (type: DashAlertType, patch: AlertChange) => void
}) {
  const titleId = useId()
  return (
    <section className="settings-list" aria-labelledby={titleId}>
      <h2 id={titleId} className="settings-list-title">
        {title}
      </h2>
      <ul className="card list-card list-rows dash-settings-picks">
        {types.map((type) => {
          const alert = alertOf(alerts, type)
          const { label } = ALERT_COPY[type]
          const selected = picked === type
          return (
            <li key={type} className={selected ? 'list-row selected dash-settings-pick' : 'list-row dash-settings-pick'}>
              <button type="button" className="dash-settings-pick-main" aria-pressed={selected} onClick={() => onPick(type)}>
                <span>{label}</span>
                <span className="settings-list-detail">{alertSummary(alert)}</span>
              </button>
              {alert.type === 'fuel_low' && alert.enabled && (
                <LapsLeftBox laps={alert.lapsLeft} onChange={(lapsLeft) => {
                  onPick(type)
                  onChange(type, { lapsLeft })
                }} />
              )}
              <Switch
                checked={alert.enabled}
                stateText={false}
                aria-label={`Show ${label}`}
                onChange={(enabled) => {
                  onPick(type)
                  onChange(type, { enabled })
                }}
              />
            </li>
          )
        })}
      </ul>
      {footer && <p className="settings-list-footer">{footer}</p>}
    </section>
  )
}

/** The fuel warning's mark: how many laps of fuel are left when it shows. */
function LapsLeftBox({ laps, onChange }: { laps: number; onChange: (laps: number) => void }) {
  const down = stepLapsLeft(laps, -1)
  const up = stepLapsLeft(laps, 1)
  return (
    <NumberBox
      label="Laps left"
      display={lapsLeftText(laps)}
      canDecrease={down !== null}
      canIncrease={up !== null}
      onDecrease={() => down !== null && onChange(down)}
      onIncrease={() => up !== null && onChange(up)}
    />
  )
}

/**
 * The duration, 1 s up to the type's longest, then Until Ack. It follows the thumb at once, sends
 * the step it was let go at, and lets go of its own value once the host's matches it (or the change fails).
 */
function DurationSlider({ alert, labels, onChange }: { alert: DashAlertSettings; labels: { 'aria-labelledby': string; 'aria-describedby'?: string }; onChange: (step: number) => Promise<void> }) {
  const saved = durationStep(alert)
  const [draft, setDraft] = useState<number | null>(null)
  const { min, max } = durationRange(alert.type)

  useEffect(() => {
    if (draft === saved) setDraft(null)
  }, [draft, saved])

  return (
    <Slider
      {...labels}
      value={draft ?? saved}
      min={min}
      max={max}
      valueText={(step) => durationStepText(alert.type, step)}
      onChange={setDraft}
      onCommit={(step) => {
        if (step === saved) setDraft(null)
        else onChange(step).catch(() => setDraft(null))
      }}
    />
  )
}

/**
 * The picked alert on a real dash: the first dash device's dash, or the first dash. It plays on
 * picking, on every change and on Play again, for the alert's duration (a few seconds for one held
 * until Ack), then the dash shows its page again.
 */
function AlertPreview({ alert, alerts, layouts, devices }: { alert: DashAlertSettings; alerts: readonly DashAlertSettings[]; layouts: readonly DashLayout[]; devices: readonly Device[] }) {
  const [replays, setReplays] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const stageWidth = useContentWidth(stage)
  const dash = previewDash(devices, layouts)
  const copy = ALERT_COPY[alert.type]

  // The key stands for the alert and the dash by content, so a fresh but equal state poll does not replay it.
  const playKey = `${replays}|${dash?.layout.id ?? ''}|${JSON.stringify(alert)}`
  const enabled = alert.enabled
  const seconds = previewSeconds(alert)
  useEffect(() => {
    if (!enabled) {
      setPlaying(false)
      return
    }
    setPlaying(true)
    const timeout = window.setTimeout(() => setPlaying(false), seconds * 1000)
    return () => window.clearTimeout(timeout)
  }, [playKey, enabled, seconds])

  const stamped = dash ? stampDashAlerts(dash.layout, alerts) : null
  const banner =
    stamped && playing && alert.enabled ? previewAlertBanner(stamped, dashAlertFromSettings(alert), resolveDashPalette(stamped.theme, stamped.colorSystem)) : null

  return (
    <section className="card dash-settings-preview" aria-label="Preview">
      <div ref={setStage} className="dash-settings-stage">
        {stamped && dash ? (
          stageWidth > 0 && (
            <ScaledDash layout={stamped} size={dash.size} maxWidth={stageWidth} maxHeight={STAGE_MAX_HEIGHT} frame={PREVIEW_FRAME} pageId={stamped.pages[0]?.id} banner={banner} />
          )
        ) : (
          <p className="muted dash-settings-stage-empty">No dashes yet. Create one to see the alerts on it.</p>
        )}
      </div>
      <div className="dash-settings-preview-foot">
        <div className="dash-settings-preview-text">
          <h3 className="card-title">{copy.label}</h3>
          <span className="muted">{copy.when}</span>
          {!alert.enabled ? (
            <span className="muted">Off. Turn it on to see it here.</span>
          ) : alert.untilAck ? (
            <span className="muted">{`Stays up until you press Ack; shown here for ${UNTIL_ACK_PREVIEW_SECONDS} s.`}</span>
          ) : null}
          {dash && <span className="muted">{dash.deviceName ? `On ${dash.layout.name}, the dash on ${dash.deviceName}` : `On ${dash.layout.name}`}</span>}
        </div>
        <button type="button" className="button subtle" disabled={!alert.enabled || !dash} onClick={() => setReplays((count) => count + 1)}>
          <Play /> Play again
        </button>
      </div>
    </section>
  )
}

/** An element's content width, followed as it resizes; 0 until it is laid out. */
function useContentWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!element) return
    const measure = () => {
      const style = window.getComputedStyle(element)
      setWidth(Math.floor(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return width
}
