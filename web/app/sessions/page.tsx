import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sprint/ui'

export default function Sessions() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="text-sm text-text-secondary">
          Browse and analyze your telemetry recording sessions.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Session library</CardTitle>
          <CardDescription>
            Review recorded laps, compare runs, and revisit saved telemetry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">
            No sessions recorded yet. Start a session from the desktop app.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
