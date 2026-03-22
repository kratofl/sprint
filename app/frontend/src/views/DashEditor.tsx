export default function DashEditor() {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dash Editor</h1>
        <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors">
          Save Layout
        </button>
      </div>

      <div className="flex flex-1 gap-4">
        {/* Canvas area */}
        <div className="glass flex flex-1 items-center justify-center rounded-lg">
          <p className="text-sm text-text-muted">Dash canvas — coming soon</p>
        </div>

        {/* Widget panel */}
        <aside className="glass w-56 rounded-lg p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">Widgets</p>
          <div className="space-y-1">
            {['Speed', 'Gear', 'RPM Bar', 'Delta', 'Fuel', 'Tyre Temp', 'Lap Time', 'Sector'].map(w => (
              <div
                key={w}
                draggable
                className="cursor-grab rounded-md px-3 py-2 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors active:cursor-grabbing"
              >
                {w}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
