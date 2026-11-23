import type { TileKind } from '../pitWallData'
import type { TimingColumn } from '../timingColumns'
import type { FrameProps, TileData } from '../tileFrame'
import { DamageTile, PressureTile, RadarTile, TyresTile } from './CarTiles'
import { PitStopTile, RaceControlTile } from './ControlTiles'
import { RadioTile, WindowsTile } from './EngineerTiles'
import { FuelTile, RelativeTile, SessionTile, StintTile, TargetTile } from './RaceTiles'
import { TimingTile } from './TimingTile'
import { TracesTile } from './TracesTile'
import { TrackTile } from './TrackTile'

/**
 * The tile for a kind, with its slot's settings (`timingColumns` for the timing tile). A tile is
 * only mounted while it shows, so those that poll traces do so then.
 */
export function TileFor({ kind, data, frame, timingColumns }: { kind: TileKind; data: TileData; frame: FrameProps; timingColumns: readonly TimingColumn[] }) {
  switch (kind) {
    case 'session':
      return <SessionTile data={data} frame={frame} />
    case 'timing':
      return <TimingTile data={data} frame={frame} columns={timingColumns} />
    case 'track':
      return <TrackTile data={data} frame={frame} />
    case 'stint':
      return <StintTile data={data} frame={frame} />
    case 'fuel':
      return <FuelTile data={data} frame={frame} />
    case 'relative':
      return <RelativeTile data={data} frame={frame} />
    case 'target':
      return <TargetTile data={data} frame={frame} />
    case 'tyres':
      return <TyresTile data={data} frame={frame} />
    case 'pressure':
      return <PressureTile data={data} frame={frame} />
    case 'damage':
      return <DamageTile data={data} frame={frame} />
    case 'radar':
      return <RadarTile data={data} frame={frame} />
    case 'traces':
      return <TracesTile data={data} frame={frame} />
    case 'control':
      return <RaceControlTile data={data} frame={frame} />
    case 'pitstop':
      return <PitStopTile data={data} frame={frame} />
    case 'radio':
      return <RadioTile data={data} frame={frame} />
    case 'windows':
      return <WindowsTile data={data} frame={frame} />
  }
}
