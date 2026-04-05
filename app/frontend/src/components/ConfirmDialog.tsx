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
      <div className="relative surface-elevated rounded border border-border p-6 max-w-sm w-full mx-4 shadow-2xl">
        <p className="font-bold text-sm mb-1">{title}</p>
        <p className="text-sm text-text-muted mb-5">{message}</p>
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
