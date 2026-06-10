export const windowControlsRailClassName =
  'flex h-full items-stretch [--wails-draggable:nodrag]'

export const windowControlButtonBaseClassName =
  'flex h-full w-10 items-center justify-center self-stretch text-[var(--muted)] transition-colors focus:outline-none'

export const windowControlMinimiseButtonClassName =
  `${windowControlButtonBaseClassName} hover:bg-[var(--panel-2)] hover:text-white focus-visible:bg-[var(--panel-2)] focus-visible:text-white`

export const windowControlMaximiseButtonClassName =
  `${windowControlButtonBaseClassName} hover:bg-[var(--panel-2)] hover:text-white focus-visible:bg-[var(--panel-2)] focus-visible:text-white`

export const windowControlCloseButtonClassName =
  `${windowControlButtonBaseClassName} hover:bg-[var(--red)] hover:text-white focus-visible:bg-[var(--red)] focus-visible:text-white`
