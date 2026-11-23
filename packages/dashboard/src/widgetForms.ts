// The sizes each widget is drawn for, read from `widgetForms.json` (the renderer reads the same
// file, `renderer/src/forms.rs`). A widget lists its forms largest first, each with the smallest
// box it is drawn in, at 800x480; the designer names the form a box lands in and never sizes a
// widget below its smallest form.
import table from './widgetForms.json'

/** One form: `name` and `hides` only where a widget has several (the tyre's Compact hides the brake temperature). */
export type WidgetForm = { name?: string; width: number; height: number; hides?: string }

const UNLABELLED: ReadonlySet<string> = new Set(table.unlabelled)
const UNFRAMED: ReadonlySet<string> = new Set(table.unframed)
const FORMS: ReadonlyMap<string, readonly WidgetForm[]> = new Map(Object.entries(table.types))
const DEFAULT_FORMS: readonly WidgetForm[] = table.default

/** A widget type's forms, largest first; never empty. */
export function widgetForms(type: string): readonly WidgetForm[] {
  return FORMS.get(type) ?? DEFAULT_FORMS
}

/** The form a `width` x `height` box (at 800x480) holds: the largest that fits, else the smallest (an older dash's box). */
export function formIndex(type: string, width: number, height: number): number {
  const forms = widgetForms(type)
  const index = forms.findIndex((form) => width >= form.width && height >= form.height)
  return index < 0 ? forms.length - 1 : index
}

/** A box on a `canvasWidth` x `canvasHeight` canvas, measured at 800x480 as forms are (the renderer's flat scale). */
export function referenceSize(canvasWidth: number, canvasHeight: number, box: { width: number; height: number }): { width: number; height: number } {
  const scale = Math.max(Math.min(canvasWidth / 800, canvasHeight / 480), Number.EPSILON)
  return { width: box.width / scale, height: box.height / scale }
}

/** Whether the box holds the widget's smallest form. */
export function holdsSmallest(type: string, size: { width: number; height: number }): boolean {
  const forms = widgetForms(type)
  const smallest = forms[forms.length - 1]
  return smallest === undefined || (size.width >= smallest.width - 0.5 && size.height >= smallest.height - 0.5)
}

/** Whether a widget of `type` draws a label (a bar, the gear or the four-corner tyres draw none). */
export const hasLabel = (type: string): boolean => !UNLABELLED.has(type)

/** Whether a widget of `type` draws a frame (the gear and the four-corner tyres draw none). */
export const hasFrame = (type: string): boolean => !UNFRAMED.has(type)
