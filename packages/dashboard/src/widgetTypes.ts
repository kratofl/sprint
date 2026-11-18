// The dash widget types the editor offers. The Rust renderer draws each of them
// (renderer/src/widgets.rs `widget_content`); a Rust test reads this file and fails when the two
// lists differ, so keep the array below a plain list of string literals.

/** The dash widget catalog (`DashWidgetCatalog.cs`), in the order it is defined there. */
export const dashboardWidgetTypes = [
  'header',
  'text',
  'rpm_bar',
  'gear_speed',
  'input_trace',
  'sector',
  'lap_time',
  'delta',
  'fuel',
  'tyre_temp',
  'flag',
  'tc',
  'abs',
  'engine_map',
  'brake_bias',
  'fuel_target',
  'position',
  'gaps',
  'predictive_lap',
  'racelogic_lap_timer',
  'tyre_pressure',
  'virtual_energy',
  'battery',
  'relative',
  'damage',
  'bar',
  'tyre',
  'sectors',
  'speed',
  'laps',
  'fuel_laps',
  've_laps',
  'time_left',
  'soc',
  'slip',
  'cut',
  'fuel_avg',
  'fuel_time',
  'laps_left',
  'refuel',
  'clock',
  'weather',
  'oil_temp',
  'water_temp',
  'migration',
  'arb',
  'penalty',
  'tyre_wear',
  'sector_time',
] as const

export type DashWidgetType = (typeof dashboardWidgetTypes)[number]

const WIDGET_TYPE_SET: ReadonlySet<string> = new Set(dashboardWidgetTypes)

export function isDashWidgetType(type: string): type is DashWidgetType {
  return WIDGET_TYPE_SET.has(type)
}
