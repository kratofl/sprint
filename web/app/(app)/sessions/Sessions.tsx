'use client'

import { useState } from 'react'
import { IconHistory, IconSearch } from '@tabler/icons-react'
import Page from '@/components/Page'
import SearchField from '@/components/SearchField'
import Table from '@/components/Table'
import { Card, EmptyState } from '@/components/Card'
import { sessionColumns, sessionTemplate, sessionText } from '@/components/columns'
import { drivenAt, newestFirst } from '@/lib/overview'
import type { Session } from '@/lib/records'
import { matchesQuery } from '@/lib/search'

// Session library: every synced session in one table, filtered from the toolbar search.
export default function Sessions({ sessions }: { sessions: readonly Session[] }) {
  const [query, setQuery] = useState('')
  const rows = newestFirst(sessions, drivenAt).filter((session) => matchesQuery(sessionText(session), query))

  return (
    <Page
      title="Sessions"
      trailing={<SearchField value={query} onChange={setQuery} placeholder="Search sessions" label="Search sessions" />}
    >
      <Card title="Session library" flush className="fill-row">
        <Table
          columns={sessionColumns}
          template={sessionTemplate}
          rows={rows}
          rowKey={(session) => session.id}
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
                title={`No results for “${query.trim()}”`}
                body="Check the spelling or search for a track, car or session type."
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
