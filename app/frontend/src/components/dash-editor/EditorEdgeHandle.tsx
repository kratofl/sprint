import { cn } from '@sprint/ui'

interface EditorEdgeHandleProps {
  side: 'left' | 'right'
  label: string
  onClick: () => void
}

export function EditorEdgeHandle({ side, label, onClick }: EditorEdgeHandleProps) {
  return (
    <button
      type="button"
      data-slot="editor-edge-handle"
      data-side={side}
      onClick={onClick}
      title={label}
      aria-label={`Open ${label.toLowerCase()} panel`}
      className={cn(
        'group absolute top-1/2 z-10 flex h-14 w-5 -translate-y-1/2 items-center justify-center',
        'bg-bg-shell/95 text-text-muted backdrop-blur-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60',
        'hover:bg-bg-panel hover:text-foreground',
        side === 'left'
          ? 'left-0 rounded-r-sm border border-l-0 border-border'
          : 'right-0 rounded-l-sm border border-r-0 border-border',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-3 w-px bg-border transition-colors group-hover:bg-accent/60',
          side === 'left' ? 'right-0' : 'left-0',
        )}
      />
      <EdgeChevron side={side} />
      <span className="sr-only">{label}</span>
    </button>
  )
}

function EdgeChevron({ side }: { side: 'left' | 'right' }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {side === 'left'
        ? <path d="M3.5 2 6.5 5 3.5 8" />
        : <path d="M6.5 2 3.5 5 6.5 8" />}
    </svg>
  )
}
