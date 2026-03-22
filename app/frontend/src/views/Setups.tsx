import { useState } from 'react'

const MOCK_SETUPS = [
  { id: '1', name: 'Monza Quali',     car: 'Ferrari 499P',  track: 'Monza' },
  { id: '2', name: 'Spa Race',        car: 'Ferrari 499P',  track: 'Spa-Francorchamps' },
  { id: '3', name: 'Le Mans Default', car: 'Ferrari 499P',  track: 'La Sarthe' },
]

export default function Setups() {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Setups</h1>
        <button className="rounded-md border border-border-glass px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors">
          + New Setup
        </button>
      </div>

      <div className="glass rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-solid text-xs text-text-muted">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Car</th>
              <th className="px-4 py-3 text-left font-medium">Track</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {MOCK_SETUPS.map(s => (
              <tr
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={[
                  'cursor-pointer border-b border-border-solid/50 transition-colors last:border-0',
                  selected === s.id
                    ? 'bg-accent/10 text-text-primary'
                    : 'hover:bg-bg-elevated text-text-secondary',
                ].join(' ')}
              >
                <td className="px-4 py-3 font-medium text-text-primary">{s.name}</td>
                <td className="px-4 py-3 tabular">{s.car}</td>
                <td className="px-4 py-3 tabular">{s.track}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-text-muted hover:text-accent transition-colors">
                    Load
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
