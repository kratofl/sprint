import type { ReactNode } from 'react'
import type { Icon } from '@tabler/icons-react'
import { IconCloudOff } from '@tabler/icons-react'
import { IconTile } from '@/components/app/grouped'
import { cn } from '@/lib/utils'

type StateProps = {
  icon: Icon
  title: string
  body: ReactNode
  action?: ReactNode
  className?: string
}

/**
 * What a card shows when there is nothing in it yet: a brand-tinted icon tile, a
 * headline and one line saying how it fills up, centred in the card. Optional
 * action (a secondary button) below. For one-line notes in a list card use
 * SettingsEmpty.
 */
export function EmptyState({ icon, title, body, action, className }: StateProps) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center', className)}>
      <IconTile icon={icon} tone="brand" size={40} />
      <p className="mt-1 text-headline">{title}</p>
      <p className="max-w-72 text-footnote text-label-secondary">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/**
 * The same shape for a failure: a red-tinted tile, announced as an alert. Used when
 * a page's data could not be loaded (see Unavailable), deliberately unlike the
 * "nothing synced yet" empty state.
 */
export function ErrorState({ icon = IconCloudOff, title, body, action, className }: Omit<StateProps, 'icon'> & { icon?: Icon }) {
  return (
    <div role="alert" className={cn('flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center', className)}>
      <IconTile icon={icon} tone="red" size={40} />
      <p className="mt-1 text-headline">{title}</p>
      <p className="max-w-72 text-footnote text-label-secondary">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
