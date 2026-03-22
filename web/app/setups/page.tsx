export default function Setups() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Setups</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage and share car setups across sessions.
          </p>
        </div>
        <button className="rounded-md border border-border-glass px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors">
          + Upload Setup
        </button>
      </div>
      <div className="glass rounded-lg p-8 text-center">
        <p className="text-sm text-text-muted">No setups uploaded yet. Sync from the desktop app or upload manually.</p>
      </div>
    </div>
  )
}
