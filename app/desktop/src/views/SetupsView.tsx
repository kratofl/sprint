import { useEffect, useRef, useState } from 'react'
import { Copy, Minus, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { SprintCommand, SprintState } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import {
  buildSetupDelete,
  buildSetupDuplicate,
  buildSetupSave,
  clampToParameter,
  formatSetupValue,
  parseSetupParameters,
  parseSetupPrograms,
  setupParameterGroups,
  valueFor,
} from './SetupsDomain'
import type { SetupParameter, SetupProgram } from './SetupsDomain'
import './SetupsView.css'

type LoadedState = { templates: SetupProgram[]; programs: SetupProgram[]; parameters: SetupParameter[] }

const toLoadedState = (sprint: SprintState): LoadedState => ({
  templates: parseSetupPrograms(sprint.setupTemplates),
  programs: parseSetupPrograms(sprint.setupPrograms),
  parameters: parseSetupParameters(sprint),
})

const UNDO_SECONDS = 8

/** A delete the driver can still undo: `setup.delete` is not sent until the window runs out. */
type PendingDelete = { program: SetupProgram; secondsLeft: number }

/**
 * Setups: PageHeader + CommandBar (duplicate, delete), then the setups table card beside
 * the selected setup's parameter cards. Templates are read-only; user edits save
 * immediately. Parameter bounds come from the host's `setupParameters` (see
 * SetupsDomain's header comment).
 *
 * Deleting a user setup sends `setup.delete` (`RuntimeCoordinator.DeleteSetup`).
 * `RuntimeCoordinator` has no restore/undo command, so an 8-second undo window
 * cannot work by sending the delete immediately and re-inserting on undo. Instead
 * the command is deferred: the setup disappears from this view right away, but
 * `setup.delete` is sent once the window runs out, or immediately if the page is
 * left first. Undo cancels the pending send — nothing was ever told to the host, so there is
 * nothing to restore.
 */
export function SetupsView({ runtime, send }: { runtime: RuntimeState; send: (command: SprintCommand) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  // `setInterval`'s callback closes over the value from the tick it was created on, so the
  // running countdown is mirrored into a ref the tick handler reads instead of relying on a
  // fresh closure per tick.
  const pendingDeleteRef = useRef<PendingDelete | null>(null)
  const intervalRef = useRef<number | null>(null)

  // Leaving the page commits a pending delete: the driver chose to delete and only had
  // the undo window left, so walking away must not quietly bring the setup back.
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      const pending = pendingDeleteRef.current
      pendingDeleteRef.current = null
      if (pending) void sendRef.current(buildSetupDelete(pending.program.id))
    }
  }, [])

  const state = runtime.kind === 'ready' ? toLoadedState(runtime.sprint) : null

  if (state === null) {
    return (
      <div className="setups">
        <PageHeader title="Setups" />
        <div className="setups-split">
          <div className="card skeleton setups-list" />
          <div className="card skeleton setups-editor-skeleton" />
        </div>
      </div>
    )
  }

  const cancelPendingDelete = () => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    intervalRef.current = null
    pendingDeleteRef.current = null
    setPendingDelete(null)
  }

  const startDelete = (program: SetupProgram) => {
    cancelPendingDelete()
    setSelectedId(null)
    const pending: PendingDelete = { program, secondsLeft: UNDO_SECONDS }
    pendingDeleteRef.current = pending
    setPendingDelete(pending)
    intervalRef.current = window.setInterval(() => {
      const current = pendingDeleteRef.current
      if (!current) return
      if (current.secondsLeft <= 1) {
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
        intervalRef.current = null
        pendingDeleteRef.current = null
        setPendingDelete(null)
        void send(buildSetupDelete(current.program.id))
        return
      }

      const next: PendingDelete = { ...current, secondsLeft: current.secondsLeft - 1 }
      pendingDeleteRef.current = next
      setPendingDelete(next)
    }, 1000)
  }

  // The pending setup is hidden immediately — the undo bar's "deleted" claim has to be true
  // on screen even though the host has not been told yet.
  const programs = pendingDelete ? state.programs.filter((program) => program.id !== pendingDelete.program.id) : state.programs
  const all = [...programs, ...state.templates]
  const selected = all.find((program) => program.id === selectedId) ?? programs[0] ?? state.templates[0] ?? null

  return (
    <div className="setups">
      <PageHeader title="Setups">
        <button
          type="button"
          className="button primary"
          disabled={selected === null}
          onClick={() => {
            // The host assigns the duplicate's id; sendCommand does not return it, so
            // selection cannot deterministically follow the copy. The next state push
            // will show it in the table for the driver to select.
            if (selected) void send(buildSetupDuplicate(selected.id))
          }}
        >
          <Copy /> {selected?.isTemplate === false ? 'Duplicate setup' : 'Duplicate template'}
        </button>
        <CommandDivider />
        <button
          type="button"
          className="button subtle destructive"
          disabled={selected === null || selected.isTemplate}
          title={selected?.isTemplate ? 'Templates cannot be deleted.' : undefined}
          onClick={() => {
            if (selected && !selected.isTemplate) startDelete(selected)
          }}
        >
          <Trash2 /> Delete
        </button>
      </PageHeader>

      <div className="setups-body">
        {pendingDelete && (
          <div className="infobar info" role="status">
            <span className="infobar-icon" aria-hidden="true">
              i
            </span>
            <strong className="infobar-title">Setup deleted</strong>
            <span className="infobar-message">
              {pendingDelete.program.name} can be restored for <span className="tabular">{pendingDelete.secondsLeft}</span>s.
            </span>
            <button type="button" className="button" onClick={cancelPendingDelete}>
              Undo
            </button>
          </div>
        )}

        {all.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <SlidersHorizontal size={28} strokeWidth={1.5} />
              <h2>No setups yet</h2>
              <p>Setup templates will appear here once the game reports a car.</p>
            </div>
          </div>
        ) : (
          <div className="setups-split">
            <SetupTable programs={programs} templates={state.templates} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            {selected && <SetupEditor key={selected.id} program={selected} parameters={state.parameters} send={send} />}
          </div>
        )}
      </div>
    </div>
  )
}

/** The setups table: user setups first (they are the ones being edited), then the templates. */
function SetupTable({
  programs,
  templates,
  selectedId,
  onSelect,
}: {
  programs: SetupProgram[]
  templates: SetupProgram[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="card list-card setups-list" aria-label="Setups">
      <div className="card-header">
        <h2 className="card-title">All setups</h2>
        <span className="muted tabular">{programs.length + templates.length}</span>
      </div>
      <div className="list-header setups-columns" aria-hidden="true">
        <span>Name</span>
        <span>Type</span>
      </div>
      <ul className="list-rows">
        {[...programs, ...templates].map((program) => {
          const isSelected = program.id === selectedId
          return (
            <li key={program.id}>
              <button
                type="button"
                className={isSelected ? 'list-row setups-columns selected' : 'list-row setups-columns'}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(program.id)}
              >
                <span className="setups-row-name">{program.name}</span>
                <span className="setups-row-type">{program.isTemplate ? 'Template' : 'User setup'}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {programs.length === 0 && <p className="muted setups-list-hint">No user setups yet. Duplicate a template to start editing.</p>}
    </section>
  )
}

function SetupEditor({
  program,
  parameters,
  send,
}: {
  program: SetupProgram
  parameters: SetupParameter[]
  send: (command: SprintCommand) => Promise<void>
}) {
  // Local mirror so a stepper reflects the click immediately; RuntimeCoordinator
  // re-validates and persists on every change (setup.save is called per field).
  const [values, setValues] = useState(program.values)

  const setValue = (key: string, value: number) => {
    setValues((current) => ({ ...current, [key]: value }))
    void send(buildSetupSave(program.id, key, value))
  }

  return (
    <div className="setups-editor">
      <div className="setups-editor-head">
        <h2 className="setups-editor-title">{program.name}</h2>
        <span className={program.isTemplate ? 'chip chip-muted' : 'chip'}>{program.isTemplate ? 'Template' : 'User setup'}</span>
      </div>

      {program.isTemplate && (
        <div className="infobar info" role="status">
          <span className="infobar-icon" aria-hidden="true">
            i
          </span>
          <strong className="infobar-title">Read-only template</strong>
          <span className="infobar-message">Duplicate this template to edit its values.</span>
        </div>
      )}

      <div className="setups-groups">
        {setupParameterGroups(parameters).map(({ group, parameters: groupParameters }) => (
          <section className="card setups-group" key={group}>
            <h3 className="card-title">{group}</h3>
            <div className="setups-params">
              {groupParameters.map((parameter) => {
                const current = values[parameter.key] ?? valueFor(program, parameter)
                return (
                  <div className="setups-param-row" key={parameter.key}>
                    <span className="setups-param-label">{parameter.label}</span>
                    <span className="muted tabular setups-param-range">
                      {parameter.min}–{parameter.max} {parameter.unit}
                    </span>
                    <span className="setups-stepper">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Decrease ${parameter.label}`}
                        title={`Decrease ${parameter.label}`}
                        disabled={program.isTemplate || current <= parameter.min}
                        onClick={() => setValue(parameter.key, clampToParameter(parameter, current - parameter.step))}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="setups-stepper-value tabular">{formatSetupValue(parameter, current)}</span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Increase ${parameter.label}`}
                        title={`Increase ${parameter.label}`}
                        disabled={program.isTemplate || current >= parameter.max}
                        onClick={() => setValue(parameter.key, clampToParameter(parameter, current + parameter.step))}
                      >
                        <Plus size={14} />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
