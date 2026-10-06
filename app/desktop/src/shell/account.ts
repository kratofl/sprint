import type { Account } from '../bridge'

/**
 * Avatar initials for the navigation pane's account row: first letters of the
 * first and last word ("Alex Morgan" → "AM"), or one letter for a single word.
 */
export const initialsFor = (name: string): string => {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0)
  const first = words[0]
  const last = words.length > 1 ? words[words.length - 1] : undefined
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase()
}

/** How the account row names a signed-in account: its display name, or its email until one is set. */
export const accountName = (account: Extract<Account, { signedIn: true }>): string => account.displayName.trim() || account.email
