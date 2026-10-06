'use server'

import { refresh } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  ChangePasswordDocument,
  LoginDocument,
  RegisterDocument,
  SetDisplayNameDocument,
  UpdateServerSettingsDocument,
  type Operation,
} from '../gql/operations'
import { safeNext, signInPath } from '../auth/route.ts'
import { authOutcome, sessionCookieName } from '../auth/session.ts'
import type { AuthFormState } from '../records.ts'
import {
  confirmPasswordError,
  displayNameError,
  instanceNameError,
  newPasswordError,
  saveOutcome,
  type SaveState,
} from '../settings.ts'
import { callApi } from './api.ts'

// Server Actions behind the sign-in page, the sidebar and the settings page.
// Thin shells: the decisions live in lib/auth/ and lib/settings.ts and are
// tested there.

// Signs in with the form's `email` and `password`, then goes to its `next`
// path. Use with useActionState; returns the API's message on failure.
export async function signIn(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  return authenticate(LoginDocument, form)
}

// Creates an account with the form's `email` and `password` and signs it in,
// then goes to its `next` path. Use with useActionState, like signIn.
export async function register(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  return authenticate(RegisterDocument, form)
}

// Clears the session cookie and returns to the sign-in page.
export async function signOut(): Promise<void> {
  const jar = await cookies()
  jar.delete(sessionCookieName)
  redirect('/sign-in')
}

// Renames the signed-in user from the form's `displayName`. Use with
// useActionState; on success the page refreshes, so the sidebar shows the new name.
export async function saveDisplayName(_previous: SaveState, form: FormData): Promise<SaveState> {
  const displayName = field(form, 'displayName').trim()
  const problem = displayNameError(displayName)
  if (problem !== null) return { kind: 'failed', message: problem }
  return save(SetDisplayNameDocument, { displayName })
}

// Changes the signed-in user's password from the form's `currentPassword`,
// `newPassword` and `confirmPassword`. Use with useActionState.
export async function changePassword(_previous: SaveState, form: FormData): Promise<SaveState> {
  const newPassword = field(form, 'newPassword')
  const problem = newPasswordError(newPassword) ?? confirmPasswordError(newPassword, field(form, 'confirmPassword'))
  if (problem !== null) return { kind: 'failed', message: problem }
  return save(ChangePasswordDocument, { currentPassword: field(form, 'currentPassword'), newPassword })
}

// Saves the server's `instanceName` and `allowRegistration` ('true'/'false').
// Both travel together because the API takes both; the name form and the
// registration switch each send the other's current value. Admins only — the
// API refuses everyone else.
export async function saveServerSettings(_previous: SaveState, form: FormData): Promise<SaveState> {
  const instanceName = field(form, 'instanceName').trim()
  const problem = instanceNameError(instanceName)
  if (problem !== null) return { kind: 'failed', message: problem }
  const allowRegistration = field(form, 'allowRegistration') === 'true'
  return save(UpdateServerSettingsDocument, { input: { instanceName, allowRegistration } })
}

// Runs one settings mutation as the signed-in user and refreshes the page on
// success. A missing or rejected session leaves the page for sign-in.
async function save<TData, TVariables>(operation: Operation<TData, TVariables>, variables: TVariables): Promise<SaveState> {
  const token = (await cookies()).get(sessionCookieName)?.value
  if (token === undefined) redirect(signInPath('/settings'))
  const outcome = saveOutcome(await callApi(operation, variables, token), Date.now())
  if (outcome.kind === 'signed-out') redirect(`/sign-out?next=${encodeURIComponent('/settings')}`)
  if (outcome.kind === 'saved') refresh()
  return outcome
}

// Login and Register share one shape (both alias their result to `session`).
async function authenticate(operation: typeof LoginDocument, form: FormData): Promise<AuthFormState> {
  const email = field(form, 'email')
  const outcome = authOutcome(
    await callApi(operation, { input: { email, password: field(form, 'password') } }, null),
    { production: process.env.NODE_ENV === 'production', now: Date.now() },
  )
  if (outcome.kind === 'failed') return { error: outcome.message, email }
  const jar = await cookies()
  jar.set(outcome.cookie)
  redirect(safeNext(field(form, 'next')))
}

// A text field of the submitted form; '' when absent.
function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
