import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sprint/ui'

export default function Setups() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Setups</h1>
          <p className="text-sm text-text-secondary">
            Manage and share car setups across sessions.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm">
          Upload setup
        </Button>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Setup library</CardTitle>
          <CardDescription>
            Desktop sync and manual uploads will populate your saved setups here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">
            No setups uploaded yet. Sync from the desktop app or upload
            manually.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
