import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@sprint/ui'

export default function Engineer() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Race Engineer</h1>
          <p className="text-sm text-text-secondary">
            Connect to a live session to view telemetry and send commands.
          </p>
        </div>
        <Badge variant="neutral">Disconnected</Badge>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Join live session</CardTitle>
          <CardDescription>
            Enter a session code or shared link to connect as a race engineer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label
              htmlFor="session-code"
              className="text-xs text-text-muted"
            >
              Session code or link
            </label>
            <Input
              id="session-code"
              type="text"
              placeholder="Session code…"
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
