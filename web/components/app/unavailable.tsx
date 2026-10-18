import { PageHeader } from '@/components/app/page-header'
import { ErrorState } from '@/components/app/states'
import { listCardClass } from '@/components/app/grouped'
import { Button } from '@/components/ui/button'

type UnavailableProps = {
  // The page's toolbar title, kept so the user still knows where they are.
  title: string
  // What failed to load, in a sentence: "Couldn’t load your sessions".
  heading: string
  // The loader's message, e.g. "Can’t reach the Sprint API."
  message: string
  // The page's own path; "Try again" reloads it.
  retryHref: string
}

// Page body for a loader that came back `unavailable`: one card with the error
// state, deliberately unlike the "nothing synced yet" empty states.
export function Unavailable({ title, heading, message, retryHref }: UnavailableProps) {
  return (
    <>
      <PageHeader title={title} />
      <section className={`${listCardClass} flex min-h-80 flex-col`}>
        <ErrorState
          title={heading}
          body={message}
          action={
            <Button asChild variant="secondary">
              <a href={retryHref}>Try again</a>
            </Button>
          }
        />
      </section>
    </>
  )
}
