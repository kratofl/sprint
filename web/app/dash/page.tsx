import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@sprint/ui'

const widgets = [
  'LAP_DELTA',
  'GEAR',
  'RPM_BAR',
  'SHIFT_LIGHTS',
  'FUEL_REMAINING',
  'TIRE_TEMP',
]

const properties = [
  ['SCREEN_TARGET', 'VoCore M-PRO'],
  ['CANVAS', '800 × 480'],
  ['ACTIVE_LAYOUT', 'GT3_NIGHT_STINT'],
  ['BRIGHTNESS', '82%'],
]

export default function DashEditor() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        heading="DASH_EDITOR"
        caption="Compose VoCore wheel layouts before the desktop app pushes them to hardware."
        actions={(
          <>
            <Badge variant="tertiary">VOCore_M-PRO</Badge>
            <Button type="button" size="sm">SAVE_LAYOUT</Button>
          </>
        )}
      />

      <div className="flex-1 px-6 py-6">
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
          <Card size="sm" className="min-h-[560px]">
            <CardHeader>
              <CardTitle>WIDGET_PALETTE</CardTitle>
              <CardDescription>Drag-capable modules available for the active dash.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {widgets.map((widget, index) => (
                <div
                  key={widget}
                  className="flex items-center justify-between rounded-sm border border-border bg-bg-elevated/70 px-3 py-2"
                >
                  <span className="terminal-header text-[10px] font-bold text-foreground">
                    {widget}
                  </span>
                  <Badge variant={index < 2 ? 'default' : 'outline'}>READY</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card size="sm" className="min-h-[560px]">
            <CardHeader>
              <CardTitle>DASH_CANVAS</CardTitle>
              <CardDescription>Preview the on-wheel HUD at the panel aspect ratio.</CardDescription>
            </CardHeader>
            <CardContent className="flex h-full items-center justify-center py-6">
              <div className="flex w-full max-w-[760px] flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="terminal-header text-[10px] font-bold text-text-muted">
                    LIVE_PREVIEW
                  </span>
                  <Badge variant="secondary">30HZ_TARGET</Badge>
                </div>
                <div className="surface-elevated aspect-[5/3] w-full p-5">
                  <div className="flex h-full flex-col justify-between">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                      <div>
                        <p className="terminal-header text-[10px] font-bold text-text-muted">DELTA</p>
                        <p className="mt-1 text-3xl font-bold font-mono tabular-nums text-secondary">
                          -0.184
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="terminal-header text-[10px] font-bold text-text-muted">GEAR</p>
                        <p className="mt-1 text-5xl font-bold font-mono tabular-nums text-foreground">5</p>
                      </div>
                      <div className="text-right">
                        <p className="terminal-header text-[10px] font-bold text-text-muted">FUEL</p>
                        <p className="mt-1 text-3xl font-bold font-mono tabular-nums text-foreground">
                          32.4L
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="h-3 w-full bg-bg-base">
                        <div className="h-full w-[78%] bg-primary" />
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {['LF 84', 'RF 86', 'LR 82', 'RR 83'].map((corner) => (
                          <div
                            key={corner}
                            className="rounded-sm border border-border bg-bg-base/80 px-2 py-1 text-center"
                          >
                            <p className="status-readout text-[10px] text-text-muted">{corner}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card size="sm" className="min-h-[560px]">
            <CardHeader>
              <CardTitle>PROPERTIES</CardTitle>
              <CardDescription>Selected layout and output target metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {properties.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-sm border border-border bg-bg-elevated/70 px-3 py-2"
                >
                  <p className="terminal-header text-[10px] font-bold text-text-muted">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
                </div>
              ))}
              <Button variant="secondary" size="sm" className="mt-2 w-full justify-start">
                PUSH_TO_WHEEL
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
