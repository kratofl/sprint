import { useState } from 'react'
import {
  Button,
  KeyChip,
  PageHeader,
  SettingsCard,
  SettingsRow,
  StatusPill,
  Stepper,
  cn,
} from '@sprint/ui'

interface EngineerProps {
  connected: boolean
}

type EngineerControlKey = 'tcCut' | 'tcSlip' | 'abs' | 'brakeBias' | 'engineMap' | 'fuelTarget'

interface EngineerControl {
  key: EngineerControlKey
  label: string
  min: number
  max: number
  step?: number
  value: number
  unit?: string
}

export const ENGINEER_CONTROLS: readonly EngineerControl[] = [
  { key: 'tcCut', label: 'TC cut', min: 0, max: 12, value: 4 },
  { key: 'tcSlip', label: 'TC slip', min: 0, max: 12, value: 6 },
  { key: 'abs', label: 'ABS', min: 0, max: 12, value: 7 },
  { key: 'brakeBias', label: 'Brake bias', min: 48, max: 64, step: 0.5, value: 56.5, unit: '%' },
  { key: 'engineMap', label: 'Engine map', min: 1, max: 8, value: 3 },
  { key: 'fuelTarget', label: 'Fuel target', min: 1, max: 6, step: 0.1, value: 2.6, unit: 'L' },
] as const

const QUICK_MESSAGES = [
  'BOX THIS LAP',
  'PUSH NOW',
  'FUEL SAVE',
  'YELLOW S2',
  'GAP -1.2',
  'RADIO CHECK',
] as const

type EngineerControlValues = Record<EngineerControlKey, number>

export interface RadioLogRow {
  id: string
  message: string
  detail: string
  lap: number
  status: 'sent' | 'dash' | 'ack'
}

export interface EngineerState {
  carValues: EngineerControlValues
  stagedValues: EngineerControlValues
  radioLog: RadioLogRow[]
}

const initialControlValues = ENGINEER_CONTROLS.reduce((values, control) => {
  values[control.key] = control.value
  return values
}, {} as EngineerControlValues)

const initialRadioLog: RadioLogRow[] = [
  {
    id: 'radio-ack',
    message: 'RADIO CHECK',
    detail: 'Crew channel confirmed',
    lap: 18,
    status: 'ack',
  },
  {
    id: 'sync-ready',
    message: 'Dash sync',
    detail: 'Setup baseline and wheel page are aligned',
    lap: 17,
    status: 'dash',
  },
]

let nextRadioLogId = 1

export function createEngineerState(): EngineerState {
  return {
    carValues: { ...initialControlValues },
    stagedValues: { ...initialControlValues },
    radioLog: initialRadioLog.map(row => ({ ...row })),
  }
}

function formatEngineerValue(control: EngineerControl, value: number) {
  const decimals = control.step && control.step < 1 ? 1 : 0
  const formatted = decimals > 0 ? value.toFixed(decimals) : String(value)
  return control.unit ? `${formatted}${control.unit}` : formatted
}

function radioStatus(status: RadioLogRow['status']) {
  switch (status) {
    case 'ack':
      return 'ACK'
    case 'dash':
      return 'DASH'
    case 'sent':
      return 'SENT'
  }
}

function createRadioLogId(message: string) {
  const suffix = message.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const id = nextRadioLogId
  nextRadioLogId += 1
  return `radio-${id}-${suffix || 'message'}`
}

export function getDirtyEngineerControls(state: EngineerState) {
  return ENGINEER_CONTROLS.filter(control => state.stagedValues[control.key] !== state.carValues[control.key])
}

export function stageEngineerControl(state: EngineerState, key: EngineerControlKey, value: number): EngineerState {
  return {
    ...state,
    stagedValues: {
      ...state.stagedValues,
      [key]: value,
    },
  }
}

export function appendEngineerRadioLog(
  state: EngineerState,
  message: string,
  detail: string,
  status: RadioLogRow['status'] = 'sent',
): EngineerState {
  return {
    ...state,
    radioLog: [
      {
        id: createRadioLogId(message),
        message,
        detail,
        lap: 18,
        status,
      },
      ...state.radioLog,
    ].slice(0, 8),
  }
}

export function revertEngineerStagedChanges(state: EngineerState): EngineerState {
  return appendEngineerRadioLog(
    {
      ...state,
      stagedValues: { ...state.carValues },
    },
    'Revert',
    'Staged car control changes cleared',
    'dash',
  )
}

export function pushEngineerStagedChanges(state: EngineerState): EngineerState {
  const dirtyControls = getDirtyEngineerControls(state)
  if (dirtyControls.length === 0) return state

  const detail = dirtyControls
    .map(control => `${control.label} ${formatEngineerValue(control, state.carValues[control.key])} -> ${formatEngineerValue(control, state.stagedValues[control.key])}`)
    .join(' · ')

  return appendEngineerRadioLog(
    {
      ...state,
      carValues: { ...state.stagedValues },
      stagedValues: { ...state.stagedValues },
    },
    'Push staged changes',
    detail,
    'dash',
  )
}

export default function Engineer({ connected }: EngineerProps) {
  const [engineerState, setEngineerState] = useState(createEngineerState)

  const { carValues, stagedValues, radioLog } = engineerState
  const dirtyControls = getDirtyEngineerControls(engineerState)

  const updateControl = (key: EngineerControlKey, value: number) => {
    setEngineerState(current => stageEngineerControl(current, key, value))
  }

  const appendRadioLog = (message: string, detail: string, status: RadioLogRow['status'] = 'sent') => {
    setEngineerState(current => appendEngineerRadioLog(current, message, detail, status))
  }

  const revertControls = () => {
    setEngineerState(current => revertEngineerStagedChanges(current))
  }

  const pushStagedChanges = () => {
    setEngineerState(current => pushEngineerStagedChanges(current))
  }

  const brakeBias = ENGINEER_CONTROLS.find(control => control.key === 'brakeBias')
  const fuelTarget = ENGINEER_CONTROLS.find(control => control.key === 'fuelTarget')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        heading="Engineer"
        caption="Race engineer console and quick-message control"
        status={(
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                connected ? 'animate-pulse bg-[var(--green)]' : 'bg-[var(--text3)]',
              )}
            />
            <StatusPill status={connected ? 'success' : 'neutral'}>
              {connected ? 'Connected' : 'Offline'}
            </StatusPill>
          </div>
        )}
      />

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-[14px] overflow-y-auto p-6">
        <section className="col-span-12 flex flex-col gap-[14px] xl:col-span-8">
          <SettingsCard>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--text)]">Session status</h2>
                <p className="mt-1 text-[11px] text-[var(--text3)]">Race control and sim telemetry health</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill status={connected ? 'success' : 'neutral'}>{connected ? 'Race link' : 'No link'}</StatusPill>
                <StatusPill status="success">Sim link</StatusPill>
                <StatusPill status="info">Tick rate 60 Hz</StatusPill>
                <StatusPill status="warning">Lap phase S2</StatusPill>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--text)]">Car controls</h2>
                <p className="mt-1 text-[11px] text-[var(--text3)]">Stage electronics changes before sending them to the dash</p>
              </div>
              <StatusPill status={dirtyControls.length > 0 ? 'warning' : 'success'}>
                {dirtyControls.length > 0 ? `${dirtyControls.length} staged` : 'In sync'}
              </StatusPill>
            </div>

            {ENGINEER_CONTROLS.map(control => {
              const stagedValue = stagedValues[control.key]
              const carValue = carValues[control.key]
              const dirty = stagedValue !== carValue

              return (
                <SettingsRow
                  key={control.key}
                  className={cn(dirty && 'bg-[var(--panel2)]')}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text)]">{control.label}</span>
                      {dirty ? <StatusPill status="warning">staged</StatusPill> : null}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text3)]">
                      Car {formatEngineerValue(control, carValue)}
                      {dirty ? (
                        <span className="text-[var(--accent)]">{' -> '}{formatEngineerValue(control, stagedValue)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="min-w-[44px] text-right font-sans tabular-nums text-[11px] text-[var(--text2)]">
                      {formatEngineerValue(control, stagedValue)}
                    </span>
                    <Stepper
                      value={stagedValue}
                      min={control.min}
                      max={control.max}
                      step={control.step ?? 1}
                      inputLabel={control.label}
                      decrementLabel={`Decrease ${control.label}`}
                      incrementLabel={`Increase ${control.label}`}
                      onChange={value => updateControl(control.key, value)}
                    />
                  </div>
                </SettingsRow>
              )
            })}

            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div className="text-[11px] text-[var(--text3)]">
                Dash sync waits until staged values are pushed.
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={dirtyControls.length === 0} onClick={revertControls}>
                  Revert
                </Button>
                <Button type="button" variant="primary" size="sm" disabled={dirtyControls.length === 0} onClick={pushStagedChanges}>
                  Push staged changes
                </Button>
              </div>
            </div>
          </SettingsCard>

          <div className="grid gap-[14px] lg:grid-cols-3">
            <SettingsCard>
              <SettingsRow>
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text)]">Brake bias</div>
                  <div className="mt-1 text-[11px] text-[var(--text3)]">Current car setting</div>
                </div>
                <KeyChip>{brakeBias ? formatEngineerValue(brakeBias, carValues.brakeBias) : '--'}</KeyChip>
              </SettingsRow>
            </SettingsCard>

            <SettingsCard>
              <SettingsRow>
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text)]">Fuel target</div>
                  <div className="mt-1 text-[11px] text-[var(--text3)]">Per-lap strategy</div>
                </div>
                <KeyChip>{fuelTarget ? formatEngineerValue(fuelTarget, carValues.fuelTarget) : '--'}</KeyChip>
              </SettingsRow>
            </SettingsCard>

            <SettingsCard>
              <SettingsRow>
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text)]">Dash sync</div>
                  <div className="mt-1 text-[11px] text-[var(--text3)]">Last command state</div>
                </div>
                <StatusPill status={dirtyControls.length > 0 ? 'warning' : 'success'}>
                  {dirtyControls.length > 0 ? 'Pending' : 'Synced'}
                </StatusPill>
              </SettingsRow>
            </SettingsCard>
          </div>
        </section>

        <aside className="col-span-12 flex flex-col gap-[14px] xl:col-span-4">
          <SettingsCard>
            <div className="border-b border-[var(--line)] px-3 py-3">
              <h2 className="text-[13px] font-semibold text-[var(--text)]">Flags · Quick message</h2>
              <p className="mt-1 text-[11px] text-[var(--text3)]">Send the common race engineer calls</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {QUICK_MESSAGES.map(message => (
                <Button
                  key={message}
                  type="button"
                  variant={message.includes('YELLOW') ? 'secondary' : 'neutral'}
                  size="sm"
                  className="justify-center"
                  onClick={() => appendRadioLog(message, 'Quick message staged to the driver radio')}
                >
                  {message}
                </Button>
              ))}
            </div>
          </SettingsCard>

          <SettingsCard className="min-h-0 flex-1">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--text)]">Radio log</h2>
                <p className="mt-1 text-[11px] text-[var(--text3)]">Latest messages and dash acknowledgements</p>
              </div>
              <StatusPill status="success">Car link</StatusPill>
            </div>
            <div className="flex max-h-[420px] flex-col overflow-y-auto">
              {radioLog.map(row => (
                <SettingsRow key={row.id} className="sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <div className="text-[12px] font-semibold text-[var(--text)]">{row.message}</div>
                    <div className="mt-1 text-[11px] text-[var(--text3)]">{row.detail}</div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <KeyChip>L{row.lap}</KeyChip>
                    <KeyChip>{radioStatus(row.status)}</KeyChip>
                  </div>
                </SettingsRow>
              ))}
            </div>
          </SettingsCard>
        </aside>
      </div>
    </div>
  )
}
