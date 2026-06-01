import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@sprint/ui'

const SHORTCUTS = [
  { keys: 'ALT+1…5', description: 'Jump to the main navigation sections.' },
  { keys: 'CTRL+,', description: 'Open the global settings screen.' },
  { keys: 'Top bar', description: 'Use back, forward, and sidebar controls from the window header.' },
]

const SECTIONS = [
  {
    title: 'Getting started',
    lines: [
      'Use Dash Editor to build wheel display pages.',
      'Use Devices to register supported screens and wheels.',
      'Use Controls to bind hardware buttons to Sprint commands.',
    ],
  },
  {
    title: 'Common settings',
    lines: [
      'Open Settings from the top bar to manage updates and app-wide preferences.',
      'The Sprint button in the title bar always returns you to Home.',
    ],
  },
]

export default function Help() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <PageHeader
        heading="Help"
        caption="Shortcuts and common Sprint actions"
      />

      <div className="flex flex-1 flex-col gap-6 px-6 py-6">
        <Card size="sm" className="gap-0 py-0">
          <CardHeader className="border-b border-border px-4 py-2.5">
            <CardTitle className="text-foreground">Shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 py-4">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-start justify-between gap-4">
                <span className="font-mono text-[10px] text-foreground">{shortcut.keys}</span>
                <span className="max-w-md text-right font-mono text-[10px] text-text-muted">
                  {shortcut.description}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {SECTIONS.map((section) => (
            <Card key={section.title} size="sm" className="gap-0 py-0">
              <CardHeader className="border-b border-border px-4 py-2.5">
                <CardTitle className="text-foreground">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 py-4">
                {section.lines.map((line) => (
                  <p key={line} className="font-mono text-[10px] leading-relaxed text-text-muted">
                    {line}
                  </p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
