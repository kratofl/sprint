import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'

// Everything Tab can land on inside the dialog, in DOM order.
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

const focusableIn = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)

/**
 * Fluent ContentDialog on a smoke layer (`.dialog-smoke > .content-dialog` in styles.css): the
 * title, the content, then a footer of buttons in Fluent order — the primary action first, Cancel
 * last. While it is open it owns the keyboard: Escape calls `onCancel` (unless an expanded
 * combobox inside has focus — that closes its own list first), Tab and Shift+Tab cycle
 * inside it, and on close focus returns to whatever had it before the dialog opened.
 *
 * Initial focus: put `autoFocus` on the control that should take it (Cancel, for a destructive
 * confirmation). Without one, the dialog itself takes focus and the first Tab enters it.
 *
 * `onSubmit` renders the dialog as a <form>, so Enter in a field submits it — the footer's
 * `type="submit"` button is the primary action. `closeOnSmokeClick` lets a click on the smoke
 * cancel too; Fluent dialogs normally ignore it, so a half-filled form is never lost by accident.
 */
export function ContentDialog({
  title,
  footer,
  onCancel,
  onSubmit,
  role = 'dialog',
  className,
  describedBy,
  closeOnSmokeClick = false,
  children,
}: {
  title: string
  footer: ReactNode
  onCancel: () => void
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  role?: 'dialog' | 'alertdialog'
  className?: string
  /** Id of the element that describes the dialog (a confirmation's message). */
  describedBy?: string
  closeOnSmokeClick?: boolean
  children?: ReactNode
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  const setDialog = useCallback((node: HTMLElement | null) => {
    dialogRef.current = node
  }, [])
  // Read once while the dialog first renders — before any `autoFocus` inside it moves focus.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  // A smoke click only cancels when the press also started on the smoke, not a drag out of a field.
  const pressedSmoke = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus()
    return () => {
      if (opener?.isConnected) opener.focus()
    }
  }, [opener])

  // Capture phase on window, so the dialog sees keys first and Escape never also reaches the
  // shell's own Escape handling (palette, notifications) underneath it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        // An open suggestion list inside the dialog takes Escape first (Fluent closes the
        // dropdown, not the dialog); its combobox handles the key itself.
        if (event.target instanceof Element && event.target.closest('[role="combobox"][aria-expanded="true"]')) return
        event.preventDefault()
        event.stopPropagation()
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = focusableIn(dialog)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const active = document.activeElement
      const inside = active instanceof Node && dialog.contains(active) && active !== dialog
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  const content = (
    <>
      <div className="content-dialog-body">
        <h2 id={titleId} className="content-dialog-title">
          {title}
        </h2>
        {children}
      </div>
      <div className="content-dialog-footer">{footer}</div>
    </>
  )
  const dialogProps = {
    ref: setDialog,
    className: className ? `content-dialog ${className}` : 'content-dialog',
    role,
    'aria-modal': true,
    'aria-labelledby': titleId,
    'aria-describedby': describedBy,
    tabIndex: -1,
  }

  return (
    <div
      className="dialog-smoke"
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        pressedSmoke.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (closeOnSmokeClick && pressedSmoke.current && event.target === event.currentTarget) onCancel()
      }}
    >
      {onSubmit ? (
        <form {...dialogProps} onSubmit={onSubmit}>
          {content}
        </form>
      ) : (
        <div {...dialogProps}>{content}</div>
      )}
    </div>
  )
}

/**
 * A ContentDialog that asks one question: `message` above the footer, then the confirm button
 * (accent, or solid red when `destructive`) left of Cancel. Focus starts on Cancel for a
 * destructive confirmation and on the confirm button otherwise, unless `initialFocus` says.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  initialFocus = destructive ? 'cancel' : 'confirm',
  className,
  closeOnSmokeClick,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  initialFocus?: 'confirm' | 'cancel'
  className?: string
  closeOnSmokeClick?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const messageId = useId()
  return (
    <ContentDialog
      title={title}
      role="alertdialog"
      describedBy={messageId}
      className={className}
      closeOnSmokeClick={closeOnSmokeClick}
      onCancel={onCancel}
      footer={
        <>
          <button type="button" className={destructive ? 'button destructive-solid' : 'button primary'} onClick={onConfirm} autoFocus={initialFocus === 'confirm'}>
            {confirmLabel}
          </button>
          <button type="button" className="button" onClick={onCancel} autoFocus={initialFocus === 'cancel'}>
            {cancelLabel}
          </button>
        </>
      }
    >
      <p id={messageId} className="content-dialog-text">
        {message}
      </p>
    </ContentDialog>
  )
}
