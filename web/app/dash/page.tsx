export default function DashEditor() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dash Editor</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Design and manage your VoCore wheel display layout.
          </p>
        </div>
        <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors">
          Save Layout
        </button>
      </div>
      <div className="surface rounded p-8 text-center min-h-[400px] flex items-center justify-center">
        <p className="text-sm text-text-muted">Dash layout editor — coming soon</p>
      </div>
    </div>
  )
}
