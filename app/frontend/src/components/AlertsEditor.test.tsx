import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import type { AlertConfig, AlertMeta } from '@/lib/dash'
import { AlertsEditor } from './AlertsEditor'

const catalog: AlertMeta[] = [
  { type: 'tc_change', label: 'TC1 Change', description: 'TC1 setting changed', defaultColor: 'tc' },
  { type: 'abs_change', label: 'ABS Change', description: 'ABS setting changed', defaultColor: 'abs' },
]

const baseConfig: AlertConfig = { displayMode: 'full', colorMode: 'normal', duration: 1.5, enabledTypes: [] }

describe('AlertsEditor', () => {
  it('enables an alert type when its tile toggle is clicked', () => {
    const onChange = vi.fn()
    const { container } = render(<AlertsEditor config={baseConfig} catalog={catalog} onChange={onChange} />)

    fireEvent.click(within(container).getByRole('button', { name: 'Toggle TC1 Change' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabledTypes: ['tc_change'] }),
    )
  })

  it('disables an already-enabled alert type', () => {
    const onChange = vi.fn()
    const { container } = render(
      <AlertsEditor config={{ ...baseConfig, enabledTypes: ['tc_change'] }} catalog={catalog} onChange={onChange} />,
    )

    fireEvent.click(within(container).getByRole('button', { name: 'Toggle TC1 Change' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabledTypes: [] }),
    )
  })

  it('switches the shared display mode to Middle', () => {
    const onChange = vi.fn()
    const { container } = render(<AlertsEditor config={baseConfig} catalog={catalog} onChange={onChange} />)

    fireEvent.click(within(container).getByRole('button', { name: 'Middle' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ displayMode: 'middle' }))
  })

  it('switches the shared color mode to Inverted', () => {
    const onChange = vi.fn()
    const { container } = render(<AlertsEditor config={baseConfig} catalog={catalog} onChange={onChange} />)

    fireEvent.click(within(container).getByRole('button', { name: 'Inverted' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ colorMode: 'inverted' }))
  })
})
