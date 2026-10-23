'use client'

import { useState } from 'react'
import { IconHistory, IconSearch } from '@tabler/icons-react'
import { DataTable } from '@/components/app/data-table'
import { FormSelect } from '@/components/app/form-select'
import { PageHeader } from '@/components/app/page-header'
import { ToolbarSearch } from '@/components/app/search-input'
import { EmptyState } from '@/components/app/states'
import { sessionColumns, sessionText } from '@/components/columns'
import { Button } from '@/components/ui/button'
import { driverFilterOptions, matchesDriver, type DriverFilter } from '@/lib/engineers'
import { drivenAt, newestFirst } from '@/lib/overview'
import type { Session } from '@/lib/records'
import { matchesQuery } from '@/lib/search'

// Session library: your sessions and those of drivers you engineer for, in one
// table card, filtered from the toolbar search and, once there is another driver,
// by driver. Each row opens the session.
export default function Sessions({ sessions, initialDriver }: { sessions: readonly Session[]; initialDriver: DriverFilter }) {
  const [query, setQuery] = useState('')
  const drivers = driverFilterOptions(sessions)
  const [driver, setDriver] = useState(drivers.some((option) => option.value === initialDriver) ? initialDriver : 'all')
  const rows = newestFirst(sessions, drivenAt).filter((session) => matchesDriver(session, driver) && matchesQuery(sessionText(session), query))

  return (
    <>
      <PageHeader
        title="Sessions"
        // Only "All drivers" and "You": nobody else to filter by.
        scope={drivers.length > 2 ? <FormSelect aria-label="Driver" value={driver} onValueChange={setDriver} options={drivers} className="min-w-40" /> : undefined}
        search={<ToolbarSearch value={query} onChange={setQuery} label="Search sessions" placeholder="Search sessions" />}
      />
      <DataTable
        title="Session library"
        columns={sessionColumns}
        rows={rows}
        rowKey={(session) => session.id}
        rowHref={(session) => `/sessions/${encodeURIComponent(session.id)}`}
        className="min-h-80"
        empty={
          sessions.length === 0 ? (
            <EmptyState
              icon={IconHistory}
              title="No sessions yet"
              body="Drive with the Sprint desktop app and your sessions appear here once they sync."
            />
          ) : (
            <EmptyState
              icon={IconSearch}
              title={query.trim() ? `No results for “${query.trim()}”` : 'No sessions for this driver'}
              body="Check the spelling, search for a track, car or session type, or pick another driver."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setDriver('all')
                  }}
                >
                  Show all sessions
                </Button>
              }
            />
          )
        }
      />
    </>
  )
}
