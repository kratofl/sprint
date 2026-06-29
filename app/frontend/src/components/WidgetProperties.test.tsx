import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import type { DashWidget } from '@/lib/dash'
import { WidgetStyleProperties } from './WidgetProperties'

const widget = (over: Partial<DashWidget> = {}): DashWidget => ({
  id: 'w',
  type: 'text',
  col: 0,
  row: 0,
  colSpan: 4,
  rowSpan: 2,
  ...over,
})

describe('WidgetStyleProperties border override', () => {
  it('forces the border off when choosing Off', () => {
    const onUpdate = vi.fn()
    const { container } = render(<WidgetStyleProperties widget={widget()} onUpdate={onUpdate} />)

    fireEvent.click(within(container).getByRole('button', { name: 'Border off' }))

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ style: expect.objectContaining({ border: false }) }),
    )
  })

  it('forces the border on when choosing On', () => {
    const onUpdate = vi.fn()
    const { container } = render(<WidgetStyleProperties widget={widget()} onUpdate={onUpdate} />)

    fireEvent.click(within(container).getByRole('button', { name: 'Border on' }))

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ style: expect.objectContaining({ border: true }) }),
    )
  })

  it('clears the override (back to the widget default) when choosing Default', () => {
    const onUpdate = vi.fn()
    const { container } = render(
      <WidgetStyleProperties widget={widget({ style: { border: false } })} onUpdate={onUpdate} />,
    )

    fireEvent.click(within(container).getByRole('button', { name: 'Border default' }))

    const updated = onUpdate.mock.calls[0][0] as DashWidget
    expect(updated.style?.border).toBeUndefined()
  })
})
