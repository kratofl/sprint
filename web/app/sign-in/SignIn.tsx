'use client'

import { useActionState, useState } from 'react'
import Image from 'next/image'
import { IconBrandDiscordFilled } from '@tabler/icons-react'
import sprintMark from '@/app/icon.svg'
import Backdrop from '@/components/Backdrop'
import type { ServerSettings } from '@/lib/records'
import { register, signIn } from '@/lib/server/actions'

type Mode = 'sign-in' | 'register'

const COPY = {
  'sign-in': {
    title: (server: string) => `Sign in to ${server}`,
    submit: 'Sign in',
    submitEmail: 'Sign in with email',
    pending: 'Signing in…',
    password: 'current-password',
    prompt: 'New to Sprint?',
    switchTo: 'Create an account',
  },
  register: {
    title: (server: string) => `Create your ${server} account`,
    submit: 'Create account',
    submitEmail: 'Create account with email',
    pending: 'Creating account…',
    password: 'new-password',
    prompt: 'Already have an account?',
    switchTo: 'Sign in',
  },
} as const

// Sign in and register on one page: the same two fields, and a text button to
// switch between them — or, when the server takes no new accounts, a note
// saying so. When the server offers Discord sign-in, "Continue with Discord" leads
// as the primary action and the email form below it turns secondary. `next` is
// passed through to the Server Action and to /auth/discord; `error` is a failed
// Discord sign-in's reason.
export default function SignIn({ next, error, server }: { next: string; error: string | null; server: ServerSettings }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const copy = COPY[mode]
  const discord = server.discordSignIn

  return (
    <main className="auth-page">
      <Backdrop tone="vivid" />
      <div className="auth-panel">
        <section className="card auth-card" aria-labelledby="auth-title">
          <Image className="auth-mark" src={sprintMark} alt="" width={64} height={64} priority />
          <h1 id="auth-title" className="auth-title">
            {copy.title(server.instanceName)}
          </h1>
          {error !== null && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {discord && (
            <>
              <a className="btn btn-primary auth-discord" href={`/auth/discord?next=${encodeURIComponent(next)}`}>
                <IconBrandDiscordFilled aria-hidden />
                Continue with Discord
              </a>
              <p className="auth-divider">or with email</p>
            </>
          )}
          {/* Keyed so switching modes starts a fresh form without the other mode's error. */}
          <AuthForm key={mode} mode={mode} next={next} secondary={discord} />
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
// keeps the email after a failed attempt (React resets the form). `secondary`
// when Discord leads: the submit button steps back and the email field does not
// take focus.
function AuthForm({ mode, next, secondary }: { mode: Mode; next: string; secondary: boolean }) {
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
          autoFocus={!secondary}
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
      <button type="submit" className={secondary ? 'btn btn-secondary' : 'btn btn-primary'} disabled={isPending}>
        {isPending ? copy.pending : secondary ? copy.submitEmail : copy.submit}
      </button>
    </form>
  )
}
