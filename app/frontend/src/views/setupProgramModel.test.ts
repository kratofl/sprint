import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BASELINE_SETUP_ID,
  createSetupProgramCopy,
  deleteSetupProgram,
  getComparedSetup,
  getSetupDifferenceRows,
  getSetupPrediction,
  SETUP_DEFAULTS,
  updateSetupParam,
} from './setupProgramModel.ts'

test('setup predictions reward lower drag and lower fuel load', () => {
  const baseline = SETUP_DEFAULTS.find(setup => setup.id === BASELINE_SETUP_ID)
  assert.ok(baseline)

  const quicker = updateSetupParam(
    updateSetupParam(baseline, 'rearWing', baseline.params.rearWing - 2),
    'fuelLoad',
    baseline.params.fuelLoad - 30,
  )

  assert.ok(getSetupPrediction(quicker).lapTime < getSetupPrediction(baseline).lapTime)
})

test('setup copy creates a selected editable duplicate without mutating source', () => {
  const source = SETUP_DEFAULTS[0]
  const copy = createSetupProgramCopy(source, 'copy-1')

  assert.equal(copy.id, 'copy-1')
  assert.equal(copy.name, `${source.name} copy`)
  assert.deepEqual(copy.params, source.params)
  assert.notEqual(copy.params, source.params)
})

test('deleteSetupProgram keeps at least one setup and returns the next selected id', () => {
  const result = deleteSetupProgram(SETUP_DEFAULTS, SETUP_DEFAULTS[0].id)

  assert.equal(result.programs.length, SETUP_DEFAULTS.length - 1)
  assert.equal(result.selectedId, SETUP_DEFAULTS[1].id)

  const single = deleteSetupProgram([SETUP_DEFAULTS[0]], SETUP_DEFAULTS[0].id)
  assert.equal(single.programs.length, 1)
  assert.equal(single.selectedId, SETUP_DEFAULTS[0].id)
})

test('comparison chooses a different setup and reports changed fields', () => {
  const selected = SETUP_DEFAULTS[0]
  const compared = getComparedSetup(SETUP_DEFAULTS, selected.id, selected.id)
  assert.notEqual(compared.id, selected.id)

  const rows = getSetupDifferenceRows(selected, compared)
  assert.ok(rows.length > 0)
  assert.ok(rows.some(row => row.group === 'Aero'))
  assert.ok(rows.every(row => row.a !== row.b))
})

test('setup program interactions duplicate and confirm destructive deletion', async () => {
  const {
    cancelDeleteSetupProgram,
    confirmDeleteSetupProgram,
    createSetupProgramState,
    duplicateSelectedSetupProgram,
    requestDeleteSetupProgram,
  } = await import('./setupProgramModel.ts') as Record<string, any>

  let state = createSetupProgramState()
  state = duplicateSelectedSetupProgram(state, 'copy-1')
  assert.equal(state.programs.length, SETUP_DEFAULTS.length + 1)
  assert.equal(state.selectedId, 'copy-1')

  state = requestDeleteSetupProgram(state)
  assert.equal(state.programs.length, SETUP_DEFAULTS.length + 1)
  assert.equal(state.pendingDeleteId, 'copy-1')

  state = cancelDeleteSetupProgram(state)
  assert.equal(state.programs.length, SETUP_DEFAULTS.length + 1)
  assert.equal(state.pendingDeleteId, null)

  state = requestDeleteSetupProgram(state)
  state = confirmDeleteSetupProgram(state)
  assert.equal(state.programs.length, SETUP_DEFAULTS.length)
  assert.equal(state.selectedId, BASELINE_SETUP_ID)
  assert.equal(state.pendingDeleteId, null)
})

test('setup program interactions protect the last setup from deletion', async () => {
  const {
    confirmDeleteSetupProgram,
    createSetupProgramState,
    requestDeleteSetupProgram,
  } = await import('./setupProgramModel.ts') as Record<string, any>

  let state = createSetupProgramState([SETUP_DEFAULTS[0]])
  state = requestDeleteSetupProgram(state)
  assert.equal(state.pendingDeleteId, null)

  state = confirmDeleteSetupProgram({
    ...state,
    pendingDeleteId: SETUP_DEFAULTS[0].id,
  })
  assert.equal(state.programs.length, 1)
  assert.equal(state.selectedId, SETUP_DEFAULTS[0].id)
})

test('setup program interactions rename and switch A/B comparison target', async () => {
  const {
    createSetupProgramState,
    getSelectedSetupProgram,
    renameSelectedSetupProgram,
    selectSetupProgram,
    setSetupProgramMode,
  } = await import('./setupProgramModel.ts') as Record<string, any>

  let state = createSetupProgramState()
  state = renameSelectedSetupProgram(state, '  Sprint Race  ')
  assert.equal(getSelectedSetupProgram(state).name, 'Sprint Race')

  state = renameSelectedSetupProgram(state, '   ')
  assert.equal(getSelectedSetupProgram(state).name, 'Sprint Race')

  state = setSetupProgramMode(state, 'comparison')
  state = selectSetupProgram(state, SETUP_DEFAULTS[1].id)
  assert.equal(state.selectedId, BASELINE_SETUP_ID)
  assert.equal(state.comparedId, SETUP_DEFAULTS[1].id)

  state = setSetupProgramMode(state, 'edit')
  state = selectSetupProgram(state, SETUP_DEFAULTS[2].id)
  assert.equal(state.selectedId, SETUP_DEFAULTS[2].id)
})
