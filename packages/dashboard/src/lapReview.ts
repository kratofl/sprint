// The lap review: the full-screen alert the dash shows after each timed lap (`lap_summary`). Its
// top row is fixed (the lap time and the delta to the best); below it, six cells in two rows of
// three show the fields the driver picks, stored on the layout as `lapReview.cells`. The Rust
// renderer (renderer/src/lap_summary.rs, overlays.rs) captures and draws them; this is what the
// editor offers.

/**
 * Every lap review field, by its wire id. `none` is an empty cell. A renderer test checks this
 * set and order against the Rust list.
 */
export type DashLapReviewField =
  | 'sector1' | 'sector2' | 'sector3' | 'sector1_delta' | 'sector2_delta' | 'sector3_delta' | 'target' | 'best_lap'
  | 'validity' | 'position' | 'gap_ahead' | 'lap' | 'top_speed' | 'fuel_used' | 'fuel_left' | 'energy_used' | 'energy_left'
  | 'fuel_energy_used' | 'tyre_wear' | 'none'

/** The fields an editor offers for a cell, in order, with their driver-facing names. */
export const dashLapReviewFields: readonly { id: DashLapReviewField; label: string }[] = [
  { id: 'sector1', label: 'Sector 1' },
  { id: 'sector2', label: 'Sector 2' },
  { id: 'sector3', label: 'Sector 3' },
  { id: 'sector1_delta', label: 'Sector 1 delta' },
  { id: 'sector2_delta', label: 'Sector 2 delta' },
  { id: 'sector3_delta', label: 'Sector 3 delta' },
  { id: 'target', label: 'Lap time target' },
  { id: 'best_lap', label: 'Best lap' },
  { id: 'validity', label: 'Lap validity' },
  { id: 'position', label: 'Position' },
  { id: 'gap_ahead', label: 'Gap ahead' },
  { id: 'lap', label: 'Lap' },
  { id: 'top_speed', label: 'Top speed' },
  { id: 'fuel_used', label: 'Fuel used' },
  { id: 'fuel_left', label: 'Fuel left (laps)' },
  { id: 'energy_used', label: 'VE used' },
  { id: 'energy_left', label: 'VE left (laps)' },
  { id: 'fuel_energy_used', label: 'Fuel + VE used' },
  { id: 'tyre_wear', label: 'Tyre wear' },
  { id: 'none', label: 'Empty' },
]

export const isDashLapReviewField = (value: unknown): value is DashLapReviewField => dashLapReviewFields.some((field) => field.id === value)

/** The cells of a layout that sets none, like an F1 lap recap: rows 2 and 3, left to right. */
export const DEFAULT_LAP_REVIEW_CELLS: readonly DashLapReviewField[] = ['sector1', 'sector2', 'sector3', 'position', 'fuel_used', 'target']

/**
 * The share of the screen's height the fixed top row takes; the six cells share the rest in two
 * rows of three. The renderer's `REVIEW_TOP_SHARE` (overlays.rs; a test checks they match), for
 * an editor that lays boxes over the cells.
 */
export const LAP_REVIEW_TOP_SHARE = 0.56

/** The layout's lap review (`DashLayout.lapReview`): six field ids, rows 2 and 3 left to right. Stored JSON, so read it with `lapReviewCells`. */
export interface DashLapReview { cells: string[] }

/**
 * The six cells the renderer draws for `review`: a cell that is missing or names no known field
 * is the default's cell in that place, and entries past the sixth are ignored.
 */
export function lapReviewCells(review: DashLapReview | undefined): DashLapReviewField[] {
  return DEFAULT_LAP_REVIEW_CELLS.map((fallback, i) => {
    const cell = review?.cells[i]
    return isDashLapReviewField(cell) ? cell : fallback
  })
}
