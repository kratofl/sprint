import { useState, useEffect } from 'react'
import { Badge, Button, PageHeader, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@sprint/ui'
import { type LayoutMeta, dashAPI } from '@/lib/dash'
import { ConfirmDialog } from './ConfirmDialog'

interface DashListProps {
  layouts: LayoutMeta[]
  onEdit: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => Promise<void>
  onSetDefault: (id: string) => Promise<void>
  onOpenGlobalSettings: () => void
}

function DashRow({
  layout,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  layout: LayoutMeta
  onEdit: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onSetDefault: (id: string) => Promise<void>
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isBuiltIn = layout.id === 'default'

  useEffect(() => {
    if (!layout.previewAvailable) return
    let cancelled = false
    dashAPI.getPreview(layout.id)
      .then(data => { if (!cancelled) setPreview(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [layout.id, layout.previewAvailable])

  return (
    <>
      <div className={cn(
        'flex items-center gap-4 border-b border-border px-6 py-3 transition-colors hover:bg-white/[0.02]',
        layout.default && 'bg-white/[0.015]',
      )}>
        {/* Preview thumbnail */}
        <div className="w-20 h-12 flex-shrink-0 overflow-hidden bg-[#111] border border-border flex items-center justify-center">
          {preview
            ? <img src={`data:image/png;base64,${preview}`} className="w-full h-full object-cover" alt={layout.name} />
            : <span className="font-mono text-base text-white/20">{layout.name.slice(0, 2).toUpperCase()}</span>
          }
        </div>

        {/* Name + info */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate">{layout.name}</span>
            {layout.default && (
              <Badge variant="active" className="terminal-header text-[9px] flex-shrink-0">DEFAULT</Badge>
            )}
          </div>
          <span className="font-mono text-[10px] text-text-muted">
            {layout.gridCols}×{layout.gridRows} grid · {layout.pageCount} page{layout.pageCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Action buttons with icons */}
        <TooltipProvider>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="xs" variant="primary" onClick={() => onEdit(layout.id)}>
                  <span className="sr-only">Edit {layout.name}</span>
                  <EditIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit layout</TooltipContent>
            </Tooltip>

            {!layout.default && (
              <Tooltip>
                <TooltipTrigger asChild>
                    <Button size="xs" variant="neutral" onClick={() => void onSetDefault(layout.id)}>
                      <span className="sr-only">Set {layout.name} as default</span>
                      <StarIcon />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Set as default</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={isBuiltIn}
                      className="text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:pointer-events-none"
                      onClick={() => { if (!isBuiltIn) setConfirmOpen(true) }}
                    >
                      <span className="sr-only">Delete {layout.name}</span>
                      <TrashIcon />
                    </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {isBuiltIn ? 'Cannot delete the built-in default layout' : 'Delete layout'}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete layout?"
        message={`"${layout.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => { setConfirmOpen(false); void onDelete(layout.id) }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}

export function DashList({ layouts, onEdit, onCreate, onDelete, onSetDefault, onOpenGlobalSettings }: DashListProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        heading="DASH_STUDIO"
        caption="Manage saved layouts and device-ready dash presets"
        actions={(
          <>
          <Button variant="neutral" size="sm" onClick={onOpenGlobalSettings} className="terminal-header font-bold">
            GLOBAL SETTINGS
          </Button>
          <Button variant="primary" size="sm" onClick={onCreate} className="terminal-header font-bold">
            + NEW DASH
          </Button>
          </>
        )}
      />
      {layouts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center font-mono text-[10px] text-text-muted">
          NO_LAYOUTS — create your first dash
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {layouts.map(layout => (
            <DashRow
              key={layout.id}
              layout={layout}
              onEdit={onEdit}
              onDelete={onDelete}
              onSetDefault={onSetDefault}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 1.5 10.5 3.5 4 10H2v-2l6.5-6.5z" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="6,1 7.5,4.5 11,5 8.5,7.5 9,11 6,9.5 3,11 3.5,7.5 1,5 4.5,4.5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h8M5 3V2h2v1M4 3v6.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V3" />
      <line x1="5" y1="5.5" x2="5" y2="8" />
      <line x1="7" y1="5.5" x2="7" y2="8" />
    </svg>
  )
}
