import { IconCloudOff } from '@tabler/icons-react'
import Page from './Page'
import { EmptyState } from './Card'

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

// Page body for a loader that came back `unavailable`: one card with an error
// state, deliberately unlike the "nothing synced yet" empty states.
export default function Unavailable({ title, heading, message, retryHref }: UnavailableProps) {
  return (
    <Page title={title}>
      <section className="card fill-row">
        <EmptyState
          tone="error"
          icon={IconCloudOff}
          title={heading}
          body={message}
          action={
            <a href={retryHref} className="btn btn-secondary">
              Try again
            </a>
          }
        />
      </section>
    </Page>
  )
}
