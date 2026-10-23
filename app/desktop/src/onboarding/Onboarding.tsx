import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowLeft, Check, Cloud, HardDrive, Layers, Monitor, Server, X } from 'lucide-react'
import type { Account, CloudServerChoice, CloudState, CloudStorageMode, DiscordSignInResult, DiscoveredServer, ServerInfo, SignInResult, SprintCommand, SyncReport } from '../bridge'
import sprintMark from '../assets/sprint-mark.svg'
import { accountName } from '../shell/account'
import { back, begin, next } from './flow'
import type { Flow, FlowEvent, Step } from './flow'
import { localSummary, type LocalCounts } from './summary'
import './Onboarding.css'

type Actions = {
  send: (command: SprintCommand) => Promise<void>
  discover: () => Promise<DiscoveredServer[]>
  signIn: (serverUrl: string, email: string, password: string, createAccount: boolean) => Promise<SignInResult>
  signInWithDiscord: (serverUrl: string) => Promise<DiscordSignInResult>
  cancelDiscordSignIn: () => Promise<void>
  serverInfo: (serverUrl: string) => Promise<ServerInfo>
  upload: () => Promise<SyncReport>
}

type Reducer = { type: 'event'; event: FlowEvent } | { type: 'back' }

const reduce = (flow: Flow, action: Reducer): Flow => (action.type === 'back' ? back(flow) : next(flow, action.event))

/**
 * The Sprint web setup: a panel over the window that walks through one question at a time —
 * which server, where it is, the account, where data lives, and moving what is already here.
 * Shown on the first launch, and again from Settings or the sidebar's Sign in to connect later.
 * Steps slide in from the side they come from; nothing animates on its own.
 */
export function Onboarding({
  entry,
  cloud,
  account,
  counts,
  actions,
  onClose,
}: {
  entry: 'first-run' | 'connect'
  cloud: CloudState
  account: Account
  counts: LocalCounts
  actions: Actions
  onClose: () => void
}) {
  const [flow, dispatch] = useReducer(reduce, undefined, () => begin(entry, account.serverUrl))
  const emit = useCallback((event: FlowEvent) => dispatch({ type: 'event', event }), [])
  const step = flow.current
  const canGoBack = flow.history.length > 0 && step.step !== 'done' && step.step !== 'discover'

  // Remember the answer as soon as it is complete, so a sync started next uses the chosen storage.
  const configure = (server: CloudServerChoice, storage: CloudStorageMode) => actions.send({ type: 'cloud.configure', server, storage })

  return (
    <div className="onboarding-smoke" role="presentation">
      <section className="onboarding" role="dialog" aria-modal="true" aria-label="Set up Sprint web">
        <header className="onboarding-bar">
          {canGoBack ? (
            <button type="button" className="button subtle onboarding-back" onClick={() => dispatch({ type: 'back' })}>
              <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> Back
            </button>
          ) : (
            <span />
          )}
          <Progress step={step} />
          {entry === 'connect' && step.step !== 'done' ? (
            <button type="button" className="button subtle onboarding-close" aria-label="Close" onClick={onClose}>
              <X size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}
        </header>
        {/* Keyed per step so each one mounts fresh and plays its entrance once. */}
        <div key={stepKey(step)} className={`onboarding-step ${flow.direction}`}>
          <StepView step={step} cloud={cloud} account={account} counts={counts} actions={actions} emit={emit} configure={configure} onClose={onClose} />
        </div>
      </section>
    </div>
  )
}

const stepKey = (step: Step): string => (step.step === 'address' ? `address:${step.found.length}` : step.step)

const PROGRESS_STEPS: Step['step'][] = ['welcome', 'server', 'address', 'account', 'storage', 'transfer', 'done']

function Progress({ step }: { step: Step }) {
  const at = PROGRESS_STEPS.indexOf(step.step === 'discover' ? 'address' : step.step)
  return (
    <ol className="onboarding-progress" aria-hidden="true">
      {PROGRESS_STEPS.map((name, index) => (
        <li key={name} className={index < at ? 'done' : index === at ? 'current' : undefined} />
      ))}
    </ol>
  )
}

function StepView({
  step,
  cloud,
  account,
  counts,
  actions,
  emit,
  configure,
  onClose,
}: {
  step: Step
  cloud: CloudState
  account: Account
  counts: LocalCounts
  actions: Actions
  emit: (event: FlowEvent) => void
  configure: (server: CloudServerChoice, storage: CloudStorageMode) => Promise<void>
  onClose: () => void
}) {
  switch (step.step) {
    case 'welcome':
      return (
        <Panel
          hero={<img className="onboarding-mark" src={sprintMark} alt="" />}
          title="Welcome to Sprint"
          lead="Telemetry, dashes and session planning for your rig. Let’s decide where your data lives — it takes a minute."
          footer={
            <button type="button" className="button primary" autoFocus onClick={() => emit({ type: 'start' })}>
              Get started
            </button>
          }
        />
      )
    case 'server':
      return (
        <Panel title="Use Sprint on the web?" lead="Connect a Sprint server to see your sessions in the browser and keep several PCs in step.">
          <div className="onboarding-options">
            <Option
              icon={Cloud}
              title="Official Sprint server"
              description={cloud.officialServerUrl ? 'Hosted by Sprint. Sign in or create an account.' : 'Coming soon.'}
              disabled={cloud.officialServerUrl === null}
              onChoose={() => {
                if (cloud.officialServerUrl) emit({ type: 'chooseOfficial', url: cloud.officialServerUrl })
              }}
            />
            <Option icon={Server} title="My own server" description="Self-hosted. Sprint looks for it on your network." onChoose={() => emit({ type: 'chooseSelfHosted' })} autoFocus />
            <Option
              icon={Monitor}
              title="Only this PC"
              description="Keep everything here. You can connect later in Settings."
              onChoose={() => {
                void configure('None', 'Local')
                emit({ type: 'chooseLocalOnly' })
              }}
            />
          </div>
        </Panel>
      )
    case 'discover':
      return <Discover discover={actions.discover} emit={emit} />
    case 'address':
      return <Address step={step} emit={emit} />
    case 'account':
      return <AccountStep step={step} account={account} actions={actions} emit={emit} />
    case 'storage':
      return (
        <Panel title="Where should your data live?" lead="Sessions, setups and dashes. You can change this any time in Settings.">
          <div className="onboarding-options">
            {STORAGE_OPTIONS.map((option) => (
              <Option
                key={option.storage}
                icon={option.icon}
                title={option.title}
                description={option.description}
                badge={option.storage === 'Both' ? 'Recommended' : undefined}
                autoFocus={option.storage === 'Both'}
                onChoose={() => {
                  void configure(step.server, option.storage)
                  emit({ type: 'chooseStorage', storage: option.storage, localItems: counts.sessions + counts.setups + counts.dashes })
                }}
              />
            ))}
          </div>
        </Panel>
      )
    case 'transfer':
      return <Transfer step={step} cloud={cloud} counts={counts} upload={actions.upload} emit={emit} />
    case 'done':
      return (
        <Panel
          hero={<DoneMark />}
          title="You’re all set"
          lead={doneText(step.server, step.storage)}
          footer={
            <button type="button" className="button primary" autoFocus onClick={onClose}>
              Start using Sprint
            </button>
          }
        />
      )
  }
}

const STORAGE_OPTIONS: { storage: CloudStorageMode; icon: typeof Cloud; title: string; description: string }[] = [
  { storage: 'Both', icon: Layers, title: 'This PC and the web', description: 'Everything stays here and is kept in step with the server.' },
  { storage: 'Local', icon: HardDrive, title: 'This PC only', description: 'Signed in, but nothing is uploaded until you choose to.' },
  { storage: 'Remote', icon: Cloud, title: 'Web only', description: 'Finished sessions move to the server. Dashes and setups stay here — driving needs them.' },
]

const doneText = (server: CloudServerChoice, storage: CloudStorageMode): string => {
  if (server === 'None') return 'Sprint keeps everything on this PC. Connect a server any time in Settings.'
  switch (storage) {
    case 'Both':
      return 'Sprint keeps this PC and the web in step. New sessions upload by themselves.'
    case 'Remote':
      return 'Finished sessions move to the web. Download them again any time in Settings.'
    case 'Local':
      return 'You are signed in. Nothing uploads until you choose to in Settings.'
  }
}

function Panel({ hero, title, lead, children, footer }: { hero?: ReactNode; title: string; lead: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="onboarding-body">
        {hero}
        <h1 className="onboarding-title">{title}</h1>
        <p className="onboarding-lead">{lead}</p>
        {children}
      </div>
      {footer ? <footer className="onboarding-footer">{footer}</footer> : null}
    </>
  )
}

function Option({
  icon: Icon,
  title,
  description,
  badge,
  disabled = false,
  autoFocus = false,
  onChoose,
}: {
  icon: typeof Cloud
  title: string
  description: string
  badge?: string
  disabled?: boolean
  autoFocus?: boolean
  onChoose: () => void
}) {
  return (
    <button type="button" className="onboarding-option" disabled={disabled} autoFocus={autoFocus} onClick={onChoose}>
      <span className="onboarding-option-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.6} />
      </span>
      <span className="onboarding-option-text">
        <span className="onboarding-option-title">
          {title}
          {badge ? <span className="onboarding-badge">{badge}</span> : null}
        </span>
        <span className="onboarding-option-description">{description}</span>
      </span>
    </button>
  )
}

/** Runs the network scan once on mount. The bar fills over the scan's usual length; it never loops. */
function Discover({ discover, emit }: { discover: () => Promise<DiscoveredServer[]>; emit: (event: FlowEvent) => void }) {
  useEffect(() => {
    let live = true
    discover()
      .then((servers) => {
        if (live) emit({ type: 'discovered', servers })
      })
      .catch(() => {
        if (live) emit({ type: 'discovered', servers: [] })
      })
    return () => {
      live = false
    }
  }, [discover, emit])

  return (
    <Panel title="Looking for your Sprint server…" lead="Checking this PC and your local network.">
      <div className="onboarding-scan" role="progressbar" aria-label="Searching the network">
        <span />
      </div>
    </Panel>
  )
}

function Address({ step, emit }: { step: Extract<Step, { step: 'address' }>; emit: (event: FlowEvent) => void }) {
  const [url, setUrl] = useState(step.url)
  const trimmed = url.trim()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (trimmed.length > 0) emit({ type: 'useAddress', url: trimmed })
  }
  return (
    <form className="onboarding-form" onSubmit={submit}>
      <Panel
        title={step.found.length > 0 ? 'Found your Sprint server' : 'Where is your Sprint server?'}
        lead={step.found.length > 0 ? 'Pick it, or enter another address.' : 'No Sprint server answered on your network. Enter its address — it usually ends in :8080.'}
        footer={
          <>
            <button type="button" className="button subtle" onClick={() => emit({ type: 'rescan' })}>
              Scan again
            </button>
            <button type="submit" className="button primary" disabled={trimmed.length === 0}>
              Continue
            </button>
          </>
        }
      >
        {step.found.length > 0 ? (
          <ul className="onboarding-found" role="radiogroup" aria-label="Sprint servers found">
            {step.found.map((server, index) => (
              <li key={server.url} style={{ animationDelay: `${index * 60}ms` }}>
                <button type="button" role="radio" aria-checked={server.url === trimmed} className="onboarding-found-row" onClick={() => setUrl(server.url)}>
                  <Server size={16} strokeWidth={1.6} aria-hidden="true" />
                  <span className="onboarding-found-url">{server.url}</span>
                  {server.version ? <span className="onboarding-found-version">v{server.version}</span> : null}
                  {server.url === trimmed ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="field">
          <span>Server address</span>
          <input type="url" value={url} placeholder="http://192.168.1.20:8080" autoFocus={step.found.length === 0} onChange={(event) => setUrl(event.target.value)} />
        </label>
      </Panel>
    </form>
  )
}

/**
 * The sign-in step's state. `browser` is a Discord sign-in waiting on the system browser;
 * a cancelled one comes back to `editing` with a note, a failed one with an error.
 */
type AccountForm =
  | { phase: 'editing'; message: { tone: 'error' | 'note'; text: string } | null }
  | { phase: 'working' }
  | { phase: 'browser' }

/** Whether the server offers Discord sign-in. Asked once per step; `checking` only until the answer (or a short cap). */
type DiscordOffer = 'checking' | 'offered' | 'not-offered'

/** How long the step waits for the server's answer before showing the email form alone. */
const SERVER_INFO_WAIT_MS = 1500

function AccountStep({
  step,
  account,
  actions,
  emit,
}: {
  step: Extract<Step, { step: 'account' }>
  account: Account
  actions: Actions
  emit: (event: FlowEvent) => void
}) {
  const alreadyHere = account.signedIn && sameServer(account.serverUrl, step.serverUrl)
  const [useOther, setUseOther] = useState(false)
  const [create, setCreate] = useState(false)
  const [form, setForm] = useState<AccountForm>({ phase: 'editing', message: null })
  const [discord, setDiscord] = useState<DiscordOffer>('checking')
  const busy = form.phase !== 'editing'
  const { serverInfo, cancelDiscordSignIn } = actions

  // Leaving the step (Back, or closing the setup) while the browser leg is open cancels it on the
  // host, so a sign-in finished later in the browser does not land behind the driver's back.
  const waitingOnBrowser = useRef(false)
  useEffect(() => {
    waitingOnBrowser.current = form.phase === 'browser'
  }, [form.phase])
  useEffect(
    () => () => {
      if (waitingOnBrowser.current) void cancelDiscordSignIn()
    },
    [cancelDiscordSignIn],
  )

  useEffect(() => {
    let live = true
    const cap = setTimeout(() => {
      if (live) setDiscord((current) => (current === 'checking' ? 'not-offered' : current))
    }, SERVER_INFO_WAIT_MS)
    serverInfo(step.serverUrl)
      .then((info) => {
        if (live) setDiscord(info.reachable && info.discordSignIn ? 'offered' : 'not-offered')
      })
      .catch(() => {
        if (live) setDiscord('not-offered')
      })
    return () => {
      live = false
      clearTimeout(cap)
    }
  }, [serverInfo, step.serverUrl])

  if (alreadyHere && !useOther) {
    return (
      <Panel
        title="You’re signed in"
        lead={`As ${accountName(account)} on ${step.serverUrl}.`}
        footer={
          <>
            <button type="button" className="button subtle" onClick={() => setUseOther(true)}>
              Use another account
            </button>
            <button type="button" className="button primary" autoFocus onClick={() => emit({ type: 'signedIn' })}>
              Continue
            </button>
          </>
        }
      />
    )
  }

  const continueWithDiscord = () => {
    if (busy) return
    setForm({ phase: 'browser' })
    actions
      .signInWithDiscord(step.serverUrl)
      .then((result) => {
        switch (result.outcome) {
          case 'signedIn':
            return emit({ type: 'signedIn' })
          case 'cancelled':
            return setForm({ phase: 'editing', message: { tone: 'note', text: 'Discord sign-in was cancelled.' } })
          case 'failed':
            return setForm({ phase: 'editing', message: { tone: 'error', text: result.error } })
        }
      })
      .catch(() => setForm({ phase: 'editing', message: { tone: 'error', text: 'Discord sign-in did not finish. Try again.' } }))
  }

  if (form.phase === 'browser') {
    return (
      <Panel
        hero={<DiscordMark className="onboarding-mark onboarding-discord-mark" />}
        title="Continue in your browser"
        lead="Sprint opened Discord in your browser. Approve the sign-in there and Sprint continues by itself."
        footer={
          <button type="button" className="button" autoFocus onClick={() => void actions.cancelDiscordSignIn()}>
            Cancel
          </button>
        }
      />
    )
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const email = data.get('email')
    const password = data.get('password')
    setForm({ phase: 'working' })
    actions
      .signIn(step.serverUrl, typeof email === 'string' ? email.trim() : '', typeof password === 'string' ? password : '', create)
      .then((result) => (result.ok ? emit({ type: 'signedIn' }) : setForm({ phase: 'editing', message: { tone: 'error', text: result.error } })))
      .catch(() => setForm({ phase: 'editing', message: { tone: 'error', text: 'Enter your email and password.' } }))
  }

  // With Discord on the server, it is the primary way in and email/password the fallback below it.
  const offered = discord === 'offered'
  return (
    <form className="onboarding-form" onSubmit={submit}>
      <Panel
        title={create ? 'Create your Sprint account' : 'Sign in to Sprint'}
        lead={`On ${step.serverUrl}.`}
        footer={
          discord === 'checking' ? undefined : (
            <>
              <button type="button" className="button subtle" disabled={busy} onClick={() => setCreate(!create)}>
                {create ? 'I have an account' : 'Create an account'}
              </button>
              <button type="submit" className={offered ? 'button' : 'button primary'} disabled={busy}>
                {busy ? (create ? 'Creating…' : 'Signing in…') : create ? 'Create account' : 'Sign in'}
              </button>
            </>
          )
        }
      >
        {offered ? (
          <>
            <button type="button" className="button primary onboarding-discord" autoFocus disabled={busy} onClick={continueWithDiscord}>
              <DiscordMark />
              Continue with Discord
            </button>
            <p className="onboarding-divider" role="separator">
              <span>{create ? 'or create one with your email' : 'or use your email'}</span>
            </p>
          </>
        ) : null}
        {discord === 'checking' ? null : (
          <>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="username" required autoFocus={!offered} disabled={busy} />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete={create ? 'new-password' : 'current-password'} required disabled={busy} />
            </label>
          </>
        )}
        {form.phase === 'editing' && form.message ? (
          <p className={form.message.tone === 'error' ? 'field-error onboarding-error' : 'onboarding-note'} role={form.message.tone === 'error' ? 'alert' : 'status'}>
            {form.message.text}
          </p>
        ) : null}
      </Panel>
    </form>
  )
}

/** Discord's mark, in the current text colour. Brand artwork, not an icon from the set. */
function DiscordMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029ZM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  )
}

const sameServer = (a: string, b: string): boolean => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

type TransferState = { phase: 'asking' } | { phase: 'uploading' } | { phase: 'finished'; report: SyncReport }

function Transfer({
  step,
  cloud,
  counts,
  upload,
  emit,
}: {
  step: Extract<Step, { step: 'transfer' }>
  cloud: CloudState
  counts: LocalCounts
  upload: () => Promise<SyncReport>
  emit: (event: FlowEvent) => void
}) {
  const [state, setState] = useState<TransferState>({ phase: 'asking' })
  const start = () => {
    setState({ phase: 'uploading' })
    upload()
      .then((report) => setState({ phase: 'finished', report }))
      .catch(() => setState({ phase: 'finished', report: { uploaded: 0, downloaded: 0, conflicts: 0, removedLocally: 0, ok: false, error: 'The upload did not finish.' } }))
  }
  const progress = cloud.progress?.direction === 'upload' && cloud.progress.total > 0 ? cloud.progress.done / cloud.progress.total : 0

  if (state.phase === 'finished' && state.report.ok) {
    return (
      <Panel
        hero={<DoneMark />}
        title="Moved to the web"
        lead={`${state.report.uploaded} ${state.report.uploaded === 1 ? 'item' : 'items'} uploaded${state.report.removedLocally > 0 ? `; ${state.report.removedLocally} finished sessions now live only on the web` : ''}.`}
        footer={
          <button type="button" className="button primary" autoFocus onClick={() => emit({ type: 'transferDone' })}>
            Continue
          </button>
        }
      />
    )
  }

  return (
    <Panel
      title="Move what’s already here?"
      lead={`This PC has ${localSummary(counts)}. ${step.storage === 'Remote' ? 'After uploading, finished sessions are removed here.' : 'They stay here too.'}`}
      footer={
        <>
          <button type="button" className="button subtle" disabled={state.phase === 'uploading'} onClick={() => emit({ type: 'transferDone' })}>
            Not now
          </button>
          <button type="button" className="button primary" autoFocus disabled={state.phase === 'uploading'} onClick={start}>
            {state.phase === 'uploading' ? 'Uploading…' : state.phase === 'finished' ? 'Try again' : 'Upload now'}
          </button>
        </>
      }
    >
      {state.phase === 'uploading' ? (
        <div className="meter onboarding-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      ) : null}
      {state.phase === 'finished' && !state.report.ok ? (
        <p className="field-error onboarding-error" role="alert">
          {state.report.error}
          {state.report.uploaded > 0 ? ` (${state.report.uploaded} uploaded before it stopped.)` : ''}
        </p>
      ) : null}
    </Panel>
  )
}

/** A check that draws itself once. */
function DoneMark() {
  return (
    <svg className="onboarding-done" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" />
      <path d="M14 25 L21 32 L34 17" />
    </svg>
  )
}
