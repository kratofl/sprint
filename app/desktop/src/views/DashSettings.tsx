import { useContext, useEffect, useId, useLayoutEffect, useState } from 'react'
import { ChevronLeft, Play, X } from 'lucide-react'
import { DashUnitsContext, dashAlertDefaults, dashAlertFromSettings, previewAlertBanner, previewFrame, resolveDashPalette } from '@sprint/dashboard'
import type { DashAlertSettings, DashAlertType, DashLaunchWindow, DashLayout } from '@sprint/dashboard'
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
  engineLimitText,
  hasLook,
  isLive,
  isTimed,
  lapsLeftText,
  launchSpeedText,
  percentText,
  previewDash,
  previewSeconds,
  rpmText,
  stampDashAlerts,
  stepEngineLimit,
  stepLapsLeft,
  stepLaunch,
  stepLaunchSpeed,
  stepLiftPoint,
  type AckRow,
  type AlertChange,
} from './DashSettingsDomain'
import { buttonName } from './DeviceControlsDomain'
import type { Device } from './DevicesDomain'
import { ListRow, SettingsList } from './SettingsLayout'
import { ScaledDash } from './ScaledDash'
import './DashSettings.css'

// The dash the preview plays on shows a healthy racing frame, the same every time; the pit
// limiter shows on the pit lane, its limiter on, and flags under a yellow, so its bar shows once
// the popup has gone.
const PREVIEW_FRAME = previewFrame('mid_lap')
const PIT_FRAME = previewFrame('pit')
const FLAG_FRAME = previewFrame('yellow_flag')
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
          {(hasLook(alert.type) || isTimed(alert.type)) && (
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
              {isTimed(alert.type) && (
                <ListRow id="dash-alert-duration" label="Duration">
                  {(labels) => <DurationSlider key={alert.type} alert={alert} labels={labels} onChange={(step) => change(alert.type, durationAtStep(alert.type, step))} />}
                </ListRow>
              )}
            </SettingsList>
          )}
          {alert.type === 'fuel_low' && (
            <SettingsList title="Fuel warning" footer="Also on every dash: the fuel widgets turn amber at the first level and red at LOW FUEL.">
              <ListRow id="dash-fuel-warning" label="First level" detail="Fuel widgets turn amber">
                {() => (
                  <StepBox
                    label="Laps left at the first level"
                    display={lapsLeftText(alert.warningLapsLeft)}
                    step={(step) => stepLapsLeft(alert.warningLapsLeft, step, alert.lapsLeft)}
                    onChange={(warningLapsLeft) => void change(alert.type, { warningLapsLeft }).catch(() => undefined)}
                  />
                )}
              </ListRow>
              <ListRow id="dash-fuel-low" label="LOW FUEL" detail="The alert shows; fuel widgets turn red">
                {() => (
                  <StepBox
                    label="Laps left at LOW FUEL"
                    display={lapsLeftText(alert.lapsLeft)}
                    step={(step) => stepLapsLeft(alert.lapsLeft, step, undefined, alert.warningLapsLeft)}
                    onChange={(lapsLeft) => void change(alert.type, { lapsLeft }).catch(() => undefined)}
                  />
                )}
              </ListRow>
            </SettingsList>
          )}
          {alert.type === 'launch' && <LaunchList alert={alert} onChange={(patch) => void change(alert.type, patch).catch(() => undefined)} />}
          {alert.type === 'lift_now' && (
            <SettingsList title="Lift point" footer="The game's lift-and-coast cue runs from 0 to 255. Also on every dash: the Lift & coast widget fills up to this point.">
              <ListRow id="dash-lift-point" label="Lift past">
                {() => (
                  <StepBox
                    label="Lift point"
                    display={String(alert.liftPoint)}
                    step={(step) => stepLiftPoint(alert.liftPoint, step)}
                    onChange={(liftPoint) => void change(alert.type, { liftPoint }).catch(() => undefined)}
                  />
                )}
              </ListRow>
            </SettingsList>
          )}
          {alert.type === 'engine_warning' && <EngineLimits alert={alert} onChange={(patch) => void change(alert.type, patch).catch(() => undefined)} />}
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

/** A whole-number setting with minus and plus: `step` gives the value one step down or up, null where it stops. */
function StepBox({ label, display, step, onChange }: { label: string; display: string; step: (step: -1 | 1) => number | null; onChange: (value: number) => void }) {
  const down = step(-1)
  const up = step(1)
  return (
    <NumberBox
      label={label}
      display={display}
      canDecrease={down !== null}
      canIncrease={up !== null}
      onDecrease={() => down !== null && onChange(down)}
      onIncrease={() => up !== null && onChange(up)}
    />
  )
}

/** The engine warning's water and oil limits, five degrees a step, in the driver's units. */
function EngineLimits({ alert, onChange }: { alert: Extract<DashAlertSettings, { type: 'engine_warning' }>; onChange: (patch: AlertChange) => void }) {
  const units = useContext(DashUnitsContext)
  return (
    <SettingsList title="Engine limits" footer="Also on every dash: the Water and Oil widgets turn amber 10° below a limit and red at it, or when the game reports the engine overheating.">
      <ListRow id="dash-engine-water" label="Water">
        {() => (
          <StepBox
            label="Water limit"
            display={engineLimitText(alert.waterLimitCelsius, units)}
            step={(step) => stepEngineLimit(alert.waterLimitCelsius, step)}
            onChange={(waterLimitCelsius) => onChange({ waterLimitCelsius })}
          />
        )}
      </ListRow>
      <ListRow id="dash-engine-oil" label="Oil">
        {() => (
          <StepBox
            label="Oil limit"
            display={engineLimitText(alert.oilLimitCelsius, units)}
            step={(step) => stepEngineLimit(alert.oilLimitCelsius, step)}
            onChange={(oilLimitCelsius) => onChange({ oilLimitCelsius })}
          />
        )}
      </ListRow>
    </SettingsList>
  )
}

const LAUNCH_ROWS: ReadonlyArray<{ key: Exclude<keyof DashLaunchWindow, 'speedKmh'>; label: string; text: (value: number) => string }> = [
  { key: 'rpmFrom', label: 'Revs from', text: rpmText },
  { key: 'rpmTo', label: 'Revs to', text: rpmText },
  { key: 'throttleFrom', label: 'Throttle from', text: percentText },
  { key: 'throttleTo', label: 'Throttle to', text: percentText },
]

/** When the launch alert shows (clutch in, nearly standing) and the window it turns green in. */
function LaunchList({ alert, onChange }: { alert: Extract<DashAlertSettings, { type: 'launch' }>; onChange: (patch: AlertChange) => void }) {
  const units = useContext(DashUnitsContext)
  return (
    <SettingsList title="Launch" footer="LAUNCH and the revs show while the clutch is in and the car is nearly standing. They turn green while the revs and the throttle are both inside the window.">
      <ListRow id="dash-launch-clutch" label="Clutch in past">
        {() => (
          <StepBox
            label="Clutch in past"
            display={percentText(alert.clutchPercent)}
            step={(step) => stepLaunch(alert, 'clutchPercent', step)}
            onChange={(clutchPercent) => onChange({ clutchPercent })}
          />
        )}
      </ListRow>
      <ListRow id="dash-launch-speed" label="Slower than">
        {() => (
          <StepBox
            label="Slower than"
            display={launchSpeedText(alert.speedKmh, units)}
            step={(step) => stepLaunchSpeed(alert.speedKmh, step, units)}
            onChange={(speedKmh) => onChange({ speedKmh })}
          />
        )}
      </ListRow>
      {LAUNCH_ROWS.map((row) => (
        <ListRow key={row.key} id={`dash-launch-${row.key}`} label={row.label}>
          {() => (
            <StepBox
              label={row.label}
              display={row.text(alert[row.key])}
              step={(step) => stepLaunch(alert, row.key, step)}
              onChange={(value) => onChange({ [row.key]: value })}
            />
          )}
        </ListRow>
      ))}
    </SettingsList>
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
 * until Ack), then the dash shows its page again. The pit limiter is no popup: while it is on, the
 * dash shows on the pit lane with the limiter on, its overlay up for as long as it is picked.
 */
function AlertPreview({ alert, alerts, layouts, devices }: { alert: DashAlertSettings; alerts: readonly DashAlertSettings[]; layouts: readonly DashLayout[]; devices: readonly Device[] }) {
  const [replays, setReplays] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const stageWidth = useContentWidth(stage)
  const dash = previewDash(devices, layouts)
  const copy = ALERT_COPY[alert.type]
  const units = useContext(DashUnitsContext)

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
    stamped && playing && alert.enabled ? previewAlertBanner(stamped, dashAlertFromSettings(alert), resolveDashPalette(stamped.theme, stamped.colorSystem), units) : null
  const overlay = !isTimed(alert.type)
  const frame = !alert.enabled ? PREVIEW_FRAME : overlay ? PIT_FRAME : alert.type === 'flag' ? FLAG_FRAME : PREVIEW_FRAME

  return (
    <section className="card dash-settings-preview" aria-label="Preview">
      <div ref={setStage} className="dash-settings-stage">
        {stamped && dash ? (
          stageWidth > 0 && (
            <ScaledDash layout={stamped} size={dash.size} maxWidth={stageWidth} maxHeight={STAGE_MAX_HEIGHT} frame={frame} pageId={stamped.pages[0]?.id} banner={banner} />
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
          ) : alert.untilAck && isLive(alert.type) ? (
            <span className="muted">{`Stays up while it holds, until you press Ack; shown here for ${UNTIL_ACK_PREVIEW_SECONDS} s.`}</span>
          ) : alert.untilAck && !overlay ? (
            <span className="muted">{`Stays up until you press Ack; shown here for ${UNTIL_ACK_PREVIEW_SECONDS} s.`}</span>
          ) : null}
          {dash && <span className="muted">{dash.deviceName ? `On ${dash.layout.name}, the dash on ${dash.deviceName}` : `On ${dash.layout.name}`}</span>}
        </div>
        {!overlay && (
          <button type="button" className="button subtle" disabled={!alert.enabled || !dash} onClick={() => setReplays((count) => count + 1)}>
            <Play /> Play again
          </button>
        )}
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
