import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { DashWidget, WidgetCatalogEntry } from '@/lib/dash'
import { DEFAULT_DASH_THEME } from '@/lib/dash/defaults'
import { WidgetPreview } from './WidgetPreview'

// Seed render tests for the vitest + jsdom path. Pattern to copy for new
// behavioral component tests: render with minimal props and assert on output,
// not on source text (that is what the *.test.ts source-guards do).

const widget = (type: string): DashWidget => ({ type }) as unknown as DashWidget

describe('WidgetPreview', () => {
  it('falls back to the widget type when the catalog has no matching entry', () => {
    const { container } = render(
      <WidgetPreview widget={widget('mystery')} theme={DEFAULT_DASH_THEME} catalog={[]} />,
    )
    expect(container.textContent).toContain('mystery')
  })

  it('renders the catalog entry name for an empty definition', () => {
    const catalog = [{ type: 'rpm', name: 'RPM Gauge', defaultDefinition: [] }] as unknown as WidgetCatalogEntry[]
    const { container } = render(
      <WidgetPreview widget={widget('rpm')} theme={DEFAULT_DASH_THEME} catalog={catalog} />,
    )
    expect(container.textContent).toContain('RPM Gauge')
  })

  it('renders placeholder values for a bound text element', () => {
    const catalog = [{
      type: 'rpm',
      name: 'RPM Gauge',
      defaultDefinition: [{ kind: 'text', binding: 'car.rpm' }],
    }] as unknown as WidgetCatalogEntry[]
    const { container } = render(
      <WidgetPreview widget={widget('rpm')} theme={DEFAULT_DASH_THEME} catalog={catalog} />,
    )
    expect(container.textContent).toContain('8 543')
  })
})
