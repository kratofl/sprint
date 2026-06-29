import { useState } from 'react'
import { IconCopy, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sprint/ui'
import type { DashTheme, ThemePreset } from '@/lib/dash'
import { rgbaToHex } from '@/lib/color'

// Representative palette keys shown as a swatch strip on each theme card.
const SWATCH_KEYS: (keyof DashTheme)[] = ['primary', 'accent', 'success', 'warning', 'danger', 'fg', 'surface', 'bg']

interface ThemeManagerProps {
  themes: ThemePreset[]
  onCreate: () => void
  onDuplicate: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

function ThemeCard({
  theme,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  theme: ThemePreset
  onDuplicate: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3 rounded-card border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-[var(--text)]">{theme.name}</span>
        <Badge variant={theme.builtIn ? 'active' : 'tertiary'} className="flex-shrink-0">
          {theme.builtIn ? 'Built-in' : 'Custom'}
        </Badge>
      </div>

      <div className="flex items-center gap-1">
        {SWATCH_KEYS.map(key => (
          <span
            key={key}
            className="h-5 flex-1 rounded-[4px] border border-black/30"
            style={{ backgroundColor: rgbaToHex(theme.theme[key]) }}
            title={key}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-[var(--line)] pt-2">
        <TooltipProvider>
          {!theme.builtIn && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="neutral" onClick={() => onEdit(theme.id)}>
                  <span className="sr-only">Edit theme {theme.name}</span>
                  <IconPencil size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit theme</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-xs" variant="neutral" onClick={() => onDuplicate(theme.id)}>
                <span className="sr-only">Duplicate theme {theme.name}</span>
                <IconCopy size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="icon-xs"
                  variant="destructive"
                  disabled={theme.builtIn}
                  className="disabled:pointer-events-none disabled:opacity-30"
                  onClick={() => { if (!theme.builtIn) setConfirmOpen(true) }}
                >
                  <span className="sr-only">Delete theme {theme.name}</span>
                  <IconTrash size={12} />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {theme.builtIn ? 'Built-in themes cannot be deleted' : 'Delete theme'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete theme?"
        message={`The "${theme.name}" theme will be permanently deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => { setConfirmOpen(false); onDelete(theme.id) }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

export function ThemeManager({ themes, onCreate, onDuplicate, onEdit, onDelete }: ThemeManagerProps) {
  return (
    <div className="border-b border-border px-6 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="ui-label text-[11px] font-semibold text-[var(--text2)]">Themes</p>
          <p className="font-sans tabular-nums text-[9px] leading-relaxed text-[var(--text2)]">
            Predefined and custom palettes. Pick one per dashboard in its editor — editing a theme updates every dashboard using it.
          </p>
        </div>
        <Button size="sm" variant="primary" className="flex-shrink-0" onClick={onCreate}>
          <IconPlus size={14} className="mr-1" />
          New theme
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {themes.map(theme => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
