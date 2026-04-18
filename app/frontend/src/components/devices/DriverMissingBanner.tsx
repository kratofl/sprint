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
    <div className="mx-4 mt-4 flex flex-col gap-2 border border-warning/40 bg-warning/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <IconAlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-warning">
            DRIVER_NOT_INSTALLED
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-text-muted">
            The WinUSB driver is not bound to this {driverType.toUpperCase()} device.
            Click <span className="text-foreground">Install Driver</span> to install it automatically
            (requires administrator approval).
          </p>
          {installError ? (
            <p className="mt-1 font-mono text-[9px] text-destructive">{installError}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="font-mono text-[9px] text-text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/80"
          onClick={onDismiss}
          aria-label="Dismiss driver warning"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-6 border-warning/40 px-3 font-mono text-[9px] text-warning hover:bg-warning/10 disabled:opacity-50"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? (
            <span className="flex items-center gap-1">
              <IconLoader2 className="size-3 animate-spin" />
              INSTALLING…
            </span>
          ) : (
            'INSTALL_DRIVER'
          )}
        </Button>
        <span className="font-mono text-[8px] text-text-disabled">
          Alternatively, use Zadig or Ref&apos;s VOCOREScreenSetup
        </span>
      </div>
    </div>
  )
}
