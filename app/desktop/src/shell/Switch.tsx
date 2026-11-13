/**
 * Fluent ToggleSwitch: applies immediately. "On"/"Off" sits to its left unless the row around it
 * already says what it switches (`stateText={false}`); then it needs an `aria-label` instead.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  stateText = true,
  ...labels
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  stateText?: boolean
} & ({ 'aria-labelledby': string; 'aria-describedby'?: string } | { 'aria-label': string })) {
  const control = (
    <button type="button" role="switch" aria-checked={checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)} {...labels}>
      <span className="switch-knob" />
    </button>
  )
  if (!stateText) return control
  return (
    <span className="switch-field">
      <span className="switch-state" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      {control}
    </span>
  )
}
