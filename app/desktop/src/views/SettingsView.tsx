import { useState } from 'react'
import { Check, CloudDownload, CloudUpload, Download, Pencil } from 'lucide-react'
import { bridge } from '../bridge'
import type { Account, CloudState, CloudStorageMode, LiveUplink, LiveUplinkStatus, SprintCommand, SyncDirection, SyncReport } from '../bridge'
import { syncReportText } from '../onboarding/summary'
import { accountName, accountWhere, initialsFor } from '../shell/account'
import { ConfirmDialog } from '../shell/ContentDialog'
import { InlineName } from '../shell/InlineName'
import { PageHeader } from '../shell/PageHeader'
import { Status, type StatusTone } from '../shell/Status'
import type { RuntimeState } from '../shell/runtime'
import { CHANNELS, parseSettings } from './SettingsDomain'
import type { AppSettings, UpdateChannel } from './SettingsDomain'
import { TRACE_EXPIRY_DAYS, lapsText, parseStorageInfo, sizeText } from './SettingsStorage'
import type { StorageInfo } from './SettingsStorage'
import { parseUpdatesInfo, useUpdateCheck, useUpdateInstall } from './SettingsUpdates'
import type { UpdateCheckState } from './SettingsUpdates'
import { ListRow, SettingsList, Switch } from './SettingsLayout'

type Send = (command: SprintCommand) => Promise<void>

/**
 * Settings: you first, as a driver card (name and race number, renamed in place with the pen),
 * then grouped lists — Sprint web (only with the feature on), Updates, Storage, and Reset on its own
 * at the bottom. Everything saves on commit; risky changes (pre-release builds, installing an
 * update, web-only storage, deleting old laps' telemetry, resetting preferences) confirm first. The page has no primary button until an
 * update is ready to install.
 */
export function SettingsView({ runtime, send, onSetUpCloud }: { runtime: RuntimeState; send: Send; onSetUpCloud: () => void }) {
  if (runtime.kind === 'loading') {
    return (
      <div className="settings">
        <PageHeader title="Settings" />
        <div className="card skeleton settings-driver-skeleton" />
        <div className="card skeleton settings-list-skeleton" />
        <div className="card skeleton settings-list-skeleton" />
      </div>
    )
  }

  const settings = parseSettings(runtime.sprint.settings)
  const updatesInfo = parseUpdatesInfo(runtime.sprint)
  const storageInfo = parseStorageInfo(runtime.sprint)

  return (
    <div className="settings">
      <PageHeader title="Settings" />
      <DriverCard settings={settings} send={send} />
      {runtime.sprint.features.sprintWeb && <CloudGroup account={runtime.sprint.account} cloud={runtime.sprint.cloud} send={send} onSetUp={onSetUpCloud} />}
      <UpdatesGroup channel={settings.updateChannel} version={updatesInfo?.version ?? null} send={send} />
      {storageInfo && <StorageGroup info={storageInfo} send={send} />}
      <ResetGroup send={send} />
    </div>
  )
}

// ── Driver ───────────────────────────────────────────────────────────────

/** The driver as a card: initials, the name as a 20px heading and the race number as a plate, each renamed in place. */
function DriverCard({ settings, send }: { settings: AppSettings; send: Send }) {
  const save = (field: 'driverName' | 'driverNumber', value: string) => void send({ type: 'settings.update', [field]: value })

  return (
    <section className="card settings-driver" aria-label="Driver">
      <span className="settings-driver-avatar" aria-hidden="true">
        {initialsFor(settings.driverName)}
      </span>
      <div className="settings-driver-text">
        <InlineName name={settings.driverName} label="Driver name" onRename={(name) => save('driverName', name)} />
        <span className="settings-secondary">Shown on your dashes and on laps you share</span>
      </div>
      <NumberPlate number={settings.driverNumber} onChange={(number) => save('driverNumber', number)} />
    </section>
  )
}

/**
 * The race number as a plate, edited in place like `InlineName`: the pen swaps it for an input
 * with a tick. Enter or the tick saves; Escape, or saving it empty or unchanged, puts it back.
 */
function NumberPlate({ number, onChange }: { number: string; onChange: (number: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft === null) {
    return (
      <div className="settings-plate-field">
        <span className="settings-plate tabular" aria-label={`Race number ${number}`}>
          #{number}
        </span>
        <button type="button" className="icon-button inline-name-button" aria-label="Change race number" title="Change race number" onClick={() => setDraft(number)}>
          <Pencil size={16} />
        </button>
      </div>
    )
  }

  const save = (): void => {
    const trimmed = draft.trim()
    if (trimmed.length > 0 && trimmed !== number) onChange(trimmed)
    setDraft(null)
  }

  return (
    <form
      className="settings-plate-field"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <input
        className="settings-plate-input tabular"
        aria-label="Race number"
        value={draft}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(null)
          }
        }}
      />
      <button type="submit" className="icon-button inline-name-button" aria-label="Save race number" title="Save">
        <Check size={16} />
      </button>
    </form>
  )
}

// ── Sprint web ───────────────────────────────────────────────────────────

const STORAGE_OPTIONS: Array<{ id: CloudStorageMode; label: string }> = [
  { id: 'Local', label: 'This PC' },
  { id: 'Both', label: 'Both' },
  { id: 'Remote', label: 'Web only' },
]

const STORAGE_DESCRIPTIONS: Record<CloudStorageMode, string> = {
  Local: 'This PC: sessions, setups and dashes stay here. Nothing uploads by itself.',
  Both: 'Both: everything stays here and is copied to Sprint web every few minutes.',
  Remote: 'Web only: finished sessions move to Sprint web once uploaded. Setups and dashes stay here too.',
}

const LIVE_STATUS: Record<LiveUplinkStatus, { label: string; tone: StatusTone }> = {
  Off: { label: 'Off', tone: 'neutral' },
  WaitingForGame: { label: 'Waiting for game', tone: 'neutral' },
  Connecting: { label: 'Connecting', tone: 'info' },
  Streaming: { label: 'Streaming', tone: 'success' },
  Reconnecting: { label: 'Reconnecting', tone: 'warning' },
}

/** Why live telemetry is off or reconnecting; the other states say it all in their status word. */
const liveDetail = (live: LiveUplink, storage: CloudStorageMode): string | null => {
  switch (live.status) {
    case 'Off':
      return storage === 'Local' ? 'Streams while you drive once data is kept on the web too.' : null
    case 'Reconnecting':
      return `${live.detail ?? 'The connection dropped.'} Retrying by itself; live data is skipped until it is back.`
    case 'WaitingForGame':
    case 'Connecting':
    case 'Streaming':
      return null
  }
}

/**
 * Sprint web: where this PC is connected, where data lives, manual upload/download and the live
 * uplink. Connecting (or changing server) runs the setup flow; the rows below only appear once
 * signed in.
 */
function CloudGroup({ account, cloud, send, onSetUp }: { account: Account; cloud: CloudState; send: Send; onSetUp: () => void }) {
  const [confirmRemote, setConfirmRemote] = useState(false)
  const [busy, setBusy] = useState<SyncDirection | null>(null)
  const [result, setResult] = useState<{
    direction: SyncDirection
    report: SyncReport
  } | null>(null)

  const sync = async (direction: SyncDirection) => {
    setBusy(direction)
    const report = await (direction === 'upload' ? bridge.syncUp() : bridge.syncDown())
    setResult({ direction, report })
    setBusy(null)
  }

  const setStorage = (storage: CloudStorageMode) => {
    if (storage === cloud.storage) return
    if (storage === 'Remote') setConfirmRemote(true)
    else void send({ type: 'cloud.configure', storage })
  }

  // This session's own result first; otherwise what the host last did (the background upload included).
  const shown = result ?? cloud.lastSync
  const progress = cloud.progress
  const live = LIVE_STATUS[cloud.live.status]

  return (
    <SettingsList title="Sprint web" footer={account.signedIn ? STORAGE_DESCRIPTIONS[cloud.storage] : undefined}>
      <ListRow
        id="settings-cloud-account"
        label={account.signedIn ? accountName(account) : 'Not connected'}
        detail={account.signedIn ? accountWhere(account) : 'Keep sessions, setups and dashes on your Sprint web server too.'}
      >
        {(labels) =>
          account.signedIn ? (
            <>
              <button type="button" className="button subtle" aria-describedby={labels['aria-describedby']} onClick={onSetUp}>
                Change server…
              </button>
              <button type="button" className="button subtle" onClick={() => void bridge.signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" className="button" aria-describedby={labels['aria-describedby']} onClick={onSetUp}>
              Set up Sprint web…
            </button>
          )
        }
      </ListRow>

      {account.signedIn && (
        <>
          <ListRow id="settings-cloud-storage" label="Keep data on">
            {(labels) => (
              <div className="segmented" role="radiogroup" {...labels}>
                {STORAGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={cloud.storage === option.id}
                    className="segmented-item"
                    onClick={() => setStorage(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </ListRow>

          <ListRow
            id="settings-cloud-sync"
            label={progress ? `${progress.direction === 'upload' ? 'Uploading' : 'Downloading'} ${progress.done} of ${progress.total}…` : 'Sync'}
            detail={shown ? syncReportText(shown.direction, shown.report) : 'Upload what changed here, or download what is only on the web.'}
            detailTone={shown && !shown.report.ok ? 'danger' : null}
          >
            {(labels) => (
              <>
                <button
                  type="button"
                  className="button subtle"
                  aria-describedby={labels['aria-describedby']}
                  disabled={busy !== null}
                  onClick={() => void sync('download')}
                >
                  <CloudDownload />
                  {busy === 'download' ? 'Downloading…' : 'Download'}
                </button>
                <button
                  type="button"
                  className="button subtle"
                  aria-describedby={labels['aria-describedby']}
                  disabled={busy !== null}
                  onClick={() => void sync('upload')}
                >
                  <CloudUpload />
                  {busy === 'upload' ? 'Uploading…' : 'Upload'}
                </button>
              </>
            )}
          </ListRow>

          <ListRow id="settings-cloud-live" label="Live telemetry" detail={liveDetail(cloud.live, cloud.storage)}>
            {() => (
              <Status tone={live.tone} quiet role="status">
                {live.label}
              </Status>
            )}
          </ListRow>
        </>
      )}

      {confirmRemote && (
        <ConfirmDialog
          title="Keep sessions on the web only?"
          message="After each upload, finished sessions are removed from this PC. Download brings them back at any time. Setups and dashes stay here."
          confirmLabel="Web only"
          initialFocus="cancel"
          onConfirm={() => {
            void send({ type: 'cloud.configure', storage: 'Remote' })
            setConfirmRemote(false)
          }}
          onCancel={() => setConfirmRemote(false)}
        />
      )}
    </SettingsList>
  )
}

// ── Updates ──────────────────────────────────────────────────────────────

/** The status word beside "Check now"; idle (not checked yet this visit) shows none. */
const CHECK_STATUS: Record<Exclude<UpdateCheckState['status'], 'available'>, { label: string; tone: StatusTone } | null> = {
  idle: null,
  checking: { label: 'Checking…', tone: 'neutral' },
  'up-to-date': { label: 'Up to date', tone: 'success' },
  failed: { label: 'Couldn’t check', tone: 'danger' },
}

/**
 * The running version as a row that turns into the update itself once one is out: "Sprint 0.2.0
 * is out" with the page's one primary, Install and restart (confirmed first). Otherwise a quiet
 * Check now with the last result beside it.
 */
function UpdatesGroup({ channel, version, send }: { channel: UpdateChannel; version: string | null; send: Send }) {
  const [confirmPreRelease, setConfirmPreRelease] = useState(false)
  const { state: updateState, check: checkUpdates } = useUpdateCheck(bridge.checkUpdates)
  const { state: installState, requestConfirm, cancel: cancelInstall, install } = useUpdateInstall(bridge.installUpdate)

  const channelLabel = CHANNELS.find((option) => option.id === channel)?.label ?? 'Stable'
  const latestVersion = updateState.status === 'available' ? updateState.latestVersion : null

  const setChannel = (next: UpdateChannel) => {
    void send({ type: 'settings.update', updateChannel: next })
  }

  return (
    <>
      <SettingsList title="Updates" footer="Pre-release builds get new features early and may contain bugs.">
        {updateState.status === 'available' ? (
          <ListRow
            id="settings-update"
            label={`Sprint ${updateState.latestVersion} is out`}
            detail={
              <>
                {version ? `You have ${version}` : channelLabel}
                {updateState.releaseUrl && (
                  <>
                    {' · '}
                    <a href={updateState.releaseUrl} target="_blank" rel="noreferrer">
                      What’s new
                    </a>
                  </>
                )}
              </>
            }
          >
            {(labels) => (
              <button
                type="button"
                className="button primary"
                aria-describedby={labels['aria-describedby']}
                onClick={requestConfirm}
                disabled={installState.status === 'installing' || installState.status === 'confirming'}
              >
                <Download />
                {installState.status === 'installing' ? 'Downloading…' : 'Install and restart'}
              </button>
            )}
          </ListRow>
        ) : (
          <ListRow id="settings-update" label={version ? `Sprint ${version}` : 'Sprint'} detail={channelLabel}>
            {(labels) => {
              const status = CHECK_STATUS[updateState.status]
              return (
                <>
                  {status && (
                    <Status tone={status.tone} quiet role="status">
                      {status.label}
                    </Status>
                  )}
                  <button
                    type="button"
                    className="button subtle"
                    aria-describedby={labels['aria-describedby']}
                    onClick={() => void checkUpdates(true)}
                    disabled={updateState.status === 'checking'}
                  >
                    {updateState.status === 'failed' ? 'Try again' : 'Check now'}
                  </button>
                </>
              )
            }}
          </ListRow>
        )}

        <ListRow id="settings-pre-release" label="Pre-release builds">
          {(labels) => <Switch {...labels} checked={channel === 'pre-release'} onChange={(next) => (next ? setConfirmPreRelease(true) : setChannel('stable'))} />}
        </ListRow>
      </SettingsList>

      {installState.status === 'unavailable' && (
        <div className="infobar info" role="status">
          <span className="infobar-icon" aria-hidden="true">
            i
          </span>
          <strong className="infobar-title">Can’t install here</strong>
          <span className="infobar-message">Installing updates only works in the installed app, not in this dev build.</span>
        </div>
      )}
      {installState.status === 'failed' && (
        <div className="infobar error" role="alert">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <strong className="infobar-title">Couldn’t install the update</strong>
          <span className="infobar-message">{installState.reason}</span>
        </div>
      )}

      {confirmPreRelease && (
        <ConfirmDialog
          title="Switch to pre-release builds?"
          message="Pre-release builds ship early and may contain bugs, unfinished features, and breaking changes. You can switch back to stable at any time."
          confirmLabel="Use pre-release"
          initialFocus="cancel"
          onConfirm={() => {
            setChannel('pre-release')
            setConfirmPreRelease(false)
          }}
          onCancel={() => setConfirmPreRelease(false)}
        />
      )}

      {installState.status === 'confirming' && (
        <ConfirmDialog
          title={latestVersion ? `Install Sprint ${latestVersion}?` : 'Install the update?'}
          message="Sprint will close and restart to install the update."
          confirmLabel="Install and restart"
          initialFocus="cancel"
          onConfirm={() => void install()}
          onCancel={cancelInstall}
        />
      )}
    </>
  )
}

// ── Storage ──────────────────────────────────────────────────────────────

/**
 * What the laps' telemetry takes on this PC, as a number to read and nothing to manage: every lap
 * is kept. Deleting old laps' telemetry is the driver's choice, off until turned on, and turning
 * it on confirms first because the old laps lose theirs at once.
 */
function StorageGroup({ info, send }: { info: StorageInfo; send: Send }) {
  const [confirming, setConfirming] = useState(false)

  const setExpiry = (days: number) => void send({ type: 'settings.update', traceExpiryDays: days })

  return (
    <SettingsList title="Storage" footer="Every lap is saved with its telemetry: your inputs, the engine, tyres, brakes, suspension, fuel and damage.">
      <ListRow id="settings-storage-laps" label="Lap telemetry" detail={lapsText(info.traceLaps)}>
        {() => <span className="tabular">{sizeText(info.traceBytes)}</span>}
      </ListRow>

      <ListRow
        id="settings-storage-expiry"
        label={`Delete lap telemetry after ${TRACE_EXPIRY_DAYS} days`}
        detail="Lap times stay. Your five fastest laps per car and track keep their telemetry."
      >
        {(labels) => <Switch {...labels} checked={info.expiryDays > 0} onChange={(next) => (next ? setConfirming(true) : setExpiry(0))} />}
      </ListRow>

      {confirming && (
        <ConfirmDialog
          title={`Delete lap telemetry after ${TRACE_EXPIRY_DAYS} days?`}
          message={`Laps older than ${TRACE_EXPIRY_DAYS} days lose their telemetry now, and newer laps when they reach that age. Lap times, sectors and fuel use stay, and your five fastest laps per car and track keep everything. This can’t be undone.`}
          confirmLabel="Delete old telemetry"
          destructive
          onConfirm={() => {
            setExpiry(TRACE_EXPIRY_DAYS)
            setConfirming(false)
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SettingsList>
  )
}

// ── Reset ────────────────────────────────────────────────────────────────

function ResetGroup({ send }: { send: Send }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <SettingsList footer="App and dash-editor preferences go back to their defaults. Dashes, devices and setups stay.">
      <ListRow id="settings-reset" label="Reset preferences">
        {() => (
          <button type="button" className="button subtle destructive" aria-label="Reset preferences…" onClick={() => setConfirming(true)}>
            Reset…
          </button>
        )}
      </ListRow>

      {confirming && (
        <ConfirmDialog
          title="Reset all preferences?"
          message="App and dash-editor preferences return to their defaults. This can’t be undone."
          confirmLabel="Reset"
          destructive
          onConfirm={() => {
            void send({ type: 'settings.reset' })
            setConfirming(false)
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SettingsList>
  )
}
