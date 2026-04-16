import { Button } from '@sprint/ui'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'destructive' | 'neutral'
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, variant = 'destructive',
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative mx-4 w-full max-w-sm border border-border p-6 shadow-2xl surface-elevated"
      >
        <p id="confirm-dialog-title" className="mb-1 text-sm font-bold">{title}</p>
        <p className="mb-5 text-sm text-text-muted">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="neutral" size="sm" onClick={onCancel}>{cancelLabel}</Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
