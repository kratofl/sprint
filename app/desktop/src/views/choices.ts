/**
 * A picker's choices: its presets, plus the value in force when settings.json holds another one, in
 * order. The HUD range (On track) and the planner's reserve (its gear) offer theirs this way, so a
 * hand-edited value still shows as selected instead of a blank picker.
 */
export const presetChoices = (presets: readonly number[], current: number): number[] =>
  presets.includes(current) ? [...presets] : [...presets, current].sort((a, b) => a - b)
