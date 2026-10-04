// Toolbar search starts filtering at two characters (DESIGN.md → SearchField).
export const MIN_QUERY_LENGTH = 2

// Whether a query is long enough to filter at all.
export function isActiveQuery(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH
}

// Case-insensitive substring match of a query against a row's text fields.
// Queries below the minimum length match every row.
export function matchesQuery(fields: readonly string[], query: string): boolean {
  if (!isActiveQuery(query)) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => field.toLowerCase().includes(needle))
}
