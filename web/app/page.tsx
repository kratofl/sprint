import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sprint/ui'

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          Your telemetry sessions, setups, and race engineer activity at a glance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Recorded telemetry sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold font-mono tabular-nums">0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setups</CardTitle>
            <CardDescription>Saved car configuration files.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold font-mono tabular-nums">0</p>
          </CardContent>
        </Card>

        <Card variant="secondary">
          <CardHeader>
            <CardTitle>Active engineers</CardTitle>
            <CardDescription>Connected live collaborators.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold font-mono tabular-nums text-secondary">
              0
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Latest sync, session, and engineer events appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">
            Recent activity will appear here once you start recording telemetry
            sessions.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
