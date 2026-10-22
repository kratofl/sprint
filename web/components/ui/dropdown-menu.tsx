'use client'

import type { ComponentProps } from 'react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { IconCheck, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// The context menu: frosted glass, 4px padding, radius-lg (concentric with radius-sm
// items), 26px items in footnote 500, the highlighted item in brand-500 with on-brand
// text, shortcuts right in label-secondary, destructive last after a separator.
// Below lg the items grow to 48px pills in a 24px-radius menu. The select list
// reuses these classes so every menu looks the same.

export const menuContentClass =
  'glass z-50 min-w-[200px] overflow-x-hidden overflow-y-auto rounded-lg p-1 text-label duration-(--motion) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-lg:rounded-[24px] max-lg:p-1.5'

export const menuItemClass =
  'group/menu-item relative flex h-[26px] cursor-default items-center gap-2 rounded-sm px-2 text-footnote font-medium outline-hidden select-none data-highlighted:bg-brand-500 data-highlighted:text-on-brand data-disabled:pointer-events-none data-disabled:text-label-disabled max-lg:h-12 max-lg:rounded-full max-lg:px-4 max-lg:text-callout [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-2 [&_svg:not([class*="size-"])]:size-3.5 max-lg:[&_svg:not([class*="size-"])]:size-4'

function DropdownMenu(props: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          menuContentClass,
          'max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup(props: ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: 'default' | 'destructive' }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        menuItemClass,
        'data-[variant=destructive]:font-semibold data-[variant=destructive]:text-danger-text data-[variant=destructive]:data-highlighted:text-on-brand',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({ className, children, checked, ...props }: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(menuItemClass, 'pr-8', className)}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute right-2.5 flex items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <IconCheck />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup(props: ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" className={cn(menuItemClass, 'pr-8', className)} {...props}>
      <span className="pointer-events-none absolute right-2.5 flex items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <IconCheck />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('truncate px-2.5 py-1.5 text-caption text-label-secondary', className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('mx-2 my-1 h-px bg-separator', className)} {...props} />
}

function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('ml-auto text-caption font-normal text-label-secondary group-data-highlighted/menu-item:text-on-brand/75', className)}
      {...props}
    />
  )
}

function DropdownMenuSub(props: ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger data-slot="dropdown-menu-sub-trigger" className={cn(menuItemClass, 'data-open:bg-fill', className)} {...props}>
      {children}
      <IconChevronRight className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(menuContentClass, 'origin-(--radix-dropdown-menu-content-transform-origin)', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
