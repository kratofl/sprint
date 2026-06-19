import { useEffect, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsCard,
  SettingsRow,
  StatusPill,
} from '@sprint/ui'
import { appInfoAPI, settingsAPI, updateAPI, type BuildChannel } from '@/lib/settings'
import type { AppSettings, NewDashDefaults, ReleaseInfo } from '@sprint/types'

type DashMode = 'advanced' | 'basic'
type SpeedUnit = 'km/h' | 'mph'
type TempUnit = 'c' | 'f'
type Channel = AppSettings['updateChannel']
type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update-found'

const DASH_MODE_OPTIONS = [
  { value: 'advanced', label: 'Advanced' },
  { value: 'basic', label: 'Basic' },
] satisfies Array<{ value: DashMode; label: string }>

const SPEED_UNIT_OPTIONS = [
  { value: 'km/h', label: 'km/h' },
  { value: 'mph', label: 'mph' },
] satisfies Array<{ value: SpeedUnit; label: string }>

const TEMP_UNIT_OPTIONS = [
  { value: 'c', label: 'C' },
  { value: 'f', label: 'F' },
] satisfies Array<{ value: TempUnit; label: string }>

const CHANNEL_OPTIONS = [
  { value: 'stable', label: 'Stable' },
  { value: 'pre-release', label: 'Pre-release' },
] satisfies Array<{ value: Channel; label: string }>

const DISPLAY_OPTIONS = [
  'Formula 1080x480',
  'GT 5in 800x480',
  'Ultrawide 1920x480',
  'Square 480x480',
] as const

const DEFAULT_NEW_DASH: Required<NewDashDefaults> = {
  mode: 'advanced',
  display: 'Formula 1080x480',
  speedUnit: 'km/h',
  tempUnit: 'c',
}

const channelStatus: Record<BuildChannel, 'success' | 'warning' | 'info' | 'neutral'> = {
  dev: 'warning',
  alpha: 'info',
  beta: 'neutral',
  release: 'success',
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>({ updateChannel: 'stable' })
  const [version, setVersion] = useState('dev')
  const [buildChannel, setBuildChannel] = useState<BuildChannel>('dev')
  const [pendingChannel, setPendingChannel] = useState<Channel | null>(null)
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [foundRelease, setFoundRelease] = useState<ReleaseInfo | null>(null)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    settingsAPI.getSettings().then((s) => { setSettings(s); setLoaded(true) }).catch(() => setLoaded(true))
    appInfoAPI.getVersion().then(setVersion).catch(() => {})
    appInfoAPI.getBuildChannel().then(setBuildChannel).catch(() => {})
  }, [])

  // Persist only after the initial load resolves. Saving in the brief pre-load
  // window would write an AppSettings missing fields this view doesn't manage
  // (e.g. dashEditorUI), which would clobber them on disk on the next load.
  const persist = (next: AppSettings) => {
    if (loaded) settingsAPI.saveSettings(next).catch(() => {})
  }

  // Persist a fully-formed settings object, keeping local state in sync.
  const save = (next: AppSettings) => {
    setSettings(next)
    persist(next)
  }

  const defaults = { ...DEFAULT_NEW_DASH, ...settings.newDashDefaults }

  const updateDefaults = (patch: Partial<NewDashDefaults>) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        newDashDefaults: { ...DEFAULT_NEW_DASH, ...prev.newDashDefaults, ...patch },
      }
      persist(next)
      return next
    })
  }

  const commitDriver = (field: 'driverName' | 'driverNumber', value: string) => {
    setSettings((prev) => {
      const next: AppSettings = { ...prev, [field]: value.trim() }
      persist(next)
      return next
    })
  }

  const applyChannel = (channel: Channel) => {
    setSettings((prev) => {
      const next: AppSettings = { ...prev, updateChannel: channel }
      persist(next)
      return next
    })
  }

  const handleChannelChange = (channel: Channel) => {
    if (channel === settings.updateChannel) return
    if (channel === 'pre-release') setPendingChannel('pre-release')
    else applyChannel('stable')
  }

  const confirmPrerelease = () => {
    applyChannel('pre-release')
    setPendingChannel(null)
  }

  const checkNow = async () => {
    setCheckState('checking')
    setFoundRelease(null)
    try {
      const info = await updateAPI.checkNow()
      if (info) {
        setFoundRelease(info)
        setCheckState('update-found')
      } else {
        setCheckState('up-to-date')
      }
    } catch {
      setCheckState('idle')
    }
  }

  const resetDefaults = () => {
    save({ ...settings, newDashDefaults: { ...DEFAULT_NEW_DASH } })
    setConfirmResetOpen(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <PageHeader heading="Settings" caption="Global studio preferences" />

      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsCard>
          <div className="border-b border-[var(--line)] px-3 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--text)]">New dashboard defaults</h3>
          </div>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Default mode</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Applied only when creating a new dash.</p>
            </div>
            <SegmentedControl
              label="Default dash mode"
              value={defaults.mode}
              options={DASH_MODE_OPTIONS}
              onChange={(value) => updateDefaults({ mode: value as DashMode })}
            />
          </SettingsRow>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Wheel display</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Default resolution preset for new layouts.</p>
            </div>
            <Select
              value={defaults.display}
              onValueChange={(value) => updateDefaults({ display: value })}
            >
              <SelectTrigger aria-label="Default wheel display" size="sm" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Speed unit</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Used by newly-created dash widgets.</p>
            </div>
            <SegmentedControl
              label="Default speed unit"
              value={defaults.speedUnit}
              options={SPEED_UNIT_OPTIONS}
              onChange={(value) => updateDefaults({ speedUnit: value as SpeedUnit })}
            />
          </SettingsRow>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Temperature</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Used by tyre and engine temperature widgets.</p>
            </div>
            <SegmentedControl
              label="Default temperature unit"
              value={defaults.tempUnit}
              options={TEMP_UNIT_OPTIONS}
              onChange={(value) => updateDefaults({ tempUnit: value as TempUnit })}
            />
          </SettingsRow>
        </SettingsCard>

        <SettingsCard>
          <div className="border-b border-[var(--line)] px-3 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--text)]">Driver identity</h3>
            <p className="mt-1 text-[11px] text-[var(--text3)]">Shown on dashboards and saved with the session.</p>
          </div>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Driver name</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Used by name widgets and exports.</p>
            </div>
            <Input
              type="text"
              value={settings.driverName ?? ''}
              onChange={(event) => setSettings((prev) => ({ ...prev, driverName: event.target.value }))}
              onBlur={(event) => commitDriver('driverName', event.target.value)}
              placeholder="Your name"
              aria-label="Driver name"
              className="h-8 w-[190px] rounded-control"
            />
          </SettingsRow>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Driver number</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Optional race number.</p>
            </div>
            <Input
              type="text"
              value={settings.driverNumber ?? ''}
              onChange={(event) => setSettings((prev) => ({ ...prev, driverNumber: event.target.value }))}
              onBlur={(event) => commitDriver('driverNumber', event.target.value)}
              placeholder="#22"
              aria-label="Driver number"
              className="h-8 w-[190px] rounded-control"
            />
          </SettingsRow>
        </SettingsCard>

        <SettingsCard>
          <div className="border-b border-[var(--line)] px-3 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--text)]">Updates</h3>
            <p className="mt-1 text-[11px] text-[var(--text3)]">
              Stable builds by default. Pre-release receives alpha and beta builds early.
            </p>
          </div>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Update channel</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Pre-release builds may be unstable.</p>
            </div>
            <SegmentedControl
              label="Update channel"
              value={settings.updateChannel}
              options={CHANNEL_OPTIONS}
              onChange={(value) => handleChannelChange(value as Channel)}
            />
          </SettingsRow>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Check for updates</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Manually query the release feed now.</p>
            </div>
            <div className="flex items-center gap-2">
              {checkState === 'up-to-date' ? <StatusPill status="success">Up to date</StatusPill> : null}
              {checkState === 'update-found' && foundRelease ? (
                <StatusPill status="info">v{foundRelease.version} available</StatusPill>
              ) : null}
              <Button variant="secondary" size="sm" onClick={checkNow} disabled={checkState === 'checking'}>
                {checkState === 'checking' ? 'Checking…' : 'Check now'}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Version</span>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Desktop build metadata.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] tabular-nums text-[var(--text)]">v{version}</span>
              <StatusPill status={channelStatus[buildChannel]}>
                {buildChannel.toUpperCase()}
              </StatusPill>
            </div>
          </SettingsRow>
          <SettingsRow>
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => setConfirmResetOpen(true)}>
              Reset new dashboard defaults
            </Button>
          </SettingsRow>
        </SettingsCard>
      </div>

      <ConfirmDialog
        open={pendingChannel !== null}
        title="Switch to Pre-release?"
        message="Pre-release builds may be unstable and contain bugs. Only use them if you are comfortable testing early features."
        confirmLabel="Switch to Pre-release"
        cancelLabel="Keep Stable"
        onConfirm={confirmPrerelease}
        onCancel={() => setPendingChannel(null)}
      />

      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset dashboard defaults?"
        message="New dashboard defaults will return to the Graphite baseline. Driver identity and update settings are unaffected."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onConfirm={resetDefaults}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  )
}
