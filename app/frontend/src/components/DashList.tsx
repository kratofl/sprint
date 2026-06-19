import { useEffect, useState } from 'react'
import { IconPencil, IconPlus, IconStar, IconTrash } from '@tabler/icons-react'
import { Badge, Button, ConfirmDialog, PageHeader, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@sprint/ui'
import { type LayoutMeta, dashAPI } from '@/lib/dash'

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
      <div
        className="ds-dash-card cursor-pointer focus-visible:border-[var(--accent)] focus-visible:outline-none"
        role="button"
        tabIndex={0}
        aria-label={`Edit dashboard ${layout.name}`}
        onClick={openEditor}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openEditor()
          }
        }}
      >
        <div className="ds-dash-preview flex items-center justify-center">
          {preview ? (
            <img
              src={`data:image/png;base64,${preview}`}
              className="h-full w-full object-cover"
              alt={layout.name}
            />
          ) : (
            <span className="text-[22px] font-bold text-[var(--text3)]">
              {layout.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-bold text-[var(--text)]">{layout.name}</span>
              {layout.default && (
                <Badge variant="active" className="flex-shrink-0">Default</Badge>
              )}
            </div>
            <span className="text-[11px] tabular-nums text-[var(--text3)]">
              {layout.gridCols}x{layout.gridRows} grid · {layout.pageCount} page{layout.pageCount !== 1 ? 's' : ''}
            </span>
          </div>
          <Badge
            variant={isBuiltIn ? 'active' : layout.default ? 'success' : 'tertiary'}
          >
            {isBuiltIn ? 'System' : layout.default ? 'Basic' : 'Advanced'}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-[10px]">
          <span className="ui-label text-[9px]">Dash layout</span>
          <TooltipProvider>
            <div className="flex flex-shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-xs" variant="primary" onClick={(event) => { event.stopPropagation(); onEdit(layout.id) }}>
                    <span className="sr-only">Edit dashboard {layout.name}</span>
                    <IconPencil size={12} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit dashboard</TooltipContent>
              </Tooltip>

              {!layout.default && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon-xs" variant="neutral" onClick={(event) => { event.stopPropagation(); void onSetDefault(layout.id) }}>
                      <span className="sr-only">Set {layout.name} as default</span>
                      <IconStar size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Set as default</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="icon-xs"
                      variant="destructive"
                      disabled={isBuiltIn}
                      className="disabled:pointer-events-none disabled:opacity-30"
                      onClick={(event) => { event.stopPropagation(); if (!isBuiltIn) setConfirmOpen(true) }}
                    >
                      <span className="sr-only">Delete dashboard {layout.name}</span>
                      <IconTrash size={12} />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {isBuiltIn ? 'Cannot delete the built-in default dashboard' : 'Delete dashboard'}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete dashboard?"
        message={`The "${layout.name}" dashboard will be permanently deleted.`}
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
    <div className="ds-page">
      <PageHeader
        heading="Dashboards"
        caption="Manage saved dashboards and device-ready presets"
        actions={(
          <>
            <Button variant="neutral" size="sm" onClick={onOpenGlobalSettings}>
              Global settings
            </Button>
            <Button variant="primary" size="sm" onClick={onCreate}>
              Create dashboard
            </Button>
          </>
        )}
      />
      <div className="ds-dash-grid">
        {layouts.map(layout => (
          <DashRow
            key={layout.id}
            layout={layout}
            onEdit={onEdit}
            onDelete={onDelete}
            onSetDefault={onSetDefault}
          />
        ))}
        <button
          type="button"
          className="ds-dash-card ds-dash-create flex min-h-[260px] flex-col items-center justify-center gap-3 border-dashed border-[var(--accent)]/50 bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] text-center transition-colors hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] focus-visible:border-[var(--accent)] focus-visible:outline-none"
          onClick={onCreate}
          aria-label="Create dashboard"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent)]/50 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]">
            <IconPlus size={22} />
          </span>
          <span className="text-[13px] font-bold text-[var(--text)]">Create dashboard</span>
          <span className="max-w-[220px] text-[11px] text-[var(--text3)]">
            Start from the Graphite baseline and tune pages, alerts, and widgets.
          </span>
        </button>
      </div>
    </div>
  )
}
