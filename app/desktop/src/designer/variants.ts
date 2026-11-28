import type { DashLayout, DashVariant, DashVariantLayout, DashVariantScope } from '@sprint/dashboard'
import type { DashScope } from './dashScope'

/**
 * A dash's versions per scope (host `DashVariants`), as the designer edits them. The scope in the
 * title bar picks which version the sections show: the dash itself while nothing is picked, else
 * the scope's own variant, else the most specific broader one it inherits. The first edit in a
 * scope with no variant of its own makes one there (`editAt`), so picking a scope alone changes
 * nothing; a variant is part of its dash, never a dash of its own. Pure: no I/O.
 */

const LEVELS = ['device', 'game', 'carClass', 'car'] as const

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The designer's scope as a variant's: only its picked levels. */
export function variantScopeOf(scope: DashScope): DashVariantScope {
  const variantScope: DashVariantScope = {}
  for (const level of LEVELS) {
    const value = scope[level]
    if (value !== null) variantScope[level] = value
  }
  return variantScope
}

/** Whether a scope is the dash itself: nothing picked at any level. */
export const isDashItself = (scope: DashScope): boolean => LEVELS.every((level) => scope[level] === null)

const sameScope = (a: DashVariantScope, b: DashVariantScope): boolean =>
  LEVELS.every((level) => {
    const left = a[level]
    const right = b[level]
    return left === undefined || right === undefined ? left === right : same(left, right)
  })

// Mirrors the host's ranking: a car before its class before its game; at the same level, one for a device first, then the one naming more levels.
function rank(scope: DashVariantScope): number {
  const level = scope.car !== undefined ? 3 : scope.carClass !== undefined ? 2 : scope.game !== undefined ? 1 : 0
  const named = [scope.game, scope.carClass, scope.car].filter((value) => value !== undefined).length
  return level * 100 + (scope.device !== undefined ? 10 : 0) + named + 1
}

/** The scope's own variant: the one for exactly its levels. */
export function ownVariant(dash: DashLayout, scope: DashScope): DashVariant | null {
  const wanted = variantScopeOf(scope)
  return (dash.variants ?? []).find((variant) => sameScope(variant.scope, wanted)) ?? null
}

/** The variant a scope shows: its own, else the most specific one every level of which it picked; null is the dash itself. */
export function shownVariant(dash: DashLayout, scope: DashScope): DashVariant | null {
  let best: DashVariant | null = null
  for (const variant of dash.variants ?? []) {
    const applies = LEVELS.every((level) => {
      const wanted = variant.scope[level]
      const picked = scope[level]
      return wanted === undefined || (picked !== null && same(wanted, picked))
    })
    if (applies && (best === null || rank(variant.scope) > rank(best.scope))) best = variant
  }
  return best
}

/** A variant's content, cut from a dash as shown. */
export function variantLayoutOf(layout: DashLayout): DashVariantLayout {
  const { gridCols, gridRows, colSizes, rowSizes, pages, idlePage, lapReview, pitLimiter } = layout
  return {
    gridCols,
    gridRows,
    pages,
    ...(colSizes && { colSizes }),
    ...(rowSizes && { rowSizes }),
    ...(idlePage && { idlePage }),
    ...(lapReview && { lapReview }),
    ...(pitLimiter && { pitLimiter }),
  }
}

/** `dash` drawing `content` in place of its own; its name, category, screen, alerts, theme and variants stay. */
function withContent(dash: DashLayout, content: DashVariantLayout): DashLayout {
  const { colSizes: _colSizes, rowSizes: _rowSizes, idlePage: _idlePage, lapReview: _lapReview, pitLimiter: _pitLimiter, ...rest } = dash
  return { ...rest, ...content }
}

/** The dash as the scope shows it (`shownVariant`). */
export function shownLayout(dash: DashLayout, scope: DashScope): DashLayout {
  const variant = shownVariant(dash, scope)
  return variant ? withContent(dash, variant.layout) : dash
}

/**
 * Applies an edit to what the scope shows. With nothing picked it edits the dash itself. In a
 * scope, what the edit changed of the content goes into the scope's own variant (made now, as a
 * copy of what it inherited, when it had none); what it changed of the dash as a whole (its name,
 * say) goes to the dash. An edit that leaves the content as it was makes no variant. Null when
 * `mutate` refused it.
 */
export function editAt(dash: DashLayout, scope: DashScope, mutate: (layout: DashLayout) => DashLayout | null): DashLayout | null {
  const shown = shownLayout(dash, scope)
  const next = mutate(shown)
  if (next === null || isDashItself(scope)) return next

  const content = variantLayoutOf(next)
  const { variants: _edited, ...whole } = withContent(next, variantLayoutOf(dash))
  const variants = dash.variants ?? []
  if (JSON.stringify(content) === JSON.stringify(variantLayoutOf(shown))) return variants.length > 0 ? { ...whole, variants } : whole

  const variant: DashVariant = { scope: variantScopeOf(scope), layout: content }
  const own = ownVariant(dash, scope)
  return { ...whole, variants: own ? variants.map((candidate) => (candidate === own ? variant : candidate)) : [...variants, variant] }
}

/** The dash without the scope's own variant: the scope shows what it inherits again. */
export function dropVariant(dash: DashLayout, scope: DashScope): DashLayout {
  const own = ownVariant(dash, scope)
  if (!own) return dash
  const { variants: _variants, ...rest } = dash
  const kept = (dash.variants ?? []).filter((variant) => variant !== own)
  return kept.length > 0 ? { ...rest, variants: kept } : rest
}

const content = (layout: DashLayout): string => JSON.stringify(variantLayoutOf(layout))

/**
 * The one scope an undo or redo changed, so the designer can show it: a variant's own scope when
 * only that variant differs, the dash itself when only its own content does. Null when nothing
 * or several did.
 */
export function changedScope(before: DashLayout, after: DashLayout): DashScope | null {
  const own = (dash: DashLayout, scope: DashVariantScope): DashVariant | undefined => (dash.variants ?? []).find((variant) => sameScope(variant.scope, scope))
  const scopes = [...(before.variants ?? []), ...(after.variants ?? [])].map((variant) => variant.scope)
  const changed = scopes.filter((scope, index) => scopes.findIndex((other) => sameScope(other, scope)) === index).filter((scope) => {
    const was = own(before, scope)
    const is = own(after, scope)
    return !was || !is || JSON.stringify(was.layout) !== JSON.stringify(is.layout)
  })
  const itself = content(before) !== content(after)
  if (itself && changed.length === 0) return { device: null, game: null, carClass: null, car: null }
  if (!itself && changed.length === 1) {
    const scope = changed[0]
    return { device: scope.device ?? null, game: scope.game ?? null, carClass: scope.carClass ?? null, car: scope.car ?? null }
  }
  return null
}

/** Whether `scope` shows the same before and after a change. */
export const looksSame = (before: DashLayout, after: DashLayout, scope: DashScope): boolean => content(shownLayout(before, scope)) === content(shownLayout(after, scope))
