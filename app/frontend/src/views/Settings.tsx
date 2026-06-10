import { useCallback, useEffect, useState } from 'react'
import { IconCheck, IconLoader2, IconRefresh } from '@tabler/icons-react'
import { Badge, Button, Input, PageHeader, cn } from '@sprint/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { appInfoAPI, settingsAPI, updateAPI, type BuildChannel } from '@/lib/settings'
import type { AppSettings, ReleaseInfo } from '@sprint/types'

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update-found'

function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
      <h2 className="font-inter text-[13px] font-bold text-[var(--text)]">{title}</h2>
      <div className="mt-[14px] flex flex-col gap-[14px]">{children}</div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="ui-label text-[11px] font-bold text-[var(--muted)]">{children}</label>
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>({ updateChannel: 'stable' })
  const [pendingChannel, setPendingChannel] = useState<AppSettings['updateChannel'] | null>(null)
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [foundRelease, setFoundRelease] = useState<ReleaseInfo | null>(null)
  const [version, setVersion] = useState('dev')
  const [buildChannel, setBuildChannel] = useState<BuildChannel>('dev')

  useEffect(() => {
    settingsAPI.getSettings().then(setSettings).catch(() => {})
    appInfoAPI.getVersion().then(setVersion).catch(() => {})
    appInfoAPI.getBuildChannel().then(setBuildChannel).catch(() => {})
  }, [])

  const applyChannel = useCallback((channel: AppSettings['updateChannel']) => {
    const next: AppSettings = { ...settings, updateChannel: channel }
    setSettings(next)
    settingsAPI.saveSettings(next).catch(() => {})
  }, [settings])

  const handleChannelChange = useCallback((channel: AppSettings['updateChannel']) => {
    if (channel === settings.updateChannel) return
    if (channel === 'pre-release') setPendingChannel(channel)
    else applyChannel(channel)
  }, [applyChannel, settings.updateChannel])

  const applyProfile = useCallback((patch: Partial<AppSettings>) => {
    const next: AppSettings = { ...settings, ...patch }
    setSettings(next)
    settingsAPI.saveSettings(next).catch(() => {})
  }, [settings])

  const confirmPrerelease = useCallback(() => {
    if (!pendingChannel) return
    applyChannel(pendingChannel)
    setPendingChannel(null)
  }, [applyChannel, pendingChannel])

  const checkNow = useCallback(async () => {
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
  }, [])

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <PageHeader heading="Settings" caption="Application preferences" />

      <section className="max-w-2xl space-y-[14px] p-[14px]">
        <SettingsPanel title="Driver Identity">
          <div className="flex flex-col gap-[6px]">
            <FieldLabel>Driver name</FieldLabel>
            <Input
              type="text"
              value={settings.driverName ?? ''}
              onChange={event => setSettings(previous => ({ ...previous, driverName: event.target.value }))}
              onBlur={event => applyProfile({ driverName: event.target.value.trim() })}
              placeholder="Your Name"
              className="h-8 rounded-control"
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <FieldLabel>Driver number</FieldLabel>
            <Input
              type="text"
              value={settings.driverNumber ?? ''}
              onChange={event => setSettings(previous => ({ ...previous, driverNumber: event.target.value }))}
              onBlur={event => applyProfile({ driverNumber: event.target.value.trim() })}
              placeholder="#22"
              className="h-8 rounded-control"
            />
          </div>
        </SettingsPanel>

        <SettingsPanel title="Update Channel">
          <p className="font-inter text-[11px] text-[var(--muted)]">
            Stable builds by default. Pre-release gets alpha and beta builds ahead of stable releases.
          </p>
          <div className="flex gap-[8px]">
            {(['stable', 'pre-release'] as const).map(channel => (
              <button
                key={channel}
                onClick={() => handleChannelChange(channel)}
                className={cn(
                  'flex h-8 items-center gap-[8px] rounded-control border px-[10px] font-inter text-[12px] font-bold transition-colors',
                  settings.updateChannel === channel
                    ? 'border-[var(--orange)] bg-[var(--orange-tint)] text-[var(--orange)]'
                    : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:border-[var(--border-2)]',
                )}
              >
                {settings.updateChannel === channel && <IconCheck size={11} />}
                {channel === 'pre-release' ? 'Pre-release' : 'Stable'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-[10px]">
            <Button variant="outline" size="sm" onClick={checkNow} disabled={checkState === 'checking'} className="h-8 gap-2 font-saira text-[11px]">
              {checkState === 'checking' ? <IconLoader2 size={12} className="animate-spin" /> : <IconRefresh size={12} />}
              Check now
            </Button>
            {checkState === 'up-to-date' && <Badge variant="success">Up to date</Badge>}
            {checkState === 'update-found' && foundRelease && (
              <span className="font-saira text-[12px] tabular-nums text-[var(--orange)]">v{foundRelease.version} available</span>
            )}
          </div>
        </SettingsPanel>

        <SettingsPanel title="About">
          <div className="flex items-center justify-between">
            <span className="font-inter text-[11px] text-[var(--muted)]">Version</span>
            <span className="font-saira text-[12px] tabular-nums text-[var(--text)]">v{version}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-inter text-[11px] text-[var(--muted)]">Channel</span>
            <Badge variant={buildChannel === 'dev' ? 'warning' : buildChannel === 'alpha' ? 'active' : buildChannel === 'beta' ? 'neutral' : 'connected'}>
              {buildChannel.toUpperCase()}
            </Badge>
          </div>
        </SettingsPanel>
      </section>

      <ConfirmDialog
        open={pendingChannel !== null}
        title="Switch to Pre-release?"
        message="Pre-release builds may be unstable and contain bugs. Only use them if you are comfortable testing early features."
        confirmLabel="Switch to Pre-release"
        cancelLabel="Keep Stable"
        onConfirm={confirmPrerelease}
        onCancel={() => setPendingChannel(null)}
      />
    </div>
  )
}
