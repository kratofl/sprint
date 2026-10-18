'use server'

import { refresh } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  AcceptEngineerInviteDocument,
  ChangePasswordDocument,
  CreateEngineerInviteDocument,
  ExcludeEngineerFromSessionDocument,
  IncludeEngineerInSessionDocument,
  LeaveDriverDocument,
  LoginDocument,
  RegisterDocument,
  RemoveEngineerDocument,
  RevokeEngineerInviteDocument,
  SetDisplayNameDocument,
  UpdateServerSettingsDocument,
  type Operation,
} from '../gql/operations'
import { safeNext, signInPath } from '../auth/route.ts'
import { authOutcome, servedOverHttps, sessionCookieName } from '../auth/session.ts'
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

// Server Actions behind the sign-in page, the sidebar, the settings page and the
// race-engineer views. Thin shells: the decisions live in lib/auth/,
// lib/settings.ts and the API, and are tested there. Arguments come from the
// browser, so the ones that are not FormData are checked to be strings here.

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
// `newPassword` and `confirmPassword`. Use with useActionState. An account that
// signs in with Discord and has no password yet sends no `currentPassword`; the
// API then sets the first one.
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

// Creates a single-use invite link for someone to become the signed-in driver's
// race engineer. The page refreshes and lists it.
export async function createEngineerInvite(): Promise<SaveState> {
  return save(CreateEngineerInviteDocument, {}, '/engineer')
}

// Withdraws one of the signed-in driver's unused invite links.
export async function revokeEngineerInvite(token: unknown): Promise<SaveState> {
  if (!isId(token)) return invalid
  return save(RevokeEngineerInviteDocument, { token }, '/engineer')
}

// Takes all access away from one of the signed-in driver's engineers, live
// streams included.
export async function removeEngineer(engineerId: unknown): Promise<SaveState> {
  if (!isId(engineerId)) return invalid
  return save(RemoveEngineerDocument, { engineerId }, '/engineer')
}

// Stops engineering for a driver.
export async function leaveDriver(driverId: unknown): Promise<SaveState> {
  if (!isId(driverId)) return invalid
  return save(LeaveDriverDocument, { driverId }, '/engineer')
}

// Hides one of the signed-in driver's sessions from one engineer ('exclude') or
// shows it to them again ('include'). Ends their live view of it at once.
export async function setSessionAccess(sessionId: unknown, engineerId: unknown, change: unknown): Promise<SaveState> {
  if (!isId(sessionId) || !isId(engineerId)) return invalid
  const here = `/sessions/${encodeURIComponent(sessionId)}`
  if (change === 'exclude') return save(ExcludeEngineerFromSessionDocument, { sessionId, engineerId }, here)
  if (change === 'include') return save(IncludeEngineerInSessionDocument, { sessionId, engineerId }, here)
  return invalid
}

// Accepts an invite link as the signed-in user and goes to the engineers page,
// which then lists the driver. Signed out, it goes to sign-in and back to the link.
export async function acceptEngineerInvite(token: unknown): Promise<SaveState> {
  if (!isId(token)) return invalid
  const here = `/engineer/invite/${encodeURIComponent(token)}`
  const outcome = await mutate(AcceptEngineerInviteDocument, { token }, here)
  if (outcome.kind === 'saved') redirect('/engineer')
  return outcome
}

// Runs one mutation as the signed-in user and refreshes the page on success.
// `here` is the page the action belongs to: a missing or rejected session
// leaves it for sign-in and comes back to it afterwards.
async function save<TData, TVariables>(operation: Operation<TData, TVariables>, variables: TVariables, here = '/settings'): Promise<SaveState> {
  const outcome = await mutate(operation, variables, here)
  if (outcome.kind === 'saved') refresh()
  return outcome
}

async function mutate<TData, TVariables>(operation: Operation<TData, TVariables>, variables: TVariables, here: string): Promise<SaveState> {
  const token = (await cookies()).get(sessionCookieName)?.value
  if (token === undefined) redirect(signInPath(here))
  const outcome = saveOutcome(await callApi(operation, variables, token), Date.now())
  if (outcome.kind === 'signed-out') redirect(`/sign-out?next=${encodeURIComponent(here)}`)
  return outcome
}

// What an action reports for arguments no page of this app sends.
const invalid: SaveState = { kind: 'failed', message: 'That request was not valid. Reload the page and try again.' }

// An id or token as the API hands them out: a short string without spaces.
function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w.~-]{1,200}$/.test(value)
}

// Login and Register share one shape (both alias their result to `session`).
async function authenticate(operation: typeof LoginDocument, form: FormData): Promise<AuthFormState> {
  const email = field(form, 'email')
  const request = await headers()
  const outcome = authOutcome(
    await callApi(operation, { input: { email, password: field(form, 'password') } }, null),
    { secure: servedOverHttps(request.get('x-forwarded-proto'), request.get('origin')), now: Date.now() },
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
