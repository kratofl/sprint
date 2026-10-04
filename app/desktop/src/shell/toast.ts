export type ToastTone = 'info' | 'danger'

export type ToastAction = { label: string; onClick: () => void }

export type Toast = {
  id: string
  tone: ToastTone
  title: string
  message: string
  action?: ToastAction
}

export type ToastInput = Omit<Toast, 'id'>
