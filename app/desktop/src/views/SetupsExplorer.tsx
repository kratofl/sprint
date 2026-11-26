import { useState } from 'react'
import { Explorer, ExplorerGroup, ExplorerRow, useExpandedGroups } from '../shell/Explorer'
import { CarPicker, type PickerCar } from './CarPicker'
import { Flag } from './CarBadges'
import type { SetupItem } from './SetupsDomain'

/** One car's setups, newest first; `key` keeps a class's cars apart (an Oreca in LMP2 and in LMP2 ELMS). */
type SetupCar = PickerCar & { setups: SetupItem[] }

/** Every car the setups are for, the one saved for most recently first. */
function setupCars(setups: readonly SetupItem[]): SetupCar[] {
  const cars = new Map<string, SetupCar>()
  for (const setup of [...setups].sort((a, b) => b.savedAt.localeCompare(a.savedAt))) {
    const key = `${setup.classTag}\u0000${setup.car}`
    const car = cars.get(key) ?? { key, make: setup.make, model: setup.car, classTag: setup.classTag, count: 0, setups: [] }
    car.setups.push(setup)
    car.count = car.setups.length
    cars.set(key, car)
  }
  return [...cars.values()]
}

/**
 * Setups in the explorer: "All setups" (the list page, its search, filters and Compare), then one
 * car, picked from the car picker, its circuits and their setups. The picked car follows the open
 * setup until the driver picks another; the open setup's circuit starts opened.
 */
export function SetupsExplorer({
  setups,
  list,
  openId,
  onList,
  onOpen,
}: {
  setups: readonly SetupItem[]
  /** On the list page; neither on a setup nor on two setups compared. */
  list: boolean
  openId: string | null
  onList: () => void
  onOpen: (setupId: string) => void
}) {
  const [choice, setChoice] = useState<{ forSetup: string | null; carKey: string } | null>(null)

  const cars = setupCars(setups)
  const open = setups.find((setup) => setup.id === openId) ?? null
  const openCar = open ? cars.find((car) => car.setups.includes(open)) : undefined
  const chosen = choice && choice.forSetup === openId ? cars.find((car) => car.key === choice.carKey) : undefined
  const picked = chosen ?? openCar ?? cars[0] ?? null

  const circuits = new Map<string, SetupItem[]>()
  for (const setup of picked?.setups ?? []) circuits.set(setup.circuitId, [...(circuits.get(setup.circuitId) ?? []), setup])
  const { isOpen, toggle } = useExpandedGroups(open?.circuitId ?? null)

  return (
    <Explorer label="Setups">
      <ExplorerRow title="All setups" meta={setups.length} selected={list} onClick={onList} />
      {picked && (
        <>
          <div className="explorer-tools explorer-car">
            <CarPicker cars={cars} picked={picked} line={`${plural(picked.count, 'setup', 'setups')} · ${plural(circuits.size, 'track', 'tracks')}`} onPick={(carKey) => setChoice({ forSetup: openId, carKey })} />
          </div>
          <ExplorerGroup title="Tracks" count={circuits.size} />
          {[...circuits.values()].map((inCircuit) => {
            const circuit = inCircuit[0]
            const expanded = isOpen(circuit.circuitId)
            return (
              <div key={circuit.circuitId} role="group" aria-label={circuit.circuitName}>
                <ExplorerRow title={circuit.circuitName} lead={<Flag country={circuit.country} />} meta={inCircuit.length} expanded={expanded} onClick={() => toggle(circuit.circuitId)} />
                {expanded &&
                  inCircuit.map((setup) => (
                    <ExplorerRow
                      key={setup.id}
                      depth={1}
                      title={setup.name}
                      meta={setup.session ? <span className="chip chip-muted">{setup.session}</span> : undefined}
                      selected={setup.id === openId}
                      onClick={() => onOpen(setup.id)}
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
