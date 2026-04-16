import { useState, useEffect, useCallback } from 'react'
import { IconRefresh, IconLoader2, IconCheck } from '@tabler/icons-react'
import { Badge, Button, PageHeader, cn } from '@sprint/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { call } from '@/lib/wails'
import type { AppSettings, ReleaseInfo } from '@sprint/types'

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update-found'

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>({ updateChannel: 'stable' })
  const [pendingChannel, setPendingChannel] = useState<AppSettings['updateChannel'] | null>(null)
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [foundRelease, setFoundRelease] = useState<ReleaseInfo | null>(null)
  const [version, setVersion] = useState('dev')
  const [buildChannel, setBuildChannel] = useState('dev')

  useEffect(() => {
    call<AppSettings>('GetSettings').then(setSettings).catch(() => {})
    call<string>('GetVersion').then(setVersion).catch(() => {})
    call<string>('GetBuildChannel').then(setBuildChannel).catch(() => {})
  }, [])

  const handleChannelChange = useCallback((channel: AppSettings['updateChannel']) => {
    if (channel === settings.updateChannel) return
    if (channel === 'pre-release') {
      setPendingChannel(channel)
    } else {
      applyChannel(channel)
    }
  }, [settings.updateChannel])

  const applyChannel = useCallback((channel: AppSettings['updateChannel']) => {
    const next: AppSettings = { ...settings, updateChannel: channel }
    setSettings(next)
    call('SaveSettings', next).catch(() => {})
  }, [settings])

  const confirmPrerelease = useCallback(() => {
    if (pendingChannel) {
      applyChannel(pendingChannel)
      setPendingChannel(null)
    }
  }, [pendingChannel, applyChannel])

  const checkNow = useCallback(async () => {
    setCheckState('checking')
    setFoundRelease(null)
    try {
      const info = await call<ReleaseInfo | null>('CheckUpdate')
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
      <PageHeader
        heading="SETTINGS"
        caption="Application preferences"
      />

      <div className="flex flex-col gap-6 px-6 py-6 max-w-lg">
        <section className="flex flex-col gap-4">
          <h3 className="terminal-header text-[11px] font-bold tracking-[0.15em] text-text-muted">
            UPDATES
          </h3>

          <div className="surface rounded border border-border p-4 flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-bold text-foreground mb-1">Update channel</p>
              <p className="font-mono text-[9px] text-text-muted mb-3">
                Switch to pre-release to get alpha and beta builds ahead of stable releases.
              </p>
              <div className="flex gap-2">
                {(['stable', 'pre-release'] as const).map(ch => (
                  <button
                    key={ch}
                    onClick={() => handleChannelChange(ch)}
                    className={cn(
                      'flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-[10px] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80',
                      settings.updateChannel === ch
                        ? 'border-primary text-primary bg-accent/5'
                        : 'border-border text-text-muted hover:border-border-strong hover:text-foreground',
                    )}
                  >
                    {settings.updateChannel === ch && (
                      <IconCheck size={11} className="text-primary" />
                    )}
                    {ch.toUpperCase().replace('-', '_')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={checkNow}
                disabled={checkState === 'checking'}
                className="gap-2 font-mono text-[10px]"
              >
                {checkState === 'checking' ? (
                  <IconLoader2 size={12} className="animate-spin" />
                ) : (
                  <IconRefresh size={12} />
                )}
                CHECK_NOW
              </Button>
              {checkState === 'up-to-date' && (
                <span className="font-mono text-[10px] text-success">UP_TO_DATE</span>
              )}
              {checkState === 'update-found' && foundRelease && (
                <span className="font-mono text-[10px] text-primary">
                  v{foundRelease.version} available
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="terminal-header text-[11px] font-bold tracking-[0.15em] text-text-muted">
            ABOUT
          </h3>

          <div className="surface rounded border border-border p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-text-muted">VERSION</span>
              <span className="font-mono text-[10px] text-foreground">v{version}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-text-muted">CHANNEL</span>
              <Badge
                variant={
                  buildChannel === 'dev' ? 'warning' :
                  buildChannel === 'alpha' ? 'active' :
                  buildChannel === 'beta' ? 'neutral' : 'connected'
                }
                className="font-mono text-[9px]"
              >
                {buildChannel.toUpperCase()}
              </Badge>
            </div>
          </div>
        </section>
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
    </div>
  )
}
