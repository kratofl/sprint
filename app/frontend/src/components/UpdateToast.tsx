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
        'fixed bottom-8 right-6 z-50 w-72 surface-elevated rounded border border-border',
        'flex flex-col gap-3 p-4 shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="terminal-header text-[11px] font-bold text-foreground">
              UPDATE_AVAILABLE
            </span>
            {releaseInfo.isPrerelease && (
              <Badge variant="warning" className="text-[9px]">PRE</Badge>
            )}
          </div>
          <span className="font-mono text-[10px] text-text-muted">
            v{releaseInfo.version}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-text-muted hover:text-foreground transition-colors mt-0.5"
          aria-label="Dismiss"
        >
          <IconX size={14} />
        </button>
      </div>

      <Button
        variant="active"
        size="sm"
        className="w-full gap-2 font-mono text-[10px]"
        onClick={onInstall}
        disabled={installing}
      >
        {installing ? (
          <>
            <IconLoader2 size={13} className="animate-spin" />
            DOWNLOADING…
          </>
        ) : (
          <>
            <IconDownload size={13} />
            INSTALL_NOW
          </>
        )}
      </Button>
    </div>
  )
}
