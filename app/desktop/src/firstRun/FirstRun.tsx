import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Check, Download, Flag, Gamepad2, Info, Sparkles, TriangleAlert } from 'lucide-react'
import type { FirstRun as FirstRunState, GameFolder, ResultsImportOffer, ResultsImportResult, SprintCommand } from '../bridge'
import sprintMark from '../assets/sprint-mark.svg'
import { Backdrop } from '../shell/Backdrop'
import { afterImport, afterSearch, offeredSessions, sessionCount } from '../shell/resultsImport'
import type { ImportDialogState } from '../shell/resultsImport'
import { STEP_LABELS, canLeaveGame, driverNameProblem, firstRunSteps, gameLead, plural, raceNumberProblem, timelineStops } from './flow'
import type { FirstRunStep } from './flow'
// The step title, lead, choice cards and done check are the Sprint web setup's (Onboarding.css).
import '../onboarding/Onboarding.css'
import './FirstRun.css'

export type FirstRunActions = {
  send: (command: SprintCommand) => Promise<void>
  pickFolder: (title: string) => Promise<string | null>
  scan: () => Promise<ResultsImportOffer>
  runImport: (entries: readonly string[]) => Promise<ResultsImportResult>
  decline: (entries: readonly string[]) => Promise<void>
}

const errorText = (error: unknown, fallback: string): string => (error instanceof Error && error.message.length > 0 ? error.message : fallback)

/**
 * The first-run setup: the whole window, over the web sign-in's light trails, until the host says
 * it is done (`firstRun.complete`). One glass card with a racing timeline across its top, a sector
 * per step. No close and no skip; Back is the only way out of a step. Nothing is saved until the
 * last step, except the game folder, which the host has to check and count.
 */
export function FirstRun({
  firstRun,
  importAvailable,
  driverName,
  driverNumber,
  actions,
}: {
  firstRun: FirstRunState
  importAvailable: boolean
  driverName: string
  driverNumber: string
  actions: FirstRunActions
}) {
  const steps = firstRunSteps(firstRun.game, importAvailable)
  const [index, setIndex] = useState(0)
  const step = steps[Math.min(index, steps.length - 1)] ?? 'you'
  // The host's default name is no name at all: the field starts empty rather than pre-filled with it.
  const [name, setName] = useState(() => (driverNameProblem(driverName) === null ? driverName : ''))
  const [number, setNumber] = useState(driverNumber)
  const [imported, setImported] = useState<number | null>(null)
  const next = () => setIndex((current) => Math.min(current + 1, steps.length - 1))
  const back = () => setIndex((current) => Math.max(current - 1, 0))

  return (
    <div className="first-run">
      <Backdrop tone="vivid" />
      <div className="first-run-drag" />
      <div className="first-run-column">
        <img className="first-run-mark" src={sprintMark} alt="Sprint" />
        <div className="first-run-card">
          <Timeline steps={steps} current={steps.indexOf(step)} />
          {step === 'you' ? <YouStep name={name} number={number} onName={setName} onNumber={setNumber} onNext={next} /> : null}
          {step === 'game' && firstRun.game ? <GameStep game={firstRun.game} actions={actions} onBack={back} onNext={next} /> : null}
          {step === 'laps' ? (
            <LapsStep
              actions={actions}
              onBack={back}
              onNext={(count) => {
                setImported(count)
                next()
              }}
            />
          ) : null}
          {step === 'done' ? <DoneStep name={name} number={number} imported={imported} send={actions.send} onBack={back} /> : null}
        </div>
      </div>
    </div>
  )
}

/** A lap from the start line to the flag (on the Done label): the line fills in brand as you go, the dot is you. */
function Timeline({ steps, current }: { steps: readonly FirstRunStep[]; current: number }) {
  const stops = timelineStops(steps.length)
  const at = (fraction: number): string => `${fraction * 100}%`
  const progress = stops[current] ?? 0
  return (
    <div className="first-run-timeline" aria-label={`Step ${current + 1} of ${steps.length}: ${STEP_LABELS[steps[current] ?? 'you']}`}>
      <div className="first-run-track">
        <span className="first-run-track-done" style={{ width: at(progress) }} />
        {stops.slice(0, -1).map((stop, index) => (
          <span key={stop} className={`first-run-sector${index < current ? ' done' : ''}`} style={{ left: at(stop) }} />
        ))}
        <span className="first-run-car" style={{ left: at(progress) }} />
      </div>
      <ol className="first-run-labels" aria-hidden>
        {steps.map((name, index) => (
          <li key={name} className={index < current ? 'done' : index === current ? 'current' : undefined} style={{ left: at(stops[index] ?? 0) }}>
            {name === 'done' ? <Flag size={14} aria-hidden /> : <b>S{index + 1}</b>}
            {STEP_LABELS[name]}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Step({ title, lead, hero, centered, children, footer }: { title: string; lead: string; hero?: ReactNode; centered?: boolean; children?: ReactNode; footer: ReactNode }) {
  return (
    <section className={centered ? 'first-run-step centered' : 'first-run-step'}>
      {hero}
      <h1 className="onboarding-title">{title}</h1>
      <p className="onboarding-lead">{lead}</p>
      {children}
      <div className="first-run-footer">{footer}</div>
    </section>
  )
}

function BackButton({ onBack, disabled }: { onBack: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="button subtle" onClick={onBack} disabled={disabled}>
      <ArrowLeft size={16} aria-hidden />
      Back
    </button>
  )
}

function YouStep({ name, number, onName, onNumber, onNext }: { name: string; number: string; onName: (name: string) => void; onNumber: (number: string) => void; onNext: () => void }) {
  // Problems show once the driver tried to go on, not while they are still typing the first letter.
  const [tried, setTried] = useState(false)
  const nameProblem = driverNameProblem(name)
  const numberProblem = raceNumberProblem(number)
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setTried(true)
        if (nameProblem === null && numberProblem === null) onNext()
      }}
    >
      <Step
        title="Who’s driving?"
        lead="Sprint needs a few things before you start. This one first."
        footer={
          <>
            <span />
            <button type="submit" className="button primary">
              Continue
            </button>
          </>
        }
      >
        <div className="first-run-fields">
          <label className="field">
            <span>Driver name</span>
            <input className="first-run-input" value={name} autoFocus autoComplete="name" aria-invalid={tried && nameProblem !== null} onChange={(event) => onName(event.target.value)} />
            {tried && nameProblem ? <span className="field-error">{nameProblem}</span> : <span className="field-hint">On the laps you share and on your dash. Your real name or the one you race under.</span>}
          </label>
          <label className="field">
            <span>Race number</span>
            <input className="first-run-input tabular" value={number} inputMode="numeric" maxLength={3} aria-invalid={tried && numberProblem !== null} onChange={(event) => onNumber(event.target.value)} />
            {tried && numberProblem ? <span className="field-error">{numberProblem}</span> : <span className="field-hint">On your dash.</span>}
          </label>
        </div>
      </Step>
    </form>
  )
}

function GameStep({ game, actions, onBack, onNext }: { game: GameFolder; actions: FirstRunActions; onBack: () => void; onNext: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = async () => {
    const folder = await actions.pickFolder('Where is Le Mans Ultimate installed?')
    if (folder === null) return
    setBusy(true)
    setError(null)
    try {
      await actions.send({ type: 'game.setFolder', folder })
    } catch (failure: unknown) {
      setError(errorText(failure, 'That folder isn’t a Le Mans Ultimate install.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Step
      title="Where’s Le Mans Ultimate?"
      lead={gameLead(game)}
      footer={
        <>
          <BackButton onBack={onBack} />
          <button type="button" className="button primary" disabled={!canLeaveGame(game) || busy} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className={`first-run-game${game.found ? '' : ' missing'}`}>
        <span className="first-run-game-icon">
          <Gamepad2 size={20} aria-hidden />
        </span>
        <span className="first-run-game-text">
          <b>Le Mans Ultimate</b>
          <span className="first-run-path" title={game.folder}>
            {game.found ? game.folder : 'Not found'}
          </span>
        </span>
        <button type="button" className={game.found ? 'button subtle' : 'button'} disabled={busy} onClick={() => void change()}>
          {game.found ? 'Change…' : 'Choose folder…'}
        </button>
      </div>
      {error ? <p className="field-error first-run-error">{error}</p> : null}
      {game.found ? (
        <ul className="first-run-checks">
          <Check14 title="Setups" detail={`${plural(game.setupCount, 'setup', 'setups')} in UserData\\player\\Settings`} />
          <Check14 title="Results" detail={`${plural(game.resultsCount, 'race result', 'race results')} in UserData\\Log\\Results`} />
          <li className="pending">
            <Info size={14} aria-hidden />
            <b>Live telemetry</b>
            <span>Start the game and drive out; Sprint connects by itself</span>
          </li>
        </ul>
      ) : null}
    </Step>
  )
}

function Check14({ title, detail }: { title: string; detail: string }) {
  return (
    <li>
      <Check size={14} aria-hidden />
      <b>{title}</b>
      <span>{detail}</span>
    </li>
  )
}

type LapsChoice = 'import' | 'fresh'

/** The results import (shell/resultsImport.ts phases), answered here once instead of the startup prompt. */
function LapsStep({ actions, onBack, onNext }: { actions: FirstRunActions; onBack: () => void; onNext: (imported: number | null) => void }) {
  const [state, setState] = useState<ImportDialogState>({ phase: 'searching' })
  const [choice, setChoice] = useState<LapsChoice>('import')
  const searching = state.phase === 'searching'

  useEffect(() => {
    if (!searching) return
    let live = true
    actions
      .scan()
      .then((offer) => {
        if (live) setState(afterSearch(offer))
      })
      .catch((error: unknown) => {
        if (live) setState({ phase: 'failed', error: errorText(error, 'The results archive could not be read.') })
      })
    return () => {
      live = false
    }
  }, [searching, actions])

  const go = (offer: ResultsImportOffer) => {
    if (choice === 'fresh') {
      actions.decline(offer.entries).catch((error: unknown) => console.error('Declining the import offer failed', error))
      onNext(null)
      return
    }
    setState({ phase: 'importing', offer })
    actions
      .runImport(offer.entries)
      .then((result) => {
        const after = afterImport(result)
        if (after.phase === 'imported') onNext(after.importedCount)
        else setState(after)
      })
      .catch((error: unknown) => setState({ phase: 'failed', error: errorText(error, 'The import did not finish.') }))
  }

  if (state.phase === 'ready' || state.phase === 'importing') {
    const sessions = offeredSessions(state.offer)
    const importing = state.phase === 'importing'
    return (
      <Step
        title="Bring in your past laps?"
        lead={`Le Mans Ultimate kept the results of ${sessionCount(sessions)} you drove before Sprint.`}
        footer={
          <>
            <BackButton onBack={onBack} disabled={importing} />
            <button type="button" className="button primary" disabled={importing} onClick={() => go(state.offer)}>
              {importing ? `Importing ${sessionCount(sessions)}…` : choice === 'import' ? 'Import and continue' : 'Continue'}
            </button>
          </>
        }
      >
        <div className="onboarding-options first-run-options" role="radiogroup" aria-label="Your past laps">
          <Choice icon={<Download size={18} />} title="Import them" description="Lap times only. They show in Analysis as “Imported”." chosen={choice === 'import'} disabled={importing} onChoose={() => setChoice('import')} />
          <Choice icon={<Sparkles size={18} />} title="Start fresh" description="Only laps you drive from now on. You can import later from Analysis." chosen={choice === 'fresh'} disabled={importing} onChoose={() => setChoice('fresh')} />
        </div>
      </Step>
    )
  }

  const lead =
    state.phase === 'searching'
      ? 'Looking through the game’s results…'
      : state.phase === 'failed'
        ? 'The import didn’t finish. Try again, or start fresh and import later from Analysis.'
        : 'No earlier sessions to bring in. Laps you drive from now on show in Analysis.'
  return (
    <Step
      title="Bring in your past laps?"
      lead={lead}
      footer={
        <>
          <BackButton onBack={onBack} />
          {state.phase === 'failed' ? (
            <span className="first-run-footer-end">
              <button type="button" className="button" onClick={() => onNext(null)}>
                Start fresh
              </button>
              <button type="button" className="button primary" onClick={() => setState({ phase: 'searching' })}>
                Try again
              </button>
            </span>
          ) : (
            <button type="button" className="button primary" disabled={state.phase === 'searching'} onClick={() => onNext(null)}>
              Continue
            </button>
          )}
        </>
      }
    >
      {state.phase === 'failed' ? (
        <p className="field-error first-run-error">
          <TriangleAlert size={14} aria-hidden /> {state.error}
        </p>
      ) : null}
    </Step>
  )
}

function Choice({ icon, title, description, chosen, disabled, onChoose }: { icon: ReactNode; title: string; description: string; chosen: boolean; disabled: boolean; onChoose: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={chosen} className={`onboarding-option${chosen ? ' chosen' : ''}`} disabled={disabled} onClick={onChoose}>
      <span className="onboarding-option-icon">{icon}</span>
      <span className="onboarding-option-text">
        <span className="onboarding-option-title">{title}</span>
        <span className="onboarding-option-description">{description}</span>
      </span>
    </button>
  )
}

function DoneStep({ name, number, imported, send, onBack }: { name: string; number: string; imported: number | null; send: FirstRunActions['send']; onBack: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      // The host records it done; the next state swaps this window for the app.
      await send({ type: 'firstRun.complete', driverName: name.trim(), driverNumber: number.trim() })
    } catch (failure: unknown) {
      setError(errorText(failure, 'Sprint couldn’t save that. Try again.'))
      setBusy(false)
    }
  }
  const lead = imported === null ? 'Everything here can be changed later in Settings.' : `${sessionCount(imported)} imported. Everything here can be changed later in Settings.`
  return (
    <Step
      title={`You’re set, ${name.trim()}`}
      centered
      lead={lead}
      hero={
        <svg className="onboarding-done" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="22" />
          <path d="M14 25 L21 32 L34 17" />
        </svg>
      }
      footer={
        <>
          <BackButton onBack={onBack} disabled={busy} />
          <button type="button" className="button primary" autoFocus disabled={busy} onClick={() => void finish()}>
            Start using Sprint
          </button>
        </>
      }
    >
      {error ? <p className="field-error first-run-error">{error}</p> : null}
    </Step>
  )
}
