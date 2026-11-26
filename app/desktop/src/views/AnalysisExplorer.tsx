import { useState } from 'react'
import { Explorer, ExplorerGroup, ExplorerRow, useExpandedGroups } from '../shell/Explorer'
import { browseCars, circuitsOf } from './AnalysisBrowseDomain'
import { formatLapSeconds, type CorpusSession } from './AnalysisDomain'
import { kindLabel, sessionTitle, sessionsIn, type ListScope } from './AnalysisSessions'
import { CarPicker } from './CarPicker'
import { Flag } from './CarBadges'
import { SessionChip } from './SessionChip'

/**
 * Analysis in the explorer: "All sessions" (the browse page) and, when someone shared laps, "Shared
 * with you"; then one car, picked from the car picker, its circuits and their sessions, newest
 * first. The picked car follows the open session until the driver picks another; the open
 * session's circuit starts opened.
 */
export function AnalysisExplorer({
  sessions,
  open,
  scope,
  onList,
  onOpen,
}: {
  sessions: readonly CorpusSession[]
  /** The open session, or null on the list. */
  open: CorpusSession | null
  scope: ListScope
  /** Shows the list of your sessions (`mine`) or of the laps shared with you. */
  onList: (scope: ListScope) => void
  onOpen: (sessionId: string) => void
}) {
  // The car the driver picked, kept per open session: opening another session shows its car again.
  const [choice, setChoice] = useState<{ forSession: string | null; carKey: string } | null>(null)

  const mine = sessionsIn(sessions, 'mine')
  const shared = sessionsIn(sessions, 'shared').length
  const cars = browseCars(mine)
  const openCar = open ? cars.find((car) => car.sessions.some((session) => session.id === open.id)) : undefined
  const chosen = choice && choice.forSession === (open?.id ?? null) ? cars.find((car) => car.key === choice.carKey) : undefined
  const picked = chosen ?? openCar ?? cars[0] ?? null
  const circuits = picked ? circuitsOf(picked.sessions) : []

  const { isOpen, toggle } = useExpandedGroups(open?.circuitId ?? null)
  const list = open === null

  return (
    <Explorer label="Sessions">
      <ExplorerRow title="All sessions" meta={mine.length} selected={list && scope === 'mine'} onClick={() => onList('mine')} />
      {shared > 0 && <ExplorerRow title="Shared with you" meta={shared} selected={list && scope === 'shared'} onClick={() => onList('shared')} />}
      {picked && (
        <>
          <div className="explorer-tools explorer-car">
            <CarPicker
              cars={cars.map((car) => ({ key: car.key, make: car.make, model: car.model, classTag: car.classTag, count: car.sessions.length }))}
              picked={{ key: picked.key, make: picked.make, model: picked.model, classTag: picked.classTag, count: picked.sessions.length }}
              line={`${plural(picked.sessions.length, 'session', 'sessions')} · ${plural(picked.circuits, 'track', 'tracks')}`}
              onPick={(carKey) => setChoice({ forSession: open?.id ?? null, carKey })}
            />
          </div>
          <ExplorerGroup title="Tracks" count={circuits.length} />
          {circuits.map((circuit) => {
            const expanded = isOpen(circuit.id)
            const best = circuit.layouts.reduce<number | null>((min, layout) => (layout.bestSeconds !== null && (min === null || layout.bestSeconds < min) ? layout.bestSeconds : min), null)
            const inCircuit = circuit.layouts.flatMap((layout) => layout.sessions).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            return (
              <div key={circuit.id} role="group" aria-label={circuit.name}>
                <ExplorerRow title={circuit.name} lead={<Flag country={circuit.country} />} meta={formatLapSeconds(best)} expanded={expanded} onClick={() => toggle(circuit.id)} />
                {expanded &&
                  inCircuit.map((session) => (
                    <ExplorerRow
                      key={session.id}
                      depth={1}
                      lead={
                        <span className="analysis-explorer-kind">
                          <SessionChip kind={kindLabel(session)} />
                        </span>
                      }
                      title={sessionTitle(session)}
                      meta={formatLapSeconds(session.bestLapSeconds)}
                      selected={session.id === open?.id}
                      onClick={() => onOpen(session.id)}
                    />
                  ))}
              </div>
            )
          })}
        </>
      )}
    </Explorer>
  )
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
