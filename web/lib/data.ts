import type { SessionSummary, SetupSummary } from '@/lib/gql/generated'

// The records the web pages render. The web app has no GraphQL client yet
// (`sessions` / `setups` need an authenticated query), so these are empty and
// every page shows its empty state. Wire the queries here; pages read only
// from this module and need no changes.
export const sessions: readonly SessionSummary[] = []
export const setups: readonly SetupSummary[] = []
