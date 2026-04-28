const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const DEFAULT_ID_LENGTH = 8

function createNanoId(length = DEFAULT_ID_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let id = ''
  for (const value of bytes) {
    id += ID_ALPHABET[value % ID_ALPHABET.length]
  }
  return id
}

function createPrefixedId(prefix: string): string {
  return `${prefix}_${createNanoId()}`
}

export function createDashWidgetId(): string {
  return createPrefixedId('widget')
}

export function createDashPageId(): string {
  return createPrefixedId('page')
}

export function createDashMfwId(): string {
  return createPrefixedId('mfw')
}

export function createDashLayerId(): string {
  return createPrefixedId('layer')
}
