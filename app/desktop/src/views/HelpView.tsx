import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Gamepad2, Plus, RefreshCw } from 'lucide-react'
import { bridge, type AppView, type SprintCommand } from '../bridge'
import { PageHeader } from '../shell/PageHeader'
import type { RuntimeState } from '../shell/runtime'
import { Status } from '../shell/Status'
import type { StatusTone } from '../shell/Status'
import type { NavigationTarget } from '../shell/ViewRouter'
import { primaryNav } from '../shell/nav'
import { TELEMETRY_STATUS_TONE } from '../shell/telemetry'
import { shortcutLabel } from '../shell/shortcuts'
import { platform } from '../platform'
import { DeviceImage } from './DeviceImage'
import { LOG_LEVELS, isLogLevelName, parseDiagnosticsInfo, parseLogEntries, parseScreenStatus, screenHint } from './HelpDiagnostics'
import type { LogEntry, LogLevelName } from './HelpDiagnostics'
import { homeDevices, homeGame } from './HomeDomain'
import { parseUpdatesInfo } from './SettingsUpdates'
import './HelpView.css'

// Log volume can be large; the store already caps retention, but the viewer also caps how many
// rows it renders (newest first) and scrolls the rest rather than growing the page unbounded.
const LOG_DISPLAY_LIMIT = 200

const formatLogTime = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString()
}

type LogsState = { phase: 'loading' } | { phase: 'loaded'; entries: LogEntry[] } | { phase: 'failed' }

const LOG_LEVEL_TONE: Record<LogLevelName, StatusTone> = {
  Debug: 'neutral',
  Info: 'info',
  Warn: 'warning',
  Error: 'danger',
  Fatal: 'danger',
}

const channelLabel = (channel: string): string => (channel === 'pre-release' ? 'Pre-release' : channel === 'stable' ? 'Stable' : channel)

/**
 * Help & diagnostics, for when something is wrong: the Checks first — the game link, then every
 * wheel and screen by name and picture, each problem with what to do about it — then the log
 * viewer for the detail (with the build and the log folder under it), then the keyboard
 * shortcuts. Updates live in Settings only; the page has no primary button.
 */
export function HelpView({
  runtime,
  send,
  onNavigate,
  onOpenItem,
}: {
  runtime: RuntimeState
  send: (command: SprintCommand) => Promise<void>
  onNavigate: (view: AppView) => void
  onOpenItem: (target: NavigationTarget) => void
}) {
  const diagnosticsInfo = runtime.kind === 'ready' ? parseDiagnosticsInfo(runtime.sprint) : null

  // Changing the level both re-scopes this viewer and persists the host's own capture level, so
  // entries below it are not discarded before they are asked for.
  const [levelFilter, setLevelFilter] = useState<LogLevelName | null>(null)
  const [textFilter, setTextFilter] = useState('')
  const [debouncedText, setDebouncedText] = useState('')
  const [logsState, setLogsState] = useState<LogsState>({ phase: 'loading' })
  const requestId = useRef(0)
  const effectiveLevel = levelFilter ?? diagnosticsInfo?.logLevel ?? 'Info'

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(textFilter.trim()), 300)
    return () => clearTimeout(timer)
  }, [textFilter])

  const fetchLogs = useCallback(async (level: LogLevelName, text: string) => {
    const id = ++requestId.current
    setLogsState({ phase: 'loading' })
    try {
      const raw = await bridge.diagnosticsLogs(level, text)
      if (id !== requestId.current) return
      setLogsState({ phase: 'loaded', entries: parseLogEntries(raw) })
    } catch {
      if (id !== requestId.current) return
      setLogsState({ phase: 'failed' })
    }
  }, [])

  useEffect(() => {
    void fetchLogs(effectiveLevel, debouncedText)
  }, [effectiveLevel, debouncedText, fetchLogs])

  const refreshLogs = () => void fetchLogs(effectiveLevel, debouncedText)

  if (runtime.kind === 'loading') {
    return (
      <div className="help">
        <PageHeader title="Help & diagnostics" />
        <div className="card skeleton help-checks-skeleton" />
        <div className="card skeleton help-logs-skeleton" />
      </div>
    )
  }

  const { sprint } = runtime
  const updatesInfo = parseUpdatesInfo(sprint)
  const build = updatesInfo ? `Sprint ${updatesInfo.version} · ${channelLabel(updatesInfo.channel)}` : 'Sprint'

  return (
    <div className="help">
      <PageHeader title="Help & diagnostics" />

      <Checks sprint={sprint} onOpenDevice={(deviceId) => onOpenItem({ view: 'Devices', deviceId })} onAddDevice={() => onNavigate('Devices')} />

      <section className="card list-card help-logs" aria-labelledby="help-logs-title">
        <div className="card-header">
          <h2 id="help-logs-title" className="card-title">
            Logs
          </h2>
          <div className="help-log-tools">
            <select
              aria-label="Log level"
              value={effectiveLevel}
              onChange={(event) => {
                const next = event.target.value
                if (!isLogLevelName(next)) return
                setLevelFilter(next)
                void send({ type: 'diagnostics.setLogLevel', level: next })
              }}
            >
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level === 'Fatal' ? 'Fatal only' : `${level} and above`}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="help-log-search"
              value={textFilter}
              onChange={(event) => setTextFilter(event.target.value)}
              placeholder="Filter"
              aria-label="Filter log text"
            />
            <button type="button" className="icon-button" onClick={refreshLogs} disabled={logsState.phase === 'loading'} aria-label="Refresh logs" title="Refresh logs">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <LogList state={logsState} onRetry={refreshLogs} />

        <div className="help-log-foot">
          <span className="help-log-build">
            {build}
            {diagnosticsInfo && (
              <>
                {' · '}
                <span className="mono">{diagnosticsInfo.directory}</span>
              </>
            )}
          </span>
          {diagnosticsInfo && <CopyPathButton path={diagnosticsInfo.directory} />}
        </div>
      </section>

      <Shortcuts />
    </div>
  )
}

// ── Checks ───────────────────────────────────────────────────────────────

/** The game link, then each enabled wheel or screen; anything not right says what to do. */
function Checks({
  sprint,
  onOpenDevice,
  onAddDevice,
}: {
  sprint: Extract<RuntimeState, { kind: 'ready' }>['sprint']
  onOpenDevice: (deviceId: string) => void
  onAddDevice: () => void
}) {
  const game = homeGame(sprint.telemetry)
  const devices = homeDevices(sprint)

  return (
    <section className="help-section" aria-labelledby="help-checks-title">
      <h2 id="help-checks-title" className="help-section-title">
        Checks
      </h2>
      <div className="card help-checks">
        <CheckRow
          picture={
            <span className="help-check-picture" aria-hidden="true">
              <Gamepad2 strokeWidth={1.5} />
            </span>
          }
          name={game.name}
          tone={TELEMETRY_STATUS_TONE[game.tone]}
          status={game.tone === 'live' && game.detail ? `${game.statusLabel} · ${game.detail}` : game.statusLabel}
          detail={game.tone === 'live' ? null : game.detail}
        />
        {devices.map((entry) => {
          const hint = entry.connected ? null : screenHint(parseScreenStatus(sprint.screens.find((screen) => screen.deviceId === entry.device.id)))
          return (
            <CheckRow
              key={entry.device.id}
              picture={<DeviceImage image={entry.image} dim={!entry.connected} className="help-check-picture" />}
              name={entry.device.name}
              tone={TELEMETRY_STATUS_TONE[entry.statusTone]}
              status={entry.statusLabel}
              detail={hint ?? (entry.dashName ? `Showing ${entry.dashName}` : null)}
              action={
                hint ? (
                  <button type="button" className="button subtle" onClick={() => onOpenDevice(entry.device.id)}>
                    Open device
                  </button>
                ) : null
              }
            />
          )
        })}
        {devices.length === 0 && (
          <CheckRow
            picture={
              <span className="help-check-picture" aria-hidden="true">
                <Plus strokeWidth={1.5} />
              </span>
            }
            name="No wheel or screen"
            tone="neutral"
            status="None added"
            detail="Add one to show a dash on it while you drive."
            action={
              <button type="button" className="button subtle" onClick={onAddDevice}>
                Add device
              </button>
            }
          />
        )}
      </div>
      <p className="help-section-footer">Everything Sprint needs while you drive. Anything that is not right says what to do.</p>
    </section>
  )
}

function CheckRow({
  picture,
  name,
  tone,
  status,
  detail,
  action = null,
}: {
  picture: ReactNode
  name: string
  tone: StatusTone
  status: string
  detail: string | null
  action?: ReactNode
}) {
  return (
    <div className="help-check">
      {picture}
      <span className="help-check-text">
        <span className="help-check-name">{name}</span>
        {detail && <span className="help-check-detail">{detail}</span>}
      </span>
      <span className="help-check-status">
        <Status tone={tone} quiet>
          {status}
        </Status>
        {action}
      </span>
    </div>
  )
}

// ── Logs ─────────────────────────────────────────────────────────────────

function LogList({ state, onRetry }: { state: LogsState; onRetry: () => void }) {
  switch (state.phase) {
    case 'loading':
      return <div className="skeleton help-log-skeleton" />
    case 'failed':
      return (
        <div className="infobar error help-inset" role="alert">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <strong className="infobar-title">Couldn’t load log entries</strong>
          <span className="infobar-message">The native host did not answer.</span>
          <button type="button" className="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )
    case 'loaded': {
      const newestFirst = [...state.entries].reverse()
      const visible = newestFirst.slice(0, LOG_DISPLAY_LIMIT)
      if (visible.length === 0) return <p className="list-card-empty">No log entries match.</p>
      return (
        <>
          <ul className="help-log-list">
            {visible.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="help-log-entry" title={new Date(entry.timestamp).toLocaleString()}>
                <span className="help-secondary tabular">{formatLogTime(entry.timestamp)}</span>
                <Status tone={LOG_LEVEL_TONE[entry.level]} quiet>
                  {entry.level}
                </Status>
                <span className="help-log-message">{entry.message}</span>
                {entry.exception && <span className="help-log-exception mono">{entry.exception}</span>}
              </li>
            ))}
          </ul>
          {newestFirst.length > visible.length && (
            <p className="list-card-empty help-log-truncated">
              The newest {LOG_DISPLAY_LIMIT} of {newestFirst.length} entries.
            </p>
          )}
        </>
      )
    }
  }
}

/** Copies the log folder's path; the tick confirms for two seconds. */
function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      className="button subtle"
      onClick={() => {
        void navigator.clipboard.writeText(path).then(() => setCopied(true))
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy path'}
    </button>
  )
}

// ── Shortcuts ────────────────────────────────────────────────────────────

const SHORTCUTS: ReadonlyArray<{ action: string; keys: string }> = [
  { action: 'Search pages and actions', keys: shortcutLabel(platform, { kind: 'palette' }) },
  {
    action: 'Go to a page in the sidebar, in its order',
    keys: `${shortcutLabel(platform, { kind: 'navigate', index: 0 })} … ${shortcutLabel(platform, { kind: 'navigate', index: primaryNav.length - 1 })}`,
  },
  { action: 'Up a level', keys: shortcutLabel(platform, { kind: 'back' }) },
]

function Shortcuts() {
  return (
    <section className="help-section" aria-labelledby="help-shortcuts-title">
      <h2 id="help-shortcuts-title" className="help-section-title">
        Keyboard shortcuts
      </h2>
      <dl className="card help-shortcuts">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.action} className="help-shortcut">
            <dt>{shortcut.action}</dt>
            <dd>
              <kbd className="help-key">{shortcut.keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
