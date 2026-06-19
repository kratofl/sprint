export const BASELINE_SETUP_ID = 'setup-baseline'

export type SetupParamKey =
  | 'splitter'
  | 'rearWing'
  | 'springF'
  | 'springR'
  | 'arbF'
  | 'arbR'
  | 'rideF'
  | 'rideR'
  | 'damperF'
  | 'damperR'
  | 'pressF'
  | 'pressR'
  | 'bias'
  | 'ducts'
  | 'diff'
  | 'fuelLoad'

export interface SetupParamDef {
  key: SetupParamKey
  label: string
  min: number
  max: number
  step: number
  unit?: string
  format?: (value: number) => string
}

export interface SetupParamGroup {
  name: string
  params: SetupParamDef[]
}

export type SetupParams = Record<SetupParamKey, number>

export interface SetupProgram {
  id: string
  name: string
  params: SetupParams
}

export interface SetupPrediction {
  lapTime: number
  drag: number
  grip: number
  accel: number
}

export interface SetupDifferenceRow {
  group: string
  label: string
  a: string
  b: string
}

export type SetupProgramMode = 'edit' | 'comparison'

export interface SetupProgramState {
  programs: SetupProgram[]
  selectedId: string
  mode: SetupProgramMode
  comparedId: string | null
  pendingDeleteId: string | null
}

const oneDecimal = (value: number) => value.toFixed(1)

export const SETUP_GROUPS: SetupParamGroup[] = [
  {
    name: 'Aero',
    params: [
      { key: 'splitter', label: 'Front splitter', min: 1, max: 5, step: 1 },
      { key: 'rearWing', label: 'Rear wing', min: 1, max: 12, step: 1 },
    ],
  },
  {
    name: 'Suspension',
    params: [
      { key: 'springF', label: 'Spring F', min: 80, max: 180, step: 5, unit: 'N/mm' },
      { key: 'springR', label: 'Spring R', min: 90, max: 200, step: 5, unit: 'N/mm' },
      { key: 'arbF', label: 'Anti-roll F', min: 1, max: 6, step: 1 },
      { key: 'arbR', label: 'Anti-roll R', min: 1, max: 6, step: 1 },
      { key: 'rideF', label: 'Ride height F', min: 50, max: 80, step: 1, unit: 'mm' },
      { key: 'rideR', label: 'Ride height R', min: 55, max: 90, step: 1, unit: 'mm' },
      { key: 'damperF', label: 'Dampers F', min: 1, max: 12, step: 1 },
      { key: 'damperR', label: 'Dampers R', min: 1, max: 12, step: 1 },
    ],
  },
  {
    name: 'Tires',
    params: [
      { key: 'pressF', label: 'Pressure F', min: 24, max: 30, step: 0.1, unit: 'psi', format: oneDecimal },
      { key: 'pressR', label: 'Pressure R', min: 24, max: 30, step: 0.1, unit: 'psi', format: oneDecimal },
    ],
  },
  {
    name: 'Brakes · Drivetrain',
    params: [
      { key: 'bias', label: 'Brake bias', min: 48, max: 64, step: 0.5, unit: '%', format: oneDecimal },
      { key: 'ducts', label: 'Brake ducts', min: 1, max: 6, step: 1 },
      { key: 'diff', label: 'Diff preload', min: 20, max: 120, step: 5, unit: 'Nm' },
      { key: 'fuelLoad', label: 'Fuel load', min: 10, max: 90, step: 1, unit: 'L' },
    ],
  },
]

export const SETUP_DEFAULTS: SetupProgram[] = [
  {
    id: BASELINE_SETUP_ID,
    name: 'Baseline · Race',
    params: {
      splitter: 3,
      rearWing: 7,
      springF: 130,
      springR: 145,
      arbF: 3,
      arbR: 4,
      rideF: 60,
      rideR: 68,
      damperF: 6,
      damperR: 7,
      pressF: 27.4,
      pressR: 27.1,
      bias: 56.5,
      ducts: 3,
      diff: 60,
      fuelLoad: 62,
    },
  },
  {
    id: 'setup-quali-low-df',
    name: 'Quali · Low DF',
    params: {
      splitter: 2,
      rearWing: 4,
      springF: 140,
      springR: 155,
      arbF: 4,
      arbR: 4,
      rideF: 56,
      rideR: 64,
      damperF: 7,
      damperR: 8,
      pressF: 27.8,
      pressR: 27.5,
      bias: 57.5,
      ducts: 2,
      diff: 70,
      fuelLoad: 18,
    },
  },
  {
    id: 'setup-race-high-df',
    name: 'Race · High DF',
    params: {
      splitter: 4,
      rearWing: 10,
      springF: 125,
      springR: 140,
      arbF: 3,
      arbR: 3,
      rideF: 62,
      rideR: 72,
      damperF: 5,
      damperR: 6,
      pressF: 27.0,
      pressR: 26.8,
      bias: 55.5,
      ducts: 4,
      diff: 55,
      fuelLoad: 88,
    },
  },
]

export function formatSetupValue(def: SetupParamDef, value: number): string {
  const formatted = def.format ? def.format(value) : String(value)
  return def.unit ? `${formatted} ${def.unit}` : formatted
}

export function updateSetupParam(program: SetupProgram, key: SetupParamKey, value: number): SetupProgram {
  return {
    ...program,
    params: {
      ...program.params,
      [key]: value,
    },
  }
}

export function renameSetupProgram(program: SetupProgram, name: string): SetupProgram {
  const trimmed = name.trim()
  return trimmed ? { ...program, name: trimmed } : program
}

export function createSetupProgramCopy(program: SetupProgram, id: string): SetupProgram {
  return {
    id,
    name: `${program.name} copy`,
    params: { ...program.params },
  }
}

export function deleteSetupProgram(programs: SetupProgram[], selectedId: string): { programs: SetupProgram[]; selectedId: string } {
  if (programs.length <= 1) {
    return { programs, selectedId }
  }

  const nextPrograms = programs.filter(program => program.id !== selectedId)
  return {
    programs: nextPrograms,
    selectedId: nextPrograms[0]?.id ?? selectedId,
  }
}

export function getComparedSetup(programs: SetupProgram[], selectedId: string, comparedId: string | null): SetupProgram {
  return programs.find(program => program.id === comparedId && program.id !== selectedId)
    ?? programs.find(program => program.id !== selectedId)
    ?? programs[0]
}

export function createSetupProgramState(programs: SetupProgram[] = SETUP_DEFAULTS): SetupProgramState {
  const nextPrograms = programs.length > 0 ? programs : SETUP_DEFAULTS

  return {
    programs: nextPrograms,
    selectedId: nextPrograms[0]?.id ?? BASELINE_SETUP_ID,
    mode: 'edit',
    comparedId: null,
    pendingDeleteId: null,
  }
}

export function getSelectedSetupProgram(state: SetupProgramState): SetupProgram {
  return state.programs.find(program => program.id === state.selectedId) ?? state.programs[0]
}

export function getComparedSetupProgram(state: SetupProgramState): SetupProgram {
  const selected = getSelectedSetupProgram(state)
  return getComparedSetup(state.programs, selected.id, state.comparedId)
}

export function setSetupProgramMode(state: SetupProgramState, mode: SetupProgramMode): SetupProgramState {
  return {
    ...state,
    mode,
    pendingDeleteId: null,
  }
}

export function selectSetupProgram(state: SetupProgramState, programId: string): SetupProgramState {
  const selected = getSelectedSetupProgram(state)

  if (state.mode === 'comparison' && programId !== selected.id) {
    return {
      ...state,
      comparedId: programId,
      pendingDeleteId: null,
    }
  }

  return {
    ...state,
    selectedId: programId,
    comparedId: state.comparedId === programId ? null : state.comparedId,
    pendingDeleteId: null,
  }
}

export function duplicateSelectedSetupProgram(state: SetupProgramState, id: string): SetupProgramState {
  const selected = getSelectedSetupProgram(state)
  const copy = createSetupProgramCopy(selected, id)

  return {
    ...state,
    programs: [...state.programs, copy],
    selectedId: copy.id,
    comparedId: selected.id,
    pendingDeleteId: null,
  }
}

export function requestDeleteSetupProgram(state: SetupProgramState): SetupProgramState {
  if (state.programs.length <= 1) {
    return {
      ...state,
      pendingDeleteId: null,
    }
  }

  return {
    ...state,
    pendingDeleteId: state.selectedId,
  }
}

export function cancelDeleteSetupProgram(state: SetupProgramState): SetupProgramState {
  return {
    ...state,
    pendingDeleteId: null,
  }
}

export function confirmDeleteSetupProgram(state: SetupProgramState): SetupProgramState {
  if (!state.pendingDeleteId || state.programs.length <= 1) {
    return cancelDeleteSetupProgram(state)
  }

  const result = deleteSetupProgram(state.programs, state.pendingDeleteId)

  return {
    ...state,
    programs: result.programs,
    selectedId: result.selectedId,
    comparedId: state.comparedId === state.pendingDeleteId ? null : state.comparedId,
    pendingDeleteId: null,
  }
}

export function renameSelectedSetupProgram(state: SetupProgramState, name: string): SetupProgramState {
  return {
    ...state,
    programs: state.programs.map(program => (
      program.id === state.selectedId ? renameSetupProgram(program, name) : program
    )),
    pendingDeleteId: null,
  }
}

export function updateSelectedSetupParam(state: SetupProgramState, key: SetupParamKey, value: number): SetupProgramState {
  return {
    ...state,
    programs: state.programs.map(program => (
      program.id === state.selectedId ? updateSetupParam(program, key, value) : program
    )),
  }
}

export function getSetupPrediction(program: SetupProgram): SetupPrediction {
  const params = program.params
  const drag = (params.rearWing - 7) * 0.55 + (params.splitter - 3) * 0.18
  const grip = (params.rearWing - 7) * 0.42 + (params.splitter - 3) * 0.38 - (params.rideF - 60 + (params.rideR - 68)) * 0.025
  const accel = -(params.fuelLoad - 50) * 0.045
  const lapTime = 92.4 + drag * 0.08 - grip * 0.12 - accel * 0.08

  return {
    lapTime,
    drag,
    grip,
    accel,
  }
}

export function formatSetupLapTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return `${minutes}:${remainder.toFixed(3).padStart(6, '0')}`
}

export function formatSetupDelta(seconds: number): string {
  const sign = seconds > 0 ? '+' : ''
  return `${sign}${seconds.toFixed(3)}`
}

export function getSetupDifferenceRows(a: SetupProgram, b: SetupProgram): SetupDifferenceRow[] {
  const rows: SetupDifferenceRow[] = []

  for (const group of SETUP_GROUPS) {
    for (const def of group.params) {
      const aValue = a.params[def.key]
      const bValue = b.params[def.key]
      if (aValue === bValue) continue
      rows.push({
        group: group.name,
        label: def.label,
        a: formatSetupValue(def, aValue),
        b: formatSetupValue(def, bValue),
      })
    }
  }

  return rows
}
