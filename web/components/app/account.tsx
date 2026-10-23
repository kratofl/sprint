import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { AccountSummary } from '@/lib/records'
import { initials } from '@/lib/viewer'

/** Another account's avatar: their Discord picture when they have one, else initials. */
export function AccountAvatar({ account, size = 'default' }: { account: AccountSummary; size?: 'sm' | 'default' | 'lg' }) {
  return (
    <Avatar size={size}>
      {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
      <AvatarFallback>{initials(account.displayName)}</AvatarFallback>
    </Avatar>
  )
}
