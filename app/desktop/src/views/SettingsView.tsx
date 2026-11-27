import { Fragment, useEffect, useRef, useState } from 'react'
import { Check, Cloud, CloudDownload, CloudUpload, Download, HardDrive, Palette, Pencil, RefreshCw, Search, SlidersHorizontal, User } from 'lucide-react'
import { bridge } from '../bridge'
import type { Account, CloudState, CloudStorageMode, LiveUplink, LiveUplinkStatus, SprintCommand, SyncDirection, SyncReport, UpdateStatus } from '../bridge'
import { syncReportText } from '../onboarding/summary'
import { accountName, accountWhere, initialsFor } from '../shell/account'
import { ConfirmDialog } from '../shell/ContentDialog'
import { InlineName } from '../shell/InlineName'
import { Explorer, ExplorerGroup, ExplorerRow } from '../shell/Explorer'
import { PageHeader } from '../shell/PageHeader'
import { platform } from '../platform'
import { ProgressRing, RingGauge } from '../shell/ProgressRing'
import { Status, type StatusTone } from '../shell/Status'
import type { RuntimeState } from '../shell/runtime'
import { colourThemes } from '@sprint/dashboard'
import type { ColourTheme, DashColours, DashUnits } from '@sprint/dashboard'
import { NumberBox } from '../designer/controls'
import { TyreDrawing } from '../pitwall/tiles/CarTiles'
import '../pitwall/PitWall.css'
import { COLOUR_LIMIT_ROWS, COLOUR_PREVIEW_FRAME, COLOUR_PREVIEW_LAYOUT, COLOUR_PREVIEW_TYRES, THEME_DETAIL, colourLimitText, stepColourLimit } from './ColoursDomain'
import type { ColourMark } from './ColoursDomain'
import { ScaledDash } from './ScaledDash'
import { CHANNELS, DELTA_BASELINES, UNITS, parseSettings, sectionMatches } from './SettingsDomain'
import type { AppSettings, UpdateChannel } from './SettingsDomain'
import { TRACE_EXPIRY_DAYS, lapsText, parseStorageInfo, sizeText } from './SettingsStorage'
import type { StorageInfo } from './SettingsStorage'
import { parseUpdatesInfo } from './SettingsUpdates'
import type { UpdatesInfo } from './SettingsUpdates'
import { Switch } from '../shell/Switch'
import { ListRow, SettingsList, type ControlLabels } from './SettingsLayout'

type Send = (command: SprintCommand) => Promise<void>

/**
 * Settings, a page per section, picked in the explorer's grouped list (`SettingsExplorer`), which
 * stays out even while the driver hides the explorer elsewhere (`explorerPinned`): Driver (name
 * and race number, renamed in place with the pen), General (units, the delta, and resetting
 * preferences), Colours, Updates, Storage and, with the feature on, Account & sync. Everything
 * saves on commit; risky changes (pre-release builds, web-only storage, deleting old laps'
 * telemetry, resetting preferences) confirm first. The page has no primary button until an
 * update is out.
 */
export function SettingsView({
  runtime,
  send,
  onSetUpCloud,
  updateStatus,
}: {
  runtime: RuntimeState
  send: Send
  onSetUpCloud: () => void
  updateStatus: UpdateStatus
}) {
  const [section, setSection] = useState<SettingsSection>('driver')

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
  const sprintWeb = runtime.sprint.features.sprintWeb
  const account = runtime.sprint.account
  const sections = SECTIONS.filter((candidate) => (candidate.id !== 'storage' || storageInfo !== null) && (candidate.id !== 'web' || sprintWeb))
  const shown = sections.find((candidate) => candidate.id === section) ?? sections[0]
  const value: Record<SettingsSection, string | undefined> = {
    driver: settings.driverName || undefined,
    general: UNITS.find((option) => option.id === settings.units)?.label,
    colours: settings.colours.theme,
    updates: updateStatus.kind === 'available' ? 'Update' : updatesInfo?.version,
    storage: storageInfo ? sizeText(storageInfo.traceBytes) : undefined,
    web: account.signedIn ? 'Connected' : 'Off',
  }
  return (
    <div className="settings">
      <PageHeader title="Settings" />
      <h2 className="settings-sub-title">{shown.label}</h2>
      {shown.id === 'driver' && <DriverCard settings={settings} send={send} />}
      {shown.id === 'general' && (
        <>
          <DashGroup settings={settings} send={send} />
          <ResetGroup send={send} />
        </>
      )}
      {shown.id === 'colours' && <ColoursGroup colours={settings.colours} units={settings.units} send={send} />}
      {shown.id === 'updates' && <UpdatesGroup info={updatesInfo} channel={settings.updateChannel} status={updateStatus} send={send} />}
      {shown.id === 'storage' && storageInfo && <StorageGroup info={storageInfo} send={send} />}
      {shown.id === 'web' && <CloudGroup account={account} cloud={runtime.sprint.cloud} send={send} onSetUp={onSetUpCloud} />}
      <SettingsExplorer sections={sections} shown={shown.id} value={value} onOpen={setSection} />
    </div>
  )
}

/** The sections, each a page; Storage only once the host reports it, Account & sync only with Sprint web on. */
type SettingsSection = 'driver' | 'general' | 'colours' | 'updates' | 'storage' | 'web'

type SectionEntry = { id: SettingsSection; group: string; label: string; icon: typeof User; keywords: string }

/** In the explorer's order, under their group headings; the keywords are what the search also finds a section by. */
const SECTIONS: ReadonlyArray<SectionEntry> = [
  { id: 'driver', group: 'You', label: 'Driver', icon: User, keywords: 'name race number' },
  { id: 'general', group: 'Dash & wheel', label: 'General', icon: SlidersHorizontal, keywords: 'units metric imperial delta session best fastest reset preferences' },
  { id: 'colours', group: 'Dash & wheel', label: 'Colours', icon: Palette, keywords: 'theme cold good warm hot tyres brakes temperatures' },
  { id: 'updates', group: 'App', label: 'Updates', icon: Download, keywords: 'version channel stable pre-release beta check install' },
  { id: 'storage', group: 'App', label: 'Storage', icon: HardDrive, keywords: 'telemetry laps disk space delete old' },
  { id: 'web', group: 'Sprint web', label: 'Account & sync', icon: Cloud, keywords: 'sprint web account sign in sync cloud server live' },
]

const SEARCH_SHORTCUT = platform === 'mac' ? '⌘F' : 'Ctrl+F'

/**
 * The explorer's list: a search over the sections (Ctrl+F, ⌘F on macOS), then the sections under
 * their group headings, each with where it stands now. Enter opens the first match; Escape clears.
 */
function SettingsExplorer({
  sections,
  shown,
  value,
  onOpen,
}: {
  sections: ReadonlyArray<SectionEntry>
  shown: SettingsSection
  value: Record<SettingsSection, string | undefined>
  onOpen: (section: SettingsSection) => void
}) {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((platform === 'mac' ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        search.current?.focus()
        search.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const trimmed = query.trim()
  const matching = trimmed ? sections.filter((entry) => sectionMatches(entry, trimmed)) : sections
  const groups = [...new Set(matching.map((entry) => entry.group))]
  return (
    <Explorer label="Settings">
      <label className="input settings-search">
        <Search aria-hidden="true" />
        <input
          ref={search}
          type="search"
          placeholder="Search settings"
          aria-label="Search settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matching[0]) onOpen(matching[0].id)
            if (event.key === 'Escape' && query) {
              event.stopPropagation()
              setQuery('')
            }
          }}
        />
        {!query && <kbd>{SEARCH_SHORTCUT}</kbd>}
      </label>
      {groups.map((group) => (
        <Fragment key={group}>
          <ExplorerGroup title={group} />
          {matching
            .filter((entry) => entry.group === group)
            .map((entry) => {
              const Icon = entry.icon
              return (
                <ExplorerRow
                  key={entry.id}
                  lead={<Icon className="settings-explorer-icon" aria-hidden="true" />}
                  title={entry.label}
                  meta={value[entry.id]}
                  selected={entry.id === shown}
                  onClick={() => onOpen(entry.id)}
                />
              )
            })}
        </Fragment>
      ))}
      {matching.length === 0 && <p className="settings-search-empty">No settings match “{trimmed}”.</p>}
    </Explorer>
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

// ── Units and delta ──────────────────────────────────────────────────────

/** One of a row's choices as a segmented control; picking the one already on sends nothing. */
function Choice<T extends string>({ labels, value, options, onPick }: { labels: ControlLabels; value: T; options: ReadonlyArray<{ id: T; label: string }>; onPick: (id: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" {...labels}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className="segmented-item"
          onClick={() => {
            if (option.id !== value) onPick(option.id)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * What every dash reads: metric or imperial (the wheel, browser displays and every dash picture in
 * the app), and what the delta runs against while no plan target is set.
 */
function DashGroup({ settings, send }: { settings: AppSettings; send: Send }) {
  return (
    <SettingsList>
      <ListRow id="settings-units" label="Units" detail={UNITS.find((option) => option.id === settings.units)?.detail}>
        {(labels) => <Choice labels={labels} value={settings.units} options={UNITS} onPick={(units) => void send({ type: 'settings.update', units })} />}
      </ListRow>
      <ListRow id="settings-delta" label="Delta against" detail={DELTA_BASELINES.find((option) => option.id === settings.deltaBaseline)?.detail}>
        {(labels) => (
          <Choice labels={labels} value={settings.deltaBaseline} options={DELTA_BASELINES} onPick={(deltaBaseline) => void send({ type: 'settings.update', deltaBaseline })} />
        )}
      </ListRow>
    </SettingsList>
  )
}

// ── Colours ──────────────────────────────────────────────────────────────

/** The theme's scale as four dots, cold to hot, in the app's own shades. */
function HeatDots() {
  return (
    <span className="settings-colours-dots" aria-hidden="true">
      <span className="settings-colours-dot cold" />
      <span className="settings-colours-dot ok" />
      <span className="settings-colours-dot warm" />
      <span className="settings-colours-dot hot" />
    </span>
  )
}

/**
 * Settings › Colours, a page of its own: what colours mean on every dash, the pit wall and
 * Analysis. The theme (a select, with its scale and a small wheel and pit-wall preview drawn in
 * it), the gear redline switch, and, in its own list, where each value moves from cold to hot.
 * Each mark steps within its range and never past its neighbour.
 */
function ColoursGroup({ colours, units, send }: { colours: DashColours; units: DashUnits; send: Send }) {
  const setTheme = (theme: ColourTheme) => {
    if (theme !== colours.theme) void send({ type: 'settings.colours', theme })
  }
  return (
    <>
      <SettingsList
        footer="Your dashes, the pit wall and Analysis colour every value this way. Fastest laps stay purple and each knob keeps its colour in every theme."
      >
        <ListRow
          id="settings-colour-theme"
          label="Theme"
          detail={
            <span className="settings-colours-theme-detail">
              <HeatDots />
              {THEME_DETAIL[colours.theme]}
            </span>
          }
        >
          {(labels) => (
            <select {...labels} value={colours.theme} onChange={(event) => setTheme(colourThemes.find((theme) => theme === event.target.value) ?? colours.theme)}>
              {colourThemes.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          )}
        </ListRow>
        <div className="settings-colours-preview">
          <figure>
            <ScaledDash layout={COLOUR_PREVIEW_LAYOUT} size={{ width: 800, height: 480 }} maxWidth={320} maxHeight={192} frame={COLOUR_PREVIEW_FRAME} />
            <figcaption>Wheel</figcaption>
          </figure>
          <figure>
            <div className="settings-colours-tyres">
              {COLOUR_PREVIEW_TYRES.map((tyre) => (
                <TyreDrawing key={tyre.position} tyre={tyre} />
              ))}
            </div>
            <figcaption>Pit wall</figcaption>
          </figure>
        </div>
      </SettingsList>

      <SettingsList footer="Turn it off if your wheel’s own lights show the shift.">
        <ListRow id="settings-colours-gear-redline" label="Redline on the gear" detail="The gear turns red near the limit and blue at the shift point">
          {(labels) => <Switch {...labels} checked={colours.gearRedline} onChange={(next) => void send({ type: 'settings.colours', gearRedline: next })} />}
        </ListRow>
      </SettingsList>

      <SettingsList title="When colours change" footer="Water, oil and fuel laps warn from their alert’s limits (Dashes › Settings).">
        {COLOUR_LIMIT_ROWS.map((row) => (
          <ListRow key={row.id} id={`settings-colours-${row.id}`} label={row.label} detail={row.detail}>
            {() => row.marks.map((mark) => <ColourMarkBox key={mark.key} row={row.label} mark={mark} colours={colours} units={units} send={send} />)}
          </ListRow>
        ))}
      </SettingsList>
    </>
  )
}

/** One mark: the state it starts as a dot, and its limit with minus and plus. */
function ColourMarkBox({ row, mark, colours, units, send }: { row: string; mark: ColourMark; colours: DashColours; units: DashUnits; send: Send }) {
  const down = stepColourLimit(colours.limits, mark.key, -1)
  const up = stepColourLimit(colours.limits, mark.key, 1)
  const set = (value: number | null) => {
    if (value !== null) void send({ type: 'settings.colours', [mark.key]: value })
  }
  return (
    <span className="settings-colours-mark" title={mark.label}>
      <span className={`settings-colours-dot ${mark.heat}`} aria-hidden="true" />
      <NumberBox
        label={`${row}: ${mark.label}`}
        display={colourLimitText(mark.key, colours.limits[mark.key], units)}
        canDecrease={down !== null}
        canIncrease={up !== null}
        onDecrease={() => set(down)}
        onIncrease={() => set(up)}
      />
    </span>
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
    <SettingsList footer={account.signedIn ? STORAGE_DESCRIPTIONS[cloud.storage] : undefined}>
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

/** The status word beside "Check now"; idle (not checked yet) shows none. */
const CHECK_STATUS: Record<'idle' | 'checking' | 'up-to-date' | 'failed', { label: string; tone: StatusTone } | null> = {
  idle: null,
  checking: { label: 'Checking…', tone: 'neutral' },
  'up-to-date': { label: 'Up to date', tone: 'success' },
  failed: { label: 'Couldn’t update', tone: 'danger' },
}

/**
 * The running version as a row that turns into the update itself once one is out: "Sprint 0.3.0
 * is out" carries Update, the page's one primary, which downloads it and restarts Sprint into it
 * (the toolbar's update button does the same), then shows the download as a filling ring.
 * Otherwise a check-for-updates icon button with the last result beside it; while it checks, its
 * icon turns once and the download's ring stands empty around it. A dev build cannot
 * update and says so.
 */
function UpdatesGroup({ info, channel, status, send }: { info: UpdatesInfo | null; channel: UpdateChannel; status: UpdateStatus; send: Send }) {
  const [confirmPreRelease, setConfirmPreRelease] = useState(false)

  const channelLabel = CHANNELS.find((option) => option.id === channel)?.label ?? 'Stable'
  const you = info ? `You have ${info.version}` : channelLabel

  const setChannel = (next: UpdateChannel) => {
    void send({ type: 'settings.update', updateChannel: next })
  }

  const updateRow = (() => {
    switch (status.kind) {
      case 'available':
        return (
          <ListRow id="settings-update" label={`Sprint ${status.version} is out`} detail={`${you} · Sprint restarts to install it`}>
            {(labels) => (
              <button type="button" className="button primary" aria-describedby={labels['aria-describedby']} onClick={() => void bridge.installUpdate()}>
                <Download />
                Update
              </button>
            )}
          </ListRow>
        )
      case 'downloading':
        return (
          <ListRow id="settings-update" label={`Sprint ${status.version} is out`} detail={`${you} · Downloading… ${status.percent}%`}>
            {() => (
              <ProgressRing percent={status.percent} label={`Downloading Sprint ${status.version}`} size={24}>
                <Download size={12} aria-hidden="true" />
              </ProgressRing>
            )}
          </ListRow>
        )
      case 'installing':
        return (
          <ListRow id="settings-update" label={`Sprint ${status.version} is out`} detail={you}>
            {() => (
              <Status tone="neutral" quiet role="status">
                Installing…
              </Status>
            )}
          </ListRow>
        )
      case 'unsupported':
        return (
          <ListRow id="settings-update" label={info ? `Sprint ${info.version}` : 'Sprint'} detail="This build doesn’t update itself; the installed app does">
            {() => null}
          </ListRow>
        )
      default: {
        const shown = CHECK_STATUS[status.kind]
        const checkLabel = status.kind === 'failed' ? 'Try again' : 'Check for updates'
        return (
          <ListRow id="settings-update" label={info ? `Sprint ${info.version}` : 'Sprint'} detail={channelLabel}>
            {(labels) => (
              <>
                {shown && (
                  <Status tone={shown.tone} quiet role="status">
                    {shown.label}
                  </Status>
                )}
                <span className={status.kind === 'checking' ? 'settings-check checking' : 'settings-check'}>
                  <RingGauge size={24} percent={null} />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={checkLabel}
                    title={checkLabel}
                    aria-describedby={labels['aria-describedby']}
                    onClick={() => void bridge.checkUpdates()}
                    disabled={status.kind === 'checking'}
                  >
                    <RefreshCw size={16} />
                  </button>
                </span>
              </>
            )}
          </ListRow>
        )
      }
    }
  })()

  return (
    <>
      <SettingsList footer="Pre-release builds get new features early and may contain bugs.">
        {updateRow}

        <ListRow id="settings-auto-update" label="Install updates automatically" detail="A new version installs when Sprint starts">
          {(labels) => (
            <Switch {...labels} checked={info?.autoInstall ?? true} onChange={(next) => void send({ type: 'settings.update', autoInstallUpdates: next })} />
          )}
        </ListRow>

        <ListRow id="settings-pre-release" label="Pre-release builds">
          {(labels) => <Switch {...labels} checked={channel === 'pre-release'} onChange={(next) => (next ? setConfirmPreRelease(true) : setChannel('stable'))} />}
        </ListRow>
      </SettingsList>

      {confirmPreRelease && (
        <ConfirmDialog
          title="Switch to pre-release builds?"
          message="Pre-release builds ship early and may contain bugs, unfinished features, and breaking changes. They don’t install on their own unless you turn that on. You can switch back to stable at any time."
          confirmLabel="Use pre-release"
          initialFocus="cancel"
          onConfirm={() => {
            setChannel('pre-release')
            setConfirmPreRelease(false)
          }}
          onCancel={() => setConfirmPreRelease(false)}
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
    <SettingsList footer="Every lap is saved with its telemetry: your inputs, the engine, tyres, brakes, suspension, fuel and damage.">
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
