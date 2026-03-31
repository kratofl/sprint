import { useState } from 'react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LapTime, Separator } from '@sprint/ui'

export default function EngineerStatus() {
  const [connected] = useState(false)

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Race Engineer</h1>
        <Badge
            variant="outline"
            className={connected
              ? 'border-teal/30 bg-teal/15 text-teal'
              : 'border-border-base bg-bg-elevated text-text-muted'}
          >
            {connected ? 'Engineer Online' : 'No Engineer'}
          </Badge>
      </div>

      {/* Connection info */}
      <Card>
        <CardHeader className="border-b border-border-base">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Connection</CardTitle>
        </CardHeader>
        <Separator className="bg-border-glass" />
        <CardContent className="pt-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Local address</span>
              <span className="tabular text-text-primary font-mono text-xs">ws://192.168.1.x:9090</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Engineers connected</span>
              <span className="tabular text-text-primary">0</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Target lap */}
      <Card>
        <CardHeader className="border-b border-border-base">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Delta Target</CardTitle>
        </CardHeader>
        <Separator className="bg-border-glass" />
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <LapTime seconds={undefined} className="text-2xl font-semibold text-teal" />
            <Button variant="outline" size="sm" className="border-teal/30 text-teal hover:bg-teal/10 hover:text-teal">
              Clear Target
            </Button>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Press the target button on the wheel to set from last valid lap.
          </p>
        </CardContent>
      </Card>

      {/* Message log */}
      <Card className="flex-1">
        <CardHeader className="border-b border-border-base">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Engineer Messages</CardTitle>
        </CardHeader>
        <Separator className="bg-border-glass" />
        <CardContent className="pt-4">
          <div className="space-y-1 text-xs text-text-muted italic">
            <p>No messages yet.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
