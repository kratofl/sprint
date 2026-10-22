'use client'

import { useActionState, useState } from 'react'
import Image from 'next/image'
import sprintMark from '@/app/icon.svg'
import Backdrop from '@/components/Backdrop'
import type { ServerSettings } from '@/lib/records'
import { register, signIn } from '@/lib/server/actions'

type Mode = 'sign-in' | 'register'

const COPY = {
  'sign-in': {
    title: (server: string) => `Sign in to ${server}`,
    submit: 'Sign in',
    pending: 'Signing in…',
    password: 'current-password',
    prompt: 'New to Sprint?',
    switchTo: 'Create an account',
  },
  register: {
    title: (server: string) => `Create your ${server} account`,
    submit: 'Create account',
    pending: 'Creating account…',
    password: 'new-password',
    prompt: 'Already have an account?',
    switchTo: 'Sign in',
  },
} as const

// Sign in and register on one page: the same two fields, and a text button to
// switch between them — or, when the server takes no new accounts, a note
// saying so. `next` is passed through to the Server Action.
export default function SignIn({ next, server }: { next: string; server: ServerSettings }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const copy = COPY[mode]

  return (
    <main className="auth-page">
      <Backdrop tone="vivid" />
      <div className="auth-panel">
        <section className="card auth-card" aria-labelledby="auth-title">
          <Image className="auth-mark" src={sprintMark} alt="" width={64} height={64} priority />
          <h1 id="auth-title" className="auth-title">
            {copy.title(server.instanceName)}
          </h1>
          {/* Keyed so switching modes starts a fresh form without the other mode's error. */}
          <AuthForm key={mode} mode={mode} next={next} />
          {server.allowRegistration ? (
            <p className="auth-switch">
              {copy.prompt}{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => setMode(mode === 'sign-in' ? 'register' : 'sign-in')}
              >
                {copy.switchTo}
              </button>
            </p>
          ) : (
            <p className="auth-switch">New accounts are closed on this server. Ask its admin for one.</p>
          )}
        </section>
      </div>
    </main>
  )
}

// The email + password form for one mode. Shows the API's error inline and
// keeps the email after a failed attempt (React resets the form).
function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const [state, action, isPending] = useActionState(mode === 'sign-in' ? signIn : register, null)
  const copy = COPY[mode]

  return (
    <form className="auth-form" action={action}>
      <input type="hidden" name="next" value={next} />
      <label className="field">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          autoFocus
          defaultValue={state?.email}
        />
      </label>
      <label className="field">
        Password
        <input name="password" type="password" autoComplete={copy.password} required />
      </label>
      {state !== null && (
        <div role="alert" className="alert">
          {state.error}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? copy.pending : copy.submit}
      </button>
    </form>
  )
}
