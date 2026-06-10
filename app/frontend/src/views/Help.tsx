import { PageHeader } from '@sprint/ui'

const SHORTCUTS = [
  { keys: 'ALT+1...5', description: 'Jump to the main navigation sections.' },
  { keys: 'CTRL+,', description: 'Open the global settings screen.' },
  { keys: 'Top bar', description: 'Use the back tile, page tabs, and view actions from the content topbar.' },
]

const SECTIONS = [
  ['Getting started', 'Use Dash Editor to build wheel display pages.', 'Use Devices to register supported screens and wheels.', 'Use Controls to bind hardware buttons to Sprint commands.'],
  ['Common settings', 'Open Settings from the top bar to manage updates and app-wide preferences.', 'The Sprint button in the title bar always returns you to Home.'],
] as const

export default function Help() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <PageHeader heading="Help" caption="Shortcuts and common Sprint actions" />

      <section className="space-y-[14px] p-[14px]">
        <div className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
          <h2 className="font-inter text-[13px] font-bold text-[var(--text)]">Shortcuts</h2>
          <div className="mt-[14px] space-y-[10px]">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-start justify-between gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]">
                <span className="font-saira text-[12px] tabular-nums text-[var(--orange)]">{shortcut.keys}</span>
                <span className="max-w-md text-right font-inter text-[11px] text-[var(--muted)]">
                  {shortcut.description}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-[14px] lg:grid-cols-2">
          {SECTIONS.map(([title, ...lines]) => (
            <div key={title} className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
              <h2 className="font-inter text-[13px] font-bold text-[var(--text)]">{title}</h2>
              <div className="mt-[10px] space-y-[8px]">
                {lines.map((line) => (
                  <p key={line} className="font-inter text-[11px] leading-relaxed text-[var(--muted)]">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
