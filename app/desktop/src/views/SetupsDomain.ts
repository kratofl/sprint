import type { SprintCommand } from '../bridge'

/**
 * Setups domain model and parsing.
 *
 * `SetupParameter` (key/label/min/max/step/unit/group) is the fixed catalog
 * owned by the native host (`DesktopRuntime.SetupParameters` in
 * `app/Sprint.Desktop.Core/DesktopRuntime.cs`) and enforced server-side by
 * `RuntimeCoordinator.SaveSetup`. The host publishes it as `setupParameters`
 * on `/api/state`, so it is parsed here rather than hand-copied — see
 * `parseSetupParameters` below.
 */
export type SetupParameter = {
  key: string
  label: string
  min: number
  max: number
  step: number
  unit: string
  group: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const num = (row: Record<string, unknown>, key: string): number | null => {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Parses one raw `setupParameters[]` row. Returns `null` for a malformed entry so the editor degrades gracefully instead of crashing. */
const parseSetupParameter = (row: unknown): SetupParameter | null => {
  if (!isRecord(row)) return null
  const key = row.key
  const label = row.label
  const unit = row.unit
  const group = row.group
  const min = num(row, 'min')
  const max = num(row, 'max')
  const step = num(row, 'step')
  if (typeof key !== 'string' || key.length === 0 || typeof label !== 'string' || typeof unit !== 'string' || typeof group !== 'string' || min === null || max === null || step === null) {
    return null
  }

  return { key, label, min, max, step, unit, group }
}

/** Narrows `SprintState.setupParameters` (untyped in the shared bridge contract) for the editor. An absent or malformed field yields an empty catalog rather than a crash. */
export const parseSetupParameters = (sprint: unknown): SetupParameter[] => {
  if (!isRecord(sprint) || !Array.isArray(sprint.setupParameters)) return []
  return sprint.setupParameters.map(parseSetupParameter).filter((parameter): parameter is SetupParameter => parameter !== null)
}

export const setupParameterGroups = (parameters: readonly SetupParameter[]): Array<{ group: string; parameters: SetupParameter[] }> => {
  const groups: Array<{ group: string; parameters: SetupParameter[] }> = []
  for (const parameter of parameters) {
    const existing = groups.find((entry) => entry.group === parameter.group)
    if (existing) {
      existing.parameters.push(parameter)
    } else {
      groups.push({ group: parameter.group, parameters: [parameter] })
    }
  }

  return groups
}

export const formatSetupValue = (parameter: SetupParameter, value: number): string => {
  const decimals = parameter.step < 1 ? 1 : 0
  const formatted = decimals === 0 ? value.toFixed(0) : value.toFixed(1)
  return parameter.unit ? `${formatted} ${parameter.unit}` : formatted
}

export type SetupProgram = {
  id: string
  name: string
  isTemplate: boolean
  values: Record<string, number>
}

const str = (row: Record<string, unknown>, key: string, fallback = ''): string => {
  const value = row[key]
  return typeof value === 'string' ? value : fallback
}
const bool = (row: Record<string, unknown>, key: string, fallback = false): boolean => {
  const value = row[key]
  return typeof value === 'boolean' ? value : fallback
}

const parseValues = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) return {}
  const values: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      values[key] = raw
    }
  }

  return values
}

/** Parses one raw `setupTemplates[]`/`setupPrograms[]` row. Returns `null` for a row with no id. */
export const parseSetupProgram = (row: Record<string, unknown>): SetupProgram | null => {
  const id = str(row, 'id')
  if (!id) return null
  return {
    id,
    name: str(row, 'name', id),
    isTemplate: bool(row, 'isTemplate'),
    values: parseValues(row.values),
  }
}

export const parseSetupPrograms = (rows: ReadonlyArray<Record<string, unknown>>): SetupProgram[] =>
  rows.map(parseSetupProgram).filter((program): program is SetupProgram => program !== null)

/** The value shown/edited for a parameter: the program's stored value, or the parameter's minimum when unset. */
export const valueFor = (program: SetupProgram, parameter: SetupParameter): number => program.values[parameter.key] ?? parameter.min

export const clampToParameter = (parameter: SetupParameter, value: number): number => Math.min(parameter.max, Math.max(parameter.min, value))

export const buildSetupSave = (setupId: string, key: string, value: number): SprintCommand => ({
  type: 'setup.save',
  setupId,
  values: { [key]: value },
})

export const buildSetupDuplicate = (setupId: string): SprintCommand => ({ type: 'setup.duplicate', setupId })

export const buildSetupDelete = (setupId: string): SprintCommand => ({ type: 'setup.delete', setupId })
