'use client'

import { useState } from 'react'
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import { DataTable } from '@/components/app/data-table'
import { PageHeader } from '@/components/app/page-header'
import { ToolbarSearch } from '@/components/app/search-input'
import { EmptyState } from '@/components/app/states'
import { setupColumns, setupText } from '@/components/columns'
import { Button } from '@/components/ui/button'
import { newestFirst } from '@/lib/overview'
import type { Setup } from '@/lib/records'
import { matchesQuery } from '@/lib/search'

// Setup bank: saved car setups in one table card, filtered from the toolbar search.
export default function Setups({ setups }: { setups: readonly Setup[] }) {
  const [query, setQuery] = useState('')
  const rows = newestFirst(setups, (setup) => setup.updatedAt).filter((setup) => matchesQuery(setupText(setup), query))

  return (
    <>
      <PageHeader title="Setups" search={<ToolbarSearch value={query} onChange={setQuery} label="Search setups" placeholder="Search setups" />} />
      <DataTable
        title="Setup bank"
        columns={setupColumns}
        rows={rows}
        rowKey={(setup) => setup.id}
        className="min-h-80"
        empty={
          setups.length === 0 ? (
            <EmptyState icon={IconAdjustmentsHorizontal} title="No setups yet" body="Setups you save in the Sprint desktop app appear here." />
          ) : (
            <EmptyState
              icon={IconSearch}
              title={`No results for “${query.trim()}”`}
              body="Check the spelling or search for a setup, car or track."
              action={
                <Button variant="secondary" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          )
        }
      />
    </>
  )
}
