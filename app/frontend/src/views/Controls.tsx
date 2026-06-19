import { useMemo, useRef, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Input,
  PageHeader,
  SegmentedControl,
  SettingsCard,
  SettingsRow,
  StatusPill,
  Stepper,
  Tile,
  cn,
} from '@sprint/ui'
import {
  BASELINE_SETUP_ID,
  SETUP_GROUPS,
  cancelDeleteSetupProgram,
  confirmDeleteSetupProgram,
  createSetupProgramState,
  duplicateSelectedSetupProgram,
  formatSetupDelta,
  formatSetupLapTime,
  formatSetupValue,
  getComparedSetupProgram,
  getSetupDifferenceRows,
  getSetupPrediction,
  getSelectedSetupProgram,
  renameSelectedSetupProgram,
  requestDeleteSetupProgram,
  selectSetupProgram,
  setSetupProgramMode,
  updateSelectedSetupParam,
  type SetupParamKey,
  type SetupProgramMode,
} from './setupProgramModel'

const SETUP_AREAS = ['Aero', 'Suspension', 'Tires', 'Brakes'] as const
const MODE_OPTIONS = [
  { value: 'edit', label: 'Edit' },
  { value: 'comparison', label: 'Comparison' },
] as const

export interface ControlsProps {
  compact?: boolean
}

let nextSetupCopyId = 1

function createSetupCopyId() {
  const id = nextSetupCopyId
  nextSetupCopyId += 1
  return `setup-copy-${id}`
}

function SetupMetricTile({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <Tile>
      <div className="text-[10px] font-semibold uppercase text-[var(--text3)]">{label}</div>
      <div className={cn('mt-2 font-sans tabular-nums text-[18px] font-semibold text-[var(--text)]', valueClassName)}>
        {value}
      </div>
    </Tile>
  )
}

export default function Controls({ compact = false }: ControlsProps) {
  const [setupState, setSetupState] = useState(createSetupProgramState)
  const [renaming, setRenaming] = useState<string | null>(null)
  const renameCanceledRef = useRef(false)

  const selected = getSelectedSetupProgram(setupState)
  const compared = useMemo(() => getComparedSetupProgram(setupState), [setupState])
  const selectedPrediction = useMemo(() => getSetupPrediction(selected), [selected])
  const comparedPrediction = useMemo(() => getSetupPrediction(compared), [compared])
  const differenceRows = useMemo(() => getSetupDifferenceRows(selected, compared), [compared, selected])
  const delta = selectedPrediction.lapTime - comparedPrediction.lapTime
  const pendingDeleteProgram = setupState.programs.find(program => program.id === setupState.pendingDeleteId)

  const startRename = () => {
    renameCanceledRef.current = false
    setRenaming(selected.name)
  }

  const cancelRename = () => {
    renameCanceledRef.current = true
    setRenaming(null)
  }

  const selectProgram = (programId: string) => {
    cancelRename()
    setSetupState(current => selectSetupProgram(current, programId))
  }

  const duplicateSelected = () => {
    const id = createSetupCopyId()
    const copyName = `${selected.name} copy`
    renameCanceledRef.current = false
    setSetupState(current => duplicateSelectedSetupProgram(current, id))
    setRenaming(copyName)
  }

  const requestDeleteSelected = () => {
    setSetupState(current => requestDeleteSetupProgram(current))
  }

  const confirmDeleteSelected = () => {
    cancelRename()
    setSetupState(current => confirmDeleteSetupProgram(current))
  }

  const cancelDeleteSelected = () => {
    setSetupState(current => cancelDeleteSetupProgram(current))
  }

  const updateSelectedParam = (key: SetupParamKey, value: number) => {
    setSetupState(current => updateSelectedSetupParam(current, key, value))
  }

  const commitRename = () => {
    if (renaming === null) return
    if (renameCanceledRef.current) {
      renameCanceledRef.current = false
      return
    }

    setSetupState(current => renameSelectedSetupProgram(current, renaming))
    setRenaming(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!compact && (
        <PageHeader
          heading="Setup"
          caption="Setup programs, field edits, and A/B comparison"
          status={(
            <>
              <StatusPill status="info">A/B {setupState.mode === 'comparison' ? 'active' : 'ready'}</StatusPill>
              <StatusPill status="success">Baseline loaded</StatusPill>
            </>
          )}
        />
      )}

      <div className={cn('grid min-h-0 flex-1 grid-cols-12 gap-[14px] overflow-y-auto', compact ? 'p-0' : 'p-6')}>
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
          <SettingsCard>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--text)]">Programs</h2>
                <p className="mt-1 text-[11px] text-[var(--text3)]">
                  {SETUP_AREAS.join(' · ')} setup fields
                </p>
              </div>
              <StatusPill status="neutral">{setupState.programs.length}</StatusPill>
            </div>

            <div className="flex flex-col">
              {setupState.programs.map(program => {
                const isSelected = program.id === selected.id
                const isCompared = setupState.mode === 'comparison' && program.id === compared.id && program.id !== selected.id
                const prediction = getSetupPrediction(program)

                return (
                  <button
                    key={program.id}
                    type="button"
                    className={cn(
                      'grid gap-2 border-b border-[var(--line)] px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--panel2)] focus-visible:border-[var(--accent)] focus-visible:outline-none',
                      isSelected && 'bg-[var(--panel2)]',
                    )}
                    onClick={() => selectProgram(program.id)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--text)]">{program.name}</span>
                      <span className="font-sans tabular-nums text-[11px] text-[var(--text2)]">
                        {formatSetupLapTime(prediction.lapTime)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {isSelected ? <StatusPill status="info">A</StatusPill> : null}
                      {isCompared ? <StatusPill status="warning">B</StatusPill> : null}
                      {program.id === BASELINE_SETUP_ID ? <StatusPill status="success">Baseline</StatusPill> : null}
                      {!isSelected && !isCompared && program.id !== BASELINE_SETUP_ID ? (
                        <StatusPill status="neutral">Program</StatusPill>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="space-y-3 border-t border-[var(--line)] px-3 py-3">
              <SegmentedControl
                label="Setup mode"
                value={setupState.mode}
                options={MODE_OPTIONS}
                onChange={value => setSetupState(current => setSetupProgramMode(current, value as SetupProgramMode))}
                className="w-full justify-center"
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={duplicateSelected}>
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={setupState.programs.length <= 1}
                  onClick={requestDeleteSelected}
                >
                  Delete
                </Button>
              </div>
            </div>
          </SettingsCard>
        </aside>

        <section className="col-span-12 flex min-h-0 flex-col gap-[14px] lg:col-span-8 xl:col-span-9">
          {setupState.mode === 'edit' ? (
            <>
              <SettingsCard>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3">
                  <div className="min-w-0">
                    {renaming !== null ? (
                      <Input
                        autoFocus
                        value={renaming}
                        aria-label="Setup program name"
                        className="h-[30px] max-w-[360px] font-semibold"
                        onChange={event => setRenaming(event.currentTarget.value)}
                        onBlur={commitRename}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitRename()
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelRename()
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="truncate text-left text-[13px] font-semibold text-[var(--text)] outline-none hover:text-[var(--accent)] focus-visible:text-[var(--accent)]"
                        onClick={startRename}
                      >
                        {selected.name}
                      </button>
                    )}
                    <p className="mt-1 text-[11px] text-[var(--text3)]">
                      Predicted lap {formatSetupLapTime(selectedPrediction.lapTime)}
                    </p>
                  </div>
                  <StatusPill status={selected.id === BASELINE_SETUP_ID ? 'success' : 'info'}>
                    {selected.id === BASELINE_SETUP_ID ? 'Baseline' : 'Editable'}
                  </StatusPill>
                </div>
              </SettingsCard>

              {SETUP_GROUPS.map(group => (
                <SettingsCard key={group.name}>
                  <div className="border-b border-[var(--line)] px-3 py-3">
                    <h2 className="text-[13px] font-semibold text-[var(--text)]">{group.name}</h2>
                    <p className="mt-1 text-[11px] text-[var(--text3)]">
                      {group.params.length} setup parameters
                    </p>
                  </div>

                  {group.params.map(param => (
                    <SettingsRow key={param.key}>
                      <div>
                        <div className="text-[12px] font-medium text-[var(--text)]">{param.label}</div>
                        <div className="mt-1 text-[11px] text-[var(--text3)]">
                          Range {formatSetupValue(param, param.min)} to {formatSetupValue(param, param.max)}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="min-w-[72px] text-right font-sans tabular-nums text-[11px] text-[var(--text2)]">
                          {formatSetupValue(param, selected.params[param.key])}
                        </span>
                        <Stepper
                          value={selected.params[param.key]}
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          inputLabel={param.label}
                          decrementLabel={`Decrease ${param.label}`}
                          incrementLabel={`Increase ${param.label}`}
                          onChange={value => updateSelectedParam(param.key, value)}
                        />
                      </div>
                    </SettingsRow>
                  ))}
                </SettingsCard>
              ))}
            </>
          ) : (
            <SettingsCard>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3">
                <div>
                  <h2 className="text-[13px] font-semibold text-[var(--text)]">A/B Comparison</h2>
                  <p className="mt-1 text-[11px] text-[var(--text3)]">
                    Compare {selected.name} against {compared.name}
                  </p>
                </div>
                <StatusPill status={delta <= 0 ? 'success' : 'danger'}>
                  {formatSetupDelta(delta)}s
                </StatusPill>
              </div>

              <div className="grid gap-3 border-b border-[var(--line)] p-3 md:grid-cols-3">
                <SetupMetricTile
                  label="A prediction"
                  value={formatSetupLapTime(selectedPrediction.lapTime)}
                  valueClassName="text-[var(--accent)]"
                />
                <SetupMetricTile
                  label="B prediction"
                  value={formatSetupLapTime(comparedPrediction.lapTime)}
                />
                <SetupMetricTile
                  label="Delta"
                  value={`${formatSetupDelta(delta)}s`}
                  valueClassName={delta <= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}
                />
              </div>

              <div className="flex flex-col">
                <SettingsRow className="bg-[var(--panel2)] sm:grid-cols-[minmax(0,1fr)_100px_100px]">
                  <div className="text-[11px] font-semibold uppercase text-[var(--text3)]">
                    {differenceRows.length} changed fields
                  </div>
                  <div className="text-right text-[11px] font-semibold uppercase text-[var(--accent)]">A</div>
                  <div className="text-right text-[11px] font-semibold uppercase text-[var(--text2)]">B</div>
                </SettingsRow>

                {differenceRows.map(row => (
                  <SettingsRow
                    key={`${row.group}-${row.label}`}
                    className="sm:grid-cols-[minmax(0,1fr)_100px_100px]"
                  >
                    <div>
                      <div className="text-[12px] font-medium text-[var(--text)]">{row.label}</div>
                      <div className="mt-1 text-[11px] text-[var(--text3)]">{row.group}</div>
                    </div>
                    <div className="text-right font-sans tabular-nums text-[11px] text-[var(--accent)]">{row.a}</div>
                    <div className="text-right font-sans tabular-nums text-[11px] text-[var(--text2)]">{row.b}</div>
                  </SettingsRow>
                ))}
              </div>
            </SettingsCard>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={setupState.pendingDeleteId !== null}
        title="Delete setup program?"
        message={`${pendingDeleteProgram?.name ?? 'This setup program'} will be removed from this local Setup list.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteSelected}
        onCancel={cancelDeleteSelected}
      />
    </div>
  )
}
