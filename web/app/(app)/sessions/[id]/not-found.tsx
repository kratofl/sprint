import { IconLock } from '@tabler/icons-react'
import { listCardClass } from '@/components/app/grouped'
import { PageHeader } from '@/components/app/page-header'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'

// What /sessions/<id> and its live view show for a session the viewer may not see.
// The API answers a missing session and a hidden one alike (see loadSession), so
// this names both: an engineer whose driver hid the session or removed them lands here.
export default function SessionNotFound() {
  return (
    <>
      <PageHeader title="Session" />
      <section className={`${listCardClass} flex min-h-80 flex-col`}>
        <ErrorState
          icon={IconLock}
          title="You can’t see this session"
          body="It doesn’t exist, or its driver hid it from you or removed you as their race engineer."
          action={
            <Button asChild variant="secondary">
              <a href="/sessions">Back to sessions</a>
            </Button>
          }
        />
      </section>
    </>
  )
}
