export default function Sessions() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Browse and analyze your telemetry recording sessions.
        </p>
      </div>
      <div className="glass rounded-lg p-8 text-center">
        <p className="text-sm text-text-muted">No sessions recorded yet. Start a session from the desktop app.</p>
      </div>
    </div>
  )
}
