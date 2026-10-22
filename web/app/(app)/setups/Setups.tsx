'use client'

import { useState } from 'react'
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import Page from '@/components/Page'
import SearchField from '@/components/SearchField'
import Table from '@/components/Table'
import { Card, EmptyState } from '@/components/Card'
import { setupColumns, setupTemplate, setupText } from '@/components/columns'
import { newestFirst } from '@/lib/overview'
import type { Setup } from '@/lib/records'
import { matchesQuery } from '@/lib/search'

// Setup bank: saved car setups in one table, filtered from the toolbar search.
export default function Setups({ setups }: { setups: readonly Setup[] }) {
  const [query, setQuery] = useState('')
  const rows = newestFirst(setups, (setup) => setup.updatedAt).filter((setup) => matchesQuery(setupText(setup), query))

  return (
    <Page
      title="Setups"
      trailing={<SearchField value={query} onChange={setQuery} placeholder="Search setups" label="Search setups" />}
    >
      <Card title="Setup bank" flush className="fill-row">
        <Table
          columns={setupColumns}
          template={setupTemplate}
          rows={rows}
          rowKey={(setup) => setup.id}
          empty={
            setups.length === 0 ? (
              <EmptyState
                icon={IconAdjustmentsHorizontal}
                title="No setups yet"
                body="Setups you save in the Sprint desktop app appear here."
              />
            ) : (
              <EmptyState
                icon={IconSearch}
                title={`No results for “${query.trim()}”`}
                body="Check the spelling or search for a setup, car or track."
                action={
                  <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>
                    Clear search
                  </button>
                }
              />
            )
          }
        />
      </Card>
    </Page>
  )
}
