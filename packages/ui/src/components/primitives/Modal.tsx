import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"

export type ModalProps = React.ComponentProps<typeof Dialog> & {
  title: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  contentProps?: Omit<React.ComponentProps<typeof DialogContent>, "children">
}

function Modal({
  title,
  description,
  footer,
  children,
  contentProps,
  ...props
}: ModalProps) {
  return (
    <Dialog {...props}>
      <DialogContent {...contentProps}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

export { Modal }
