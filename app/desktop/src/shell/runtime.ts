import type { SprintState } from '../bridge'

/**
 * Discriminated wrapper around the bridge's state. The bridge resolves
 * `getState()` asynchronously and the native host is not ready on first paint,
 * so "no data yet" is a real, renderable state rather than a null check
 * scattered through every view.
 */
export type RuntimeState = { kind: 'loading' } | { kind: 'ready'; sprint: SprintState }
