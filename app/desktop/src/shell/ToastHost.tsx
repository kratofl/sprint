import { AlertTriangle, X } from 'lucide-react'
import sprintMark from '../assets/sprint-mark.svg'
import type { Toast } from './toast'

// Shell-level toasts in the Windows notification look: an acrylic 340px card
// stacked bottom-right with the app mark, a title, a body line and, when the
// toast carries an action, an accent + "Dismiss" button pair. Enter/exit are
// the only animation (finite 160ms fade+slide); nothing loops.
export function ToastHost({
  toasts,
  leaving,
  onDismiss,
}: {
  toasts: Toast[]
  leaving: ReadonlySet<string>
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-host" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={leaving.has(toast.id) ? `toast tone-${toast.tone} leaving` : `toast tone-${toast.tone}`} role="status">
          <div className="toast-head">
            <img className="toast-mark" src={sprintMark} alt="" aria-hidden="true" />
            <span className="toast-app">Sprint</span>
            <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
              <X size={12} strokeWidth={1.6} />
            </button>
          </div>
          <div className="toast-body">
            <p className="toast-title">
              {toast.tone === 'danger' ? <AlertTriangle size={14} strokeWidth={1.8} aria-label="Error" /> : null}
              {toast.title}
            </p>
            <p className="toast-message">{toast.message}</p>
          </div>
          {toast.action ? (
            <div className="toast-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  onDismiss(toast.id)
                  toast.action?.onClick()
                }}
              >
                {toast.action.label}
              </button>
              <button type="button" className="button" onClick={() => onDismiss(toast.id)}>
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
