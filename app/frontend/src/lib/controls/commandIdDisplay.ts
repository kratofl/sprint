const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function compactUuidSegment(prefix: string, value: string): string {
  return `${prefix}_${value.slice(0, 8)}`
}

export function formatCommandIdForDisplay(commandId: string): string {
  const parts = commandId.split('.')
  if (parts.length === 0) return commandId

  return parts.map((part, index) => {
    if (!UUID_RE.test(part)) return part

    if (parts[0] === 'dash' && parts[1] === 'wrapper') {
      if (index === 2) return compactUuidSegment('lay', part)
      if (index === 3) return compactUuidSegment('page', part)
      if (index === 4) return compactUuidSegment('mfw', part)
      if (index === 5) return compactUuidSegment('layer', part)
    }

    return compactUuidSegment('id', part)
  }).join('.')
}
