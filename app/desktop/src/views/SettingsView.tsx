import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, CloudDownload, CloudUpload, Download, FlaskConical, HardDrive, Hash, RefreshCw, RotateCcw, UserRound, type LucideIcon } from 'lucide-react'
import { bridge } from '../bridge'
import type { Account, CloudState, CloudStorageMode, SprintCommand, SyncDirection, SyncReport } from '../bridge'
import { syncReportText } from '../onboarding/summary'
import { ConfirmDialog } from '../shell/ContentDialog'
import { PageHeader } from '../shell/PageHeader'
import type { RuntimeState } from '../shell/runtime'
import { CHANNELS, parseSettings } from './SettingsDomain'
import type { AppSettings, UpdateChannel } from './SettingsDomain'
import { parseUpdatesInfo, useUpdateCheck, useUpdateInstall } from './SettingsUpdates'
import type { UpdateCheckState } from './SettingsUpdates'
import './SettingsView.css'

type Send = (command: SprintCommand) => Promise<void>

/**
 * Settings in the Windows 11 Settings layout: titled groups of setting cards,
 * each with an icon, a title, a one-line description and its control on the
 * right. Everything saves on commit (text on blur/Enter, the switch at once);
 * risky changes — opting into pre-release builds, installing an update,
 * resetting preferences — confirm in a ContentDialog first.
 */
export function SettingsView({ runtime, send, onSetUpCloud }: { runtime: RuntimeState; send: Send; onSetUpCloud: () => void }) {
  if (runtime.kind === 'loading') {
    return (
      <div className="settings">
        <PageHeader title="Settings" />
        <div className="settings-group">
          <div className="card skeleton settings-row-skeleton" />
          <div className="card skeleton settings-row-skeleton" />
          <div className="card skeleton settings-row-skeleton" />
        </div>
      </div>
    )
  }

  const settings = parseSettings(runtime.sprint.settings)
  const updatesInfo = parseUpdatesInfo(runtime.sprint)

  return (
    <div className="settings">
      <PageHeader title="Settings" />
      {/* Keyed on the saved values so a reset (or any host-side change) refreshes the drafts. */}
      <ProfileGroup key={`${settings.driverName}\u0000${settings.driverNumber}`} settings={settings} send={send} />
      <CloudGroup account={runtime.sprint.account} cloud={runtime.sprint.cloud} send={send} onSetUp={onSetUpCloud} />
      <UpdatesGroup channel={settings.updateChannel} version={updatesInfo?.version ?? null} send={send} />
      <ResetGroup send={send} />
    </div>
  )
}

function ProfileGroup({ settings, send }: { settings: AppSettings; send: Send }) {
  const [name, setName] = useState(settings.driverName)
  const [number, setNumber] = useState(settings.driverNumber)

  // An emptied field restores the saved value instead of saving a blank.
  const commit = (field: 'driverName' | 'driverNumber', draft: string, saved: string, restore: (value: string) => void) => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      restore(saved)
      return
    }
    if (trimmed !== saved) void send({ type: 'settings.update', [field]: trimmed })
  }

  return (
    <SettingsGroup title="Profile">
      <SettingRow id="settings-driver-name" icon={UserRound} title="Driver name" description="Your name as Sprint shows it.">
        {(labels) => (
          <input
            {...labels}
            className="settings-input-wide"
            value={name}
            placeholder="Driver name"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => commit('driverName', name, settings.driverName, setName)}
            onKeyDown={blurOnEnter}
          />
        )}
      </SettingRow>
      <SettingRow id="settings-driver-number" icon={Hash} title="Driver number" description="Your race number.">
        {(labels) => (
          <input
            {...labels}
            className="settings-input-narrow tabular"
            value={number}
            placeholder="Number"
            onChange={(event) => setNumber(event.target.value)}
            onBlur={() => commit('driverNumber', number, settings.driverNumber, setNumber)}
            onKeyDown={blurOnEnter}
          />
        )}
      </SettingRow>
    </SettingsGroup>
  )
}

const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur()
}

const STORAGE_OPTIONS: Array<{ id: CloudStorageMode; label: string }> = [
  { id: 'Local', label: 'This PC' },
  { id: 'Both', label: 'Both' },
  { id: 'Remote', label: 'Web only' },
]

const STORAGE_DESCRIPTIONS: Record<CloudStorageMode, string> = {
  Local: 'Sessions, setups and dashes stay on this PC. Nothing uploads by itself.',
  Both: 'Everything stays here and is copied to Sprint web every few minutes.',
  Remote: 'Finished sessions move to Sprint web once uploaded. Setups and dashes stay here too.',
}

/**
 * Sprint web: where this PC is connected, where data lives, and manual upload/download.
 * Connecting (or changing server) runs the setup flow; the rows below only appear once signed in.
 */
function CloudGroup({ account, cloud, send, onSetUp }: { account: Account; cloud: CloudState; send: Send; onSetUp: () => void }) {
  const [confirmRemote, setConfirmRemote] = useState(false)
  const [busy, setBusy] = useState<SyncDirection | null>(null)
  const [result, setResult] = useState<{ direction: SyncDirection; report: SyncReport } | null>(null)

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

  return (
    <SettingsGroup title="Sprint web">
      <SettingRow
        id="settings-cloud-server"
        icon={Cloud}
        title={account.signedIn ? `Signed in as ${account.displayName}` : 'Not connected'}
        description={account.signedIn ? `${account.email} on ${account.serverUrl}` : 'Keep sessions, setups and dashes on your Sprint web server too.'}
      >
        {(labels) =>
          account.signedIn ? (
            <>
              <button type="button" className="button" aria-describedby={labels['aria-describedby']} onClick={onSetUp}>
                Change server…
              </button>
              <button type="button" className="button subtle" onClick={() => void bridge.signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" className="button primary" aria-describedby={labels['aria-describedby']} onClick={onSetUp}>
              Set up Sprint web…
            </button>
          )
        }
      </SettingRow>

      {account.signedIn && (
        <>
          <SettingRow id="settings-cloud-storage" icon={HardDrive} title="Keep data on" description={STORAGE_DESCRIPTIONS[cloud.storage]}>
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
          </SettingRow>

          <SettingRow
            id="settings-cloud-sync"
            icon={shown && !shown.report.ok ? AlertTriangle : CloudUpload}
            iconTone={shown && !shown.report.ok ? 'danger' : null}
            title={progress ? `${progress.direction === 'upload' ? 'Uploading' : 'Downloading'} ${progress.done} of ${progress.total}…` : 'Sync now'}
            description={shown ? syncReportText(shown.direction, shown.report) : 'Upload what changed here, or download what is only on the web.'}
          >
            {(labels) => (
              <>
                <button type="button" className="button" aria-describedby={labels['aria-describedby']} disabled={busy !== null} onClick={() => void sync('download')}>
                  <CloudDownload />
                  {busy === 'download' ? 'Downloading…' : 'Download'}
                </button>
                <button type="button" className="button" aria-describedby={labels['aria-describedby']} disabled={busy !== null} onClick={() => void sync('upload')}>
                  <CloudUpload />
                  {busy === 'upload' ? 'Uploading…' : 'Upload'}
                </button>
              </>
            )}
          </SettingRow>
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
    </SettingsGroup>
  )
}

const UPDATE_HEADLINES: Record<UpdateCheckState['status'], string> = {
  idle: 'Check for updates',
  checking: 'Checking for updates…',
  'up-to-date': 'You’re up to date',
  available: 'Update available',
  failed: 'Couldn’t check for updates',
}

const UPDATE_ICONS: Record<UpdateCheckState['status'], LucideIcon> = {
  idle: RefreshCw,
  checking: RefreshCw,
  'up-to-date': CheckCircle2,
  available: Download,
  failed: AlertTriangle,
}

function UpdatesGroup({ channel, version, send }: { channel: UpdateChannel; version: string | null; send: Send }) {
  const [confirmPreRelease, setConfirmPreRelease] = useState(false)
  const { state: updateState, check: checkUpdates } = useUpdateCheck(bridge.checkUpdates)
  const { state: installState, requestConfirm, cancel: cancelInstall, install } = useUpdateInstall(bridge.installUpdate)

  const channelLabel = CHANNELS.find((option) => option.id === channel)?.label ?? 'Stable'
  const running = version ? `Sprint ${version} · ${channelLabel} channel` : `${channelLabel} channel`
  const latestVersion = updateState.status === 'available' ? updateState.latestVersion : null

  const setChannel = (next: UpdateChannel) => {
    void send({ type: 'settings.update', updateChannel: next })
  }

  return (
    <SettingsGroup title="Updates">
      <SettingRow
        id="settings-update-check"
        icon={UPDATE_ICONS[updateState.status]}
        iconTone={updateState.status === 'up-to-date' ? 'success' : updateState.status === 'failed' ? 'danger' : null}
        title={latestVersion ? `${UPDATE_HEADLINES.available}: ${latestVersion}` : UPDATE_HEADLINES[updateState.status]}
        description={
          updateState.status === 'available' && updateState.releaseUrl ? (
            <>
              {running} ·{' '}
              <a href={updateState.releaseUrl} target="_blank" rel="noreferrer">
                View release
              </a>
            </>
          ) : (
            running
          )
        }
      >
        {(labels) =>
          updateState.status === 'available' ? (
            <button
              type="button"
              className="button primary"
              aria-describedby={labels['aria-describedby']}
              onClick={requestConfirm}
              disabled={installState.status === 'installing' || installState.status === 'confirming'}
            >
              <Download />
              {installState.status === 'installing' ? 'Downloading…' : 'Install update'}
            </button>
          ) : (
            <button
              type="button"
              className="button primary"
              aria-describedby={labels['aria-describedby']}
              onClick={() => void checkUpdates(true)}
              disabled={updateState.status === 'checking'}
            >
              <RefreshCw />
              {updateState.status === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          )
        }
      </SettingRow>

      <SettingRow
        id="settings-pre-release"
        icon={FlaskConical}
        title="Pre-release updates"
        description="Get new features early. Pre-release builds may contain bugs and breaking changes."
      >
        {(labels) => (
          <Switch
            {...labels}
            checked={channel === 'pre-release'}
            onChange={(next) => (next ? setConfirmPreRelease(true) : setChannel('stable'))}
          />
        )}
      </SettingRow>

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
    </SettingsGroup>
  )
}

function ResetGroup({ send }: { send: Send }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <SettingsGroup title="Reset">
      <SettingRow
        id="settings-reset"
        icon={RotateCcw}
        title="Reset preferences"
        description="Restores app and dash-editor preferences to their defaults. Dashboards, devices, and setups are not changed."
      >
        {(labels) => (
          <button type="button" className="button destructive" aria-describedby={labels['aria-describedby']} onClick={() => setConfirming(true)}>
            Reset to defaults
          </button>
        )}
      </SettingRow>

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
    </SettingsGroup>
  )
}

// ── Layout pieces ──────────────────────────────────────────────────────────

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h2 id={id} className="settings-group-title">
        {title}
      </h2>
      {children}
    </section>
  )
}

type ControlLabels = { 'aria-labelledby': string; 'aria-describedby': string }

/**
 * One Windows 11 setting card. The control is a render prop so it can point
 * its accessible name and description at the card's own title and text.
 */
function SettingRow({
  id,
  icon: Icon,
  iconTone = null,
  title,
  description,
  children,
}: {
  id: string
  icon: LucideIcon
  iconTone?: 'success' | 'danger' | null
  title: string
  description: ReactNode
  children: (labels: ControlLabels) => ReactNode
}) {
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  return (
    <div className="card settings-row">
      <Icon className={`settings-row-icon${iconTone ? ` tone-${iconTone}` : ''}`} aria-hidden="true" />
      <div className="settings-row-text">
        <span id={titleId} className="settings-row-title">
          {title}
        </span>
        <span id={descriptionId} className="settings-row-description">
          {description}
        </span>
      </div>
      <div className="settings-row-control">{children({ 'aria-labelledby': titleId, 'aria-describedby': descriptionId })}</div>
    </div>
  )
}

/** Fluent ToggleSwitch: "On"/"Off" to its left, applies immediately. */
function Switch({ checked, onChange, ...labels }: ControlLabels & { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <span className="settings-switch-field">
      <span className="settings-switch-state" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      <button type="button" role="switch" aria-checked={checked} className="settings-switch" onClick={() => onChange(!checked)} {...labels}>
        <span className="settings-switch-knob" />
      </button>
    </span>
  )
}
