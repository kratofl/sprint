import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sprint/ui'

export default function DashEditor() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Dash Editor</h1>
          <p className="text-sm text-text-secondary">
            Design and manage your VoCore wheel display layout.
          </p>
        </div>
        <Button type="button" size="sm">
          Save layout
        </Button>
      </div>

      <Card className="min-h-[400px]">
        <CardHeader>
          <CardTitle>Dash canvas</CardTitle>
          <CardDescription>
            Build and preview the VoCore layout that ships from the desktop app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="text-sm text-text-muted">
            Dash layout editor — coming soon
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
