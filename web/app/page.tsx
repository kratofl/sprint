export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your telemetry sessions, setups, and race engineer activity at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-lg p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Sessions</p>
          <p className="text-3xl font-semibold tabular">0</p>
        </div>
        <div className="glass rounded-lg p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Setups</p>
          <p className="text-3xl font-semibold tabular">0</p>
        </div>
        <div className="glass rounded-lg p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Active Engineers</p>
          <p className="text-3xl font-semibold tabular text-teal">0</p>
        </div>
      </div>

      <div className="glass rounded-lg p-6">
        <p className="text-sm text-text-muted">Recent activity will appear here once you start recording telemetry sessions.</p>
      </div>
    </div>
  )
}
