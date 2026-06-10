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
  const openEditor = () => onEdit(layout.id)

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
        'flex cursor-pointer items-center gap-[14px] rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px] transition-colors hover:border-[var(--border-2)] hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--orange)]',
        layout.default && 'border-[var(--orange)]',
      )}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${layout.name}`}
        onClick={openEditor}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openEditor()
          }
        }}
      >
        {/* Preview thumbnail */}
        <div className="flex h-12 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg-deep)]">
          {preview
            ? <img src={`data:image/png;base64,${preview}`} className="w-full h-full object-cover" alt={layout.name} />
            : <span className="font-saira text-base text-[var(--muted-2)]">{layout.name.slice(0, 2).toUpperCase()}</span>
          }
        </div>

        {/* Name + info */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate">{layout.name}</span>
            {layout.default && (
              <Badge variant="active" className="ui-label text-[9px] flex-shrink-0">Default</Badge>
            )}
          </div>
          <span className="font-saira text-[12px] tabular-nums text-[var(--muted)]">
            {layout.gridCols}×{layout.gridRows} grid · {layout.pageCount} page{layout.pageCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Action buttons with icons */}
        <TooltipProvider>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="xs" variant="primary" onClick={(event) => { event.stopPropagation(); onEdit(layout.id) }}>
                  <span className="sr-only">Edit {layout.name}</span>
                  <EditIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit layout</TooltipContent>
            </Tooltip>

            {!layout.default && (
              <Tooltip>
                <TooltipTrigger asChild>
                    <Button size="xs" variant="neutral" onClick={(event) => { event.stopPropagation(); void onSetDefault(layout.id) }}>
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
                      variant="destructive"
                      disabled={isBuiltIn}
                      className="disabled:pointer-events-none disabled:opacity-30"
                      onClick={(event) => { event.stopPropagation(); if (!isBuiltIn) setConfirmOpen(true) }}
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
        heading="Dash Studio"
        caption="Manage saved layouts and device-ready dash presets"
        actions={(
          <>
          <Button variant="neutral" size="sm" onClick={onOpenGlobalSettings} className="ui-label font-bold">
            GLOBAL SETTINGS
          </Button>
          <Button variant="primary" size="sm" onClick={onCreate} className="ui-label font-bold">
            + NEW DASH
          </Button>
          </>
        )}
      />
      {layouts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center font-saira text-[12px] tabular-nums text-[var(--muted)]">
          NO_LAYOUTS — create your first dash
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-[10px] overflow-y-auto p-[14px]">
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
