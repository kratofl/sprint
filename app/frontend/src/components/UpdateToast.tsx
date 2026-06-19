import { IconDownload, IconX, IconLoader2 } from '@tabler/icons-react'
import { Button, Badge, cn } from '@sprint/ui'
import type { ReleaseInfo } from '@sprint/types'

interface UpdateToastProps {
  releaseInfo: ReleaseInfo | null
  installing: boolean
  onInstall: () => void
  onDismiss: () => void
}

export default function UpdateToast({ releaseInfo, installing, onInstall, onDismiss }: UpdateToastProps) {
  if (!releaseInfo) return null

  return (
    <div
      className={cn(
        'fixed bottom-8 right-6 z-50 w-72 rounded-alert border border-[var(--line)] bg-[var(--panel)] p-[10px]',
        'flex flex-col gap-[10px]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-sans text-[13px] font-bold text-[var(--text)]">
              Update available
            </span>
            {releaseInfo.isPrerelease && (
              <Badge variant="warning" className="text-[9px]">Pre</Badge>
            )}
          </div>
          <span className="font-sans text-[12px] tabular-nums text-[var(--muted)]">
            v{releaseInfo.version}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onDismiss} className="mt-0.5" aria-label="Dismiss">
          <IconX size={14} />
        </Button>
      </div>

      <Button
        variant="active"
        size="sm"
        className="h-8 w-full gap-2 rounded-control font-sans text-[11px]"
        onClick={onInstall}
        disabled={installing}
      >
        {installing ? (
          <>
            <IconLoader2 size={13} className="animate-spin" />
            Downloading…
          </>
        ) : (
          <>
            <IconDownload size={13} />
            Install now
          </>
        )}
      </Button>
    </div>
  )
}
