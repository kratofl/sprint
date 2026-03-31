export default function Engineer() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Race Engineer</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Connect to a live session to view telemetry and send commands.
          </p>
        </div>
        <span className="rounded-full bg-bg-elevated px-3 py-1 text-xs text-text-muted border border-border-base">
          Disconnected
        </span>
      </div>
      <div className="glass rounded-lg p-8 text-center">
        <p className="text-sm text-text-muted">Enter a session code or link to connect as a race engineer.</p>
        <div className="mt-4 flex justify-center">
          <input
            type="text"
            placeholder="Session code…"
            className="rounded-md bg-bg-elevated border border-border-base px-4 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-teal transition-colors w-64"
          />
        </div>
      </div>
    </div>
  )
}
