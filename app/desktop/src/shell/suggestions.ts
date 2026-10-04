/**
 * The values a suggest box lists for what has been typed: case-insensitive matches, values that
 * start with the text before ones that merely contain it, each group in the given order. Blank
 * text lists everything — the list is how the driver sees what is on offer.
 */
export function matchSuggestions(options: readonly string[], text: string): string[] {
  const query = text.trim().toLowerCase()
  if (query.length === 0) return [...options]
  const starts: string[] = []
  const contains: string[] = []
  for (const option of options) {
    const lower = option.toLowerCase()
    if (lower.startsWith(query)) starts.push(option)
    else if (lower.includes(query)) contains.push(option)
  }
  return [...starts, ...contains]
}
