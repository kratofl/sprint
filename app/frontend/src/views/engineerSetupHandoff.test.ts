import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const engineerSource = read('./Engineer.tsx')
const setupSource = read('./Controls.tsx')

test('Engineer follows the Graphite race engineer layout', () => {
  for (const text of [
    'Engineer',
    'Session status',
    'Car controls',
    'Flags',
    'Radio log',
    'Quick message',
    'Push staged changes',
  ]) {
    assert.match(engineerSource, new RegExp(text, 'i'), `${text} missing from Engineer`)
  }

  for (const primitive of ['PageHeader', 'SettingsCard', 'SettingsRow', 'StatusPill', 'KeyChip', 'Button', 'Stepper']) {
    assert.match(engineerSource, new RegExp(`\\b${primitive}\\b`), `Engineer should use shared ${primitive}`)
  }

  assert.doesNotMatch(engineerSource, /System Overview|Quick Access|FEATURES|Live Session/)
  assert.doesNotMatch(engineerSource, /\bCard(Content|Header|Title|Description)?\b/)
})

test('Setup follows the Graphite setup program layout', () => {
  for (const text of [
    'Setup',
    'Programs',
    'A/B',
    'Baseline',
    'Comparison',
    'Aero',
    'Suspension',
    'Tires',
    'Brakes',
  ]) {
    assert.match(setupSource, new RegExp(text, 'i'), `${text} missing from Setup`)
  }

  for (const primitive of ['PageHeader', 'SettingsCard', 'SettingsRow', 'Input', 'Stepper', 'SegmentedControl', 'StatusPill', 'Button']) {
    assert.match(setupSource, new RegExp(`\\b${primitive}\\b`), `Setup should use shared ${primitive}`)
  }

  assert.match(setupSource, /\bConfirmDialog\b/, 'Setup should confirm destructive deletion')
  assert.match(setupSource, /setupProgramModel/)
  assert.doesNotMatch(setupSource, /LOADING_COMMANDS|LISTENING_|CaptureNextButton|controlsAPI|CommandGroup|CommandRow/)
  assert.doesNotMatch(setupSource, /\bCard(Content|Header|Title|Description)?\b/)
})

test('Engineer stages, reverts, pushes, and logs quick messages', async () => {
  const helperSource = engineerSource.slice(
    engineerSource.indexOf('type EngineerControlKey'),
    engineerSource.indexOf('export default function Engineer'),
  )
  const helperModule = helperSource.replace(/\bexport\s+/g, '') + `
return {
  appendEngineerRadioLog,
  createEngineerState,
  pushEngineerStagedChanges,
  revertEngineerStagedChanges,
  stageEngineerControl,
}
`
  const helperScript = ts.transpileModule(helperModule, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const {
    appendEngineerRadioLog,
    createEngineerState,
    pushEngineerStagedChanges,
    revertEngineerStagedChanges,
    stageEngineerControl,
  } = new Function(helperScript)() as Record<string, any>

  let state = createEngineerState()
  state = stageEngineerControl(state, 'tcCut', 5)
  assert.equal(state.stagedValues.tcCut, 5)
  assert.equal(state.carValues.tcCut, 4)

  state = revertEngineerStagedChanges(state)
  assert.equal(state.stagedValues.tcCut, 4)
  assert.equal(state.radioLog[0].message, 'Revert')

  state = stageEngineerControl(state, 'tcCut', 6)
  state = pushEngineerStagedChanges(state)
  assert.equal(state.carValues.tcCut, 6)
  assert.equal(state.stagedValues.tcCut, 6)
  assert.equal(state.radioLog[0].message, 'Push staged changes')
  assert.match(state.radioLog[0].detail, /TC cut 4 -> 6/)

  state = appendEngineerRadioLog(state, 'PUSH NOW', 'Quick message staged to the driver radio')
  state = appendEngineerRadioLog(state, 'PUSH NOW', 'Quick message staged to the driver radio')
  assert.equal(state.radioLog[0].message, 'PUSH NOW')
  assert.notEqual(state.radioLog[0].id, state.radioLog[1].id)
})
