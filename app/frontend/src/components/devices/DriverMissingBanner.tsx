import { useState } from 'react'
import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react'
import { Button } from '@sprint/ui'
import { InstallScreenDriver } from '../../../wailsjs/go/main/App'
import { runDesktopCall } from '@/lib/wails'

interface DriverMissingBannerProps {
  driverType: string
  onDismiss: () => void
}

export function DriverMissingBanner({ driverType, onDismiss }: DriverMissingBannerProps) {
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  const handleInstall = async () => {
    setInstalling(true)
    setInstallError(null)
    try {
      await runDesktopCall('InstallScreenDriver', () => InstallScreenDriver(driverType))
    } catch (error) {
      setInstallError(String(error))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="mx-[10px] mt-[10px] flex gap-[10px] rounded-alert border border-[var(--amber-ring)] bg-[var(--amber-tint)] p-[10px] text-[var(--amber)]">
      <div className="flex flex-1 flex-col gap-[8px]">
      <div className="flex items-start gap-2">
        <IconAlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-[var(--amber)]" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[12px] font-bold text-[var(--amber)]">
            Driver not installed
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            The WinUSB driver is not bound to this {driverType.toUpperCase()} device.
            Click <span className="text-[var(--text)]">Install Driver</span> to install it automatically
            (requires administrator approval).
          </p>
          {installError ? (
            <p className="mt-1 font-sans text-[10px] text-[var(--red)]">{installError}</p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Dismiss driver warning">
          ✕
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-control border-[var(--amber-ring)] px-[10px] font-sans text-[11px] text-[var(--amber)] disabled:opacity-50"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? (
            <span className="flex items-center gap-1">
              <IconLoader2 className="size-3 animate-spin" />
              Installing…
            </span>
          ) : (
            'Install driver'
          )}
        </Button>
        <span className="font-sans text-[10px] text-[var(--muted-2)]">
          Alternatively, use Zadig or Ref&apos;s VOCOREScreenSetup
        </span>
      </div>
      </div>
    </div>
  )
}
