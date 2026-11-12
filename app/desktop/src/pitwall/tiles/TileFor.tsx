import type { TileKind } from '../pitWallData'
import type { FrameProps, TileData } from '../tileFrame'
import { DamageTile, PressureTile, RadarTile, TyresTile } from './CarTiles'
import { FuelTile, RelativeTile, SessionTile, StintTile, TargetTile } from './RaceTiles'
import { TimingTile } from './TimingTile'
import { TracesTile } from './TracesTile'
import { TrackTile } from './TrackTile'

/** The tile for a kind. A tile is only mounted while it shows, so those that poll traces do so then. */
export function TileFor({ kind, data, frame }: { kind: TileKind; data: TileData; frame: FrameProps }) {
  switch (kind) {
    case 'session':
      return <SessionTile data={data} frame={frame} />
    case 'timing':
      return <TimingTile data={data} frame={frame} />
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
  }
}
