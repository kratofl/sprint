import type { ApiResult } from './api/request.ts'

// Field rules and save results for the settings page. The API enforces the
// same limits; checking them here lets a field explain itself on blur.

// What a settings form shows after a submit, for React's useActionState.
// `at` is when the save landed, so the confirmation replays on every save.
export type SaveState = { kind: 'idle' } | { kind: 'saved'; at: number } | { kind: 'failed'; message: string }

// A save attempt's result: a SaveState, or a session the API no longer accepts
// (the Server Action then sends the user through /sign-out).
export type SaveOutcome = Exclude<SaveState, { kind: 'idle' }> | { kind: 'signed-out' }

export const idle: SaveState = { kind: 'idle' }

// Display names are 1–40 characters once trimmed.
export function displayNameError(name: string): string | null {
  return lengthError(name, 40, 'Enter a display name.')
}

// New passwords need at least 8 characters.
export function newPasswordError(password: string): string | null {
  return password.length < 8 ? 'Use at least 8 characters.' : null
}

// The confirmation must repeat the new password exactly.
export function confirmPasswordError(password: string, confirmation: string): string | null {
  return password === confirmation ? null : 'The passwords don’t match.'
}

// Server (instance) names are 1–60 characters once trimmed.
export function instanceNameError(name: string): string | null {
  return lengthError(name, 60, 'Enter a name for this server.')
}

// Turns the API's answer to a settings mutation into what the form shows.
// `now` is epoch milliseconds.
export function saveOutcome(result: ApiResult<unknown>, now: number): SaveOutcome {
  switch (result.kind) {
    case 'data':
      return { kind: 'saved', at: now }
    case 'error':
      return { kind: 'failed', message: result.message }
    case 'network':
      return { kind: 'failed', message: 'Can’t reach the Sprint API. Try again in a moment.' }
    case 'unauthenticated':
      return { kind: 'signed-out' }
  }
}

function lengthError(value: string, max: number, empty: string): string | null {
  const length = value.trim().length
  if (length === 0) return empty
  return length > max ? `Use ${max} characters or fewer.` : null
}
