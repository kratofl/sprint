import { useRef, useState } from 'react'
import { ChevronDown, Clock } from 'lucide-react'
import { Popover } from '../shell/Menu'
import { classSections, recentCars } from './AnalysisBrowseDomain'
import { ClassTag, MakerLogo } from './CarBadges'
import { classTone } from '../carMarks'
import './CarPicker.css'

/** A car to pick: what it is and how many of the page's items it has (sessions, setups). */
export type PickerCar = { key: string; make: string | null; model: string; classTag: string; count: number }

/**
 * The car an explorer shows (Analysis, Setups): the picked car as a button, its logo, name and
 * `line` ("3 sessions · 1 track"). It opens the cars as a popover: a search, the newest few under
 * Recent, then every car by class. `cars` comes most recently driven first.
 */
export function CarPicker({ cars, picked, line, onPick }: { cars: readonly PickerCar[]; picked: PickerCar; line: string; onPick: (key: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<{ left: number; top: number; width: number } | null>(null)
  const [search, setSearch] = useState('')

  const close = () => {
    setOpen(null)
    setSearch('')
    buttonRef.current?.focus()
  }
  const pick = (key: string) => {
    onPick(key)
    close()
  }
  const query = search.trim().toLowerCase()
  const matching = query ? cars.filter((car) => `${car.model} ${car.classTag}`.toLowerCase().includes(query)) : cars
  const recent = query ? [] : recentCars(matching)

  const row = (car: PickerCar, tagged: boolean) => (
    <button key={`${tagged ? 'recent' : 'class'}:${car.key}`} type="button" className={car.key === picked.key ? 'list-row car-picker-row selected' : 'list-row car-picker-row'} onClick={() => pick(car.key)}>
      <MakerLogo make={car.make} small />
      <span className="car-picker-name">{car.model}</span>
      {tagged ? <ClassTag tag={car.classTag} /> : <span className="car-picker-count tabular">{car.count}</span>}
    </button>
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="car-picker"
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        onClick={() => {
          const box = buttonRef.current?.getBoundingClientRect()
          if (box) setOpen({ left: box.left, top: box.bottom + 4, width: Math.max(box.width + 40, 300) })
        }}
      >
        <MakerLogo make={picked.make} />
        <span className="car-picker-text">
          <span className="car-picker-name">{picked.model}</span>
          <span className="car-picker-line">{line}</span>
        </span>
        <ClassTag tag={picked.classTag} />
        <ChevronDown className="car-picker-chevron" aria-hidden="true" />
      </button>
      {open && (
        <Popover
          label="Cars"
          className="car-picker-flyout"
          style={{ left: open.left, top: open.top, width: open.width, maxHeight: window.innerHeight - open.top - 12 }}
          onClose={close}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement && matching[0]) pick(matching[0].key)
          }}
        >
          <input className="input" placeholder="Find a car" aria-label="Find a car" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="car-picker-list">
            {recent.length > 0 && (
              <>
                <div className="car-picker-caption">
                  <Clock aria-hidden="true" /> Recent
                </div>
                {recent.map((car) => row(car, true))}
              </>
            )}
            {classSections(matching, (car) => car.count).map((section) => (
              <div key={section.tag} className={classTone(section.tag)}>
                <div className="car-picker-caption">
                  <ClassTag tag={section.tag} />
                  {section.name}
                </div>
                {section.cars.map((car) => row(car, false))}
              </div>
            ))}
            {matching.length === 0 && <p className="car-picker-none">No car matches.</p>}
          </div>
        </Popover>
      )}
    </>
  )
}
