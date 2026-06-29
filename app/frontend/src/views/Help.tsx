import { KeyChip, PageHeader, SettingsCard, SettingsRow } from '@sprint/ui'

const SHORTCUTS = [
  ['Move it on the grid', 'Drag widget'],
  ['Resize to grid cells', 'Drag corner'],
  ['Add widget to the canvas', 'Double-click in library'],
  ['Remove selected widget', 'Del / Backspace'],
  ['Deselect', 'Esc'],
  ['Switch between sections', 'Header arrows'],
] as const

const GUIDE_CARDS = [
  ['Basic vs Advanced', 'Basic dashes keep fixed core slots for quick wheel screens. Advanced dashes unlock full grid placement, pages, and widget stacks.'],
  ['Pages & Idle', 'Pages are active session layouts. The Idle page is always available and renders when no session is live.'],
  ['Widget stacks', 'Stacks let one physical wheel button cycle several widget configurations inside a single canvas slot.'],
  ['Devices', 'Register screens and wheels, assign a dash, then bind hardware buttons to navigation and stack actions.'],
  ['Alert popups', 'Dash alerts are configured per dash and preview over the wheel display before they are pushed to hardware.'],
] as const

export default function Help() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <PageHeader heading="Help" caption="Reference for editor controls and dashboard concepts" />

      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsCard>
          <div className="border-b border-[var(--line)] px-3 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--text)]">Editor shortcuts</h3>
          </div>
          {SHORTCUTS.map(([label, key]) => (
            <SettingsRow key={label}>
              <div>
                <span className="font-medium text-[var(--text)]">{label}</span>
              </div>
              <KeyChip>{key}</KeyChip>
            </SettingsRow>
          ))}
        </SettingsCard>

        {GUIDE_CARDS.map(([title, body]) => (
          <SettingsCard key={title} className="p-3">
            <h3 className="text-[13px] font-semibold text-[var(--text)]">{title}</h3>
            <p className="mt-2 text-[12px] leading-5 text-[var(--text2)]">{body}</p>
          </SettingsCard>
        ))}

        <SettingsCard>
          <div className="border-b border-[var(--line)] px-3 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--text)]">About</h3>
          </div>
          <p className="px-3 py-3 text-[12px] leading-5 text-[var(--text2)]">
            Sprint Dashboards is the desktop telemetry and wheel-display editor.
          </p>
          <SettingsRow>
            <div>
              <span className="font-medium text-[var(--text)]">Version</span>
            </div>
            <KeyChip>0.4 prototype</KeyChip>
          </SettingsRow>
        </SettingsCard>
      </div>
    </div>
  )
}
