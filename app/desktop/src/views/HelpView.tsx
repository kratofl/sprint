import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, RefreshCw } from 'lucide-react'
import { bridge, type SprintCommand } from '../bridge'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import type { RuntimeState } from '../shell/runtime'
import { Status } from '../shell/Status'
import type { StatusTone } from '../shell/Status'
import { TELEMETRY_STATUS_TONE, describeTelemetry } from '../shell/telemetry'
import { shortcutLabel } from '../shell/shortcuts'
import { platform } from '../platform'
import { LOG_LEVELS, isLogLevelName, parseDiagnosticsInfo, parseLogEntries, parseScreenStatus, screenStatusLabel, screenStatusTone } from './HelpDiagnostics'
import type { LogEntry, LogLevelName } from './HelpDiagnostics'
import { TelemetryInfoBar } from './HomeView'
import { parseUpdatesInfo, useUpdateCheck } from './SettingsUpdates'
import type { UpdateCheckState } from './SettingsUpdates'
import './HelpView.css'

type Topic = { title: string; body: string }

// Written in current product language only — no reference to prior builds or
// migration status, per the product decision that there is no legacy user
// base to reconcile with.
const TOPICS: Topic[] = [
  {
    title: 'Navigation',
    body:
      platform === 'mac'
        ? 'Use the sidebar to move between Overview, Session planner, Analysis, Dashes, Devices, Setups, Race engineer, Settings, and Help. The sidebar button next to the window controls hides it to reclaim width; the same button in the toolbar brings it back.'
        : 'Use the navigation pane to move between Overview, Session planner, Analysis, Dashes, Devices, Setups, Race engineer, Settings, and Help. The menu button at its top collapses it to icons to reclaim width.',
  },
  {
    title: 'Telemetry status',
    body: `The ${platform === 'mac' ? 'toolbar' : 'title bar'} and the build details on this page report the active telemetry link. Green is a live connection; amber means connecting or stale data, gray means no game is running, red means the source cannot work.`,
  },
  {
    title: 'Race engineer',
    body: "Stage car control changes, review them against the car's current values, and push them once ready. Revert discards staged edits after confirmation. Quick messages and the radio log record what was sent.",
  },
  {
    title: 'Screens',
    body: 'The Screens list shows every screen output with its resolution, refresh rate, dash, latest frame and live connection status.',
  },
  {
    title: 'Keyboard shortcuts',
    body: `Press ${shortcutLabel(platform, { kind: 'palette' })} to open the command palette and search for any action or page. ${shortcutLabel(platform, { kind: 'navigate', index: 0 })} through ${shortcutLabel(platform, { kind: 'navigate', index: 6 })} jump straight to each page in the ${platform === 'mac' ? 'sidebar' : 'navigation pane'}, in the order it is listed, and ${shortcutLabel(platform, { kind: 'back' })} goes back.`,
  },
]

// Log volume can be large; the store already caps retention, but the viewer
// also caps how many rows it renders (newest first) and scrolls the rest
// rather than growing the page unbounded.
const LOG_DISPLAY_LIMIT = 200

// `screen.performance` (typed in bridge.ts) is the browser-frame capture's own delivery stats
// — a running frame counter and its payload size — not a string.
const screenPerformance = (performance: { sequence: number; bytes: number } | undefined): string =>
  performance ? `#${performance.sequence} · ${performance.bytes} B` : '—'

const formatLogTimestamp = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

type LogsState = { phase: 'loading' } | { phase: 'loaded'; entries: LogEntry[] } | { phase: 'failed' }

const LOG_LEVEL_TONE: Record<LogLevelName, StatusTone> = {
  Debug: 'neutral',
  Info: 'info',
  Warn: 'warning',
  Error: 'danger',
  Fatal: 'danger',
}

/**
 * Help & diagnostics: update check (the page's one accent command), problems
 * as InfoBars, build details next to the searchable help topics, the screen
 * outputs as a list, and the live log viewer.
 */
export function HelpView({ runtime, send }: { runtime: RuntimeState; send: (command: SprintCommand) => Promise<void> }) {
  const [query, setQuery] = useState('')

  const filteredTopics = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return TOPICS
    return TOPICS.filter((topic) => `${topic.title} ${topic.body}`.toLowerCase().includes(trimmed))
  }, [query])

  const diagnosticsInfo = runtime.kind === 'ready' ? parseDiagnosticsInfo(runtime.sprint) : null
  const updatesInfo = runtime.kind === 'ready' ? parseUpdatesInfo(runtime.sprint) : null

  // Changing the level both re-scopes this viewer and persists the host's own
  // capture level, so entries below it are not discarded before they are asked for.
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

  const { state: updateState, check: checkUpdates } = useUpdateCheck(bridge.checkUpdates)
  const refreshLogs = () => void fetchLogs(effectiveLevel, debouncedText)

  const header = (
    <PageHeader title="Help & diagnostics">
      <button type="button" className="button primary" onClick={() => void checkUpdates(true)} disabled={updateState.status === 'checking'}>
        <Download />
        {updateState.status === 'checking' ? 'Checking…' : 'Check for updates'}
      </button>
      <CommandDivider />
      <button type="button" className="button subtle" onClick={refreshLogs} disabled={logsState.phase === 'loading'}>
        <RefreshCw />
        Refresh logs
      </button>
    </PageHeader>
  )

  if (runtime.kind === 'loading') {
    return (
      <div className="help">
        {header}
        <div className="help-split">
          <div className="card skeleton help-skeleton" />
          <div className="card skeleton help-skeleton" />
        </div>
        <div className="card skeleton help-skeleton-tall" />
      </div>
    )
  }

  const { sprint } = runtime
  const telemetry = describeTelemetry(sprint.telemetry)
  const screens = sprint.screens.map((screen) => ({ screen, status: parseScreenStatus(screen) }))
  const faultedScreens = screens.filter(({ status }) => status && screenStatusTone(status.state) === 'fault')

  const orderedEntries = logsState.phase === 'loaded' ? [...logsState.entries].reverse() : []
  const visibleEntries = orderedEntries.slice(0, LOG_DISPLAY_LIMIT)
  const truncatedCount = orderedEntries.length - visibleEntries.length

  return (
    <div className="help">
      {header}

      <UpdateInfoBar state={updateState} />
      <TelemetryInfoBar telemetry={telemetry} />
      {faultedScreens.map(({ screen, status }) =>
        status ? (
          <div key={screen.deviceId} className="infobar error" role="alert">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <strong className="infobar-title">
              {screen.deviceId}: {screenStatusLabel(status.state)}
            </strong>
            <span className="infobar-message">{status.detail}</span>
          </div>
        ) : null,
      )}

      <div className="help-split">
        <section className="card list-card" aria-labelledby="help-build-title">
          <div className="card-header">
            <h2 id="help-build-title" className="card-title">
              This build
            </h2>
          </div>
          <dl className="help-facts">
            <div className="help-fact">
              <dt>Version</dt>
              <dd className="tabular">{updatesInfo?.version ?? 'Unknown'}</dd>
            </div>
            <div className="help-fact">
              <dt>Update channel</dt>
              <dd>{updatesInfo ? channelLabel(updatesInfo.channel) : 'Unknown'}</dd>
            </div>
            <div className="help-fact">
              <dt>Telemetry</dt>
              <dd>
                <Status tone={TELEMETRY_STATUS_TONE[telemetry.tone]}>{telemetry.label}</Status>
              </dd>
            </div>
            <div className="help-fact">
              <dt>Log level</dt>
              <dd>{diagnosticsInfo?.logLevel ?? 'Unknown'}</dd>
            </div>
            <div className="help-fact">
              <dt>Log directory</dt>
              <dd className="mono help-path">{diagnosticsInfo?.directory ?? 'Unknown'}</dd>
            </div>
          </dl>
        </section>

        <section className="card list-card" aria-labelledby="help-topics-title">
          <div className="card-header">
            <h2 id="help-topics-title" className="card-title">
              Help topics
            </h2>
            <input
              type="search"
              className="help-search"
              placeholder="Search help"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search help"
            />
          </div>
          {filteredTopics.length === 0 ? (
            <p className="list-card-empty">No topics match “{query.trim()}”.</p>
          ) : (
            <ul className="help-topics">
              {filteredTopics.map((topic) => (
                <li key={topic.title} className="help-topic">
                  <h3 className="help-topic-title">{topic.title}</h3>
                  <p className="help-topic-body">{topic.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card list-card help-screens" aria-labelledby="help-screens-title">
        <div className="card-header">
          <h2 id="help-screens-title" className="card-title">
            Screens
          </h2>
        </div>
        {screens.length === 0 ? (
          <p className="list-card-empty">No screens are reporting a frame yet.</p>
        ) : (
          <>
            <div className="list-header" aria-hidden="true">
              <span>Screen</span>
              <span>Output</span>
              <span>Dash</span>
              <span>Last frame</span>
              <span>Status</span>
            </div>
            <ul className="list-rows">
              {screens.map(({ screen, status }) => {
                const tone = status ? screenStatusTone(status.state) : 'idle'
                return (
                  <li key={screen.deviceId} className="list-row static">
                    <span className="help-ellipsis help-strong">{screen.deviceId}</span>
                    <span className="help-ellipsis tabular">
                      {screen.width} × {screen.height} · {screen.refreshHz} Hz
                    </span>
                    <span className="help-ellipsis help-secondary">{layoutName(screen.layout)}</span>
                    <span className="help-ellipsis help-secondary tabular">{screenPerformance(screen.performance)}</span>
                    <Status tone={TELEMETRY_STATUS_TONE[tone]} title={status?.detail ?? undefined}>
                      {status ? screenStatusLabel(status.state) : 'Unknown'}
                    </Status>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <section className="card list-card help-logs" aria-labelledby="help-logs-title">
        <div className="card-header">
          <h2 id="help-logs-title" className="card-title">
            Logs
          </h2>
          <div className="help-log-filters">
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
                  {level}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="help-log-search"
              value={textFilter}
              onChange={(event) => setTextFilter(event.target.value)}
              placeholder="Filter log text"
              aria-label="Filter log text"
            />
          </div>
        </div>

        {logsState.phase === 'loading' && <div className="skeleton help-log-skeleton" />}

        {logsState.phase === 'failed' && (
          <div className="infobar error help-inset" role="alert">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <strong className="infobar-title">Couldn’t load log entries</strong>
            <span className="infobar-message">The native host did not answer.</span>
            <button type="button" className="button" onClick={refreshLogs}>
              Try again
            </button>
          </div>
        )}

        {logsState.phase === 'loaded' && visibleEntries.length === 0 && <p className="list-card-empty">No log entries match your filters.</p>}

        {logsState.phase === 'loaded' && visibleEntries.length > 0 && (
          <>
            <div className="list-header" aria-hidden="true">
              <span>Time</span>
              <span>Level</span>
              <span>Message</span>
            </div>
            <ul className="list-rows help-log-list">
              {visibleEntries.map((entry, index) => (
                <li key={`${entry.timestamp}-${index}`} className="list-row static help-log-entry">
                  <span className="help-secondary tabular">{formatLogTimestamp(entry.timestamp)}</span>
                  <Status tone={LOG_LEVEL_TONE[entry.level]}>{entry.level}</Status>
                  <span className="help-log-message">{entry.message}</span>
                  {entry.exception && <span className="help-log-exception mono">{entry.exception}</span>}
                </li>
              ))}
            </ul>
            {truncatedCount > 0 && (
              <p className="list-card-empty help-log-truncated">
                Showing the most recent {LOG_DISPLAY_LIMIT} of {orderedEntries.length} matching entries.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/** The outcome of "Check for updates" as an InfoBar; nothing before the first check. */
function UpdateInfoBar({ state }: { state: UpdateCheckState }) {
  switch (state.status) {
    case 'idle':
    case 'checking':
      return null
    case 'up-to-date':
      return (
        <div className="infobar success" role="status">
          <span className="infobar-icon" aria-hidden="true">
            <Check strokeWidth={3} />
          </span>
          <strong className="infobar-title">You’re up to date</strong>
          <span className="infobar-message">This is the latest Sprint on your update channel.</span>
        </div>
      )
    case 'available':
      return (
        <div className="infobar info" role="status">
          <span className="infobar-icon" aria-hidden="true">
            i
          </span>
          <strong className="infobar-title">Sprint {state.latestVersion} is available</strong>
          <span className="infobar-message">Install it from Settings.</span>
          {state.releaseUrl && (
            <a className="button" href={state.releaseUrl} target="_blank" rel="noreferrer">
              View release
            </a>
          )}
        </div>
      )
    case 'failed':
      return (
        <div className="infobar error" role="alert">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <strong className="infobar-title">Couldn’t check for updates</strong>
          <span className="infobar-message">Try again in a moment.</span>
        </div>
      )
  }
}

const channelLabel = (channel: string): string => (channel === 'pre-release' ? 'Pre-release' : channel === 'stable' ? 'Stable' : channel)

/** The host sends the screen's resolved dash layout; only its name is shown here. */
function layoutName(layout: unknown): string {
  if (typeof layout !== 'object' || layout === null) return 'No dash'
  const name = Reflect.get(layout, 'name')
  return typeof name === 'string' && name.length > 0 ? name : 'No dash'
}
