import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button, cn } from '@sprint/ui'

interface EditorEdgeHandleProps {
  side: 'left' | 'right'
  label: string
  onClick: () => void
}

export function EditorEdgeHandle({ side, label, onClick }: EditorEdgeHandleProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      data-slot="editor-edge-handle"
      data-side={side}
      onClick={onClick}
      title={label}
      aria-label={`Open ${label.toLowerCase()} panel`}
      className={cn(
        'group absolute top-1/2 z-10 flex !h-14 !w-5 -translate-y-1/2 items-center justify-center px-0',
        'border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--orange)]',
        'hover:border-[var(--border-2)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]',
        side === 'left'
          ? 'left-0 rounded-r-[6px] border-l-0'
          : 'right-0 rounded-l-[6px] border-r-0',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-3 w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--orange)]',
          side === 'left' ? 'right-0' : 'left-0',
        )}
      />
      {side === 'left'
        ? <IconChevronRight size={10} aria-hidden="true" />
        : <IconChevronLeft size={10} aria-hidden="true" />}
      <span className="sr-only">{label}</span>
    </Button>
  )
}
