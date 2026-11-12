import type { LiveLink } from '../bridge'

/** What the wall says above its empty tiles: a title, the reason, and whether something needs doing. */
export type Waiting = { title: string; reason: string; tone: 'info' | 'warning' }

const waitingFor = (reason: string): Waiting => ({ title: 'Waiting for the driver', reason, tone: 'info' })

/**
 * Why the pit wall has no board to show, said once above the tiles (they stay empty and quiet);
 * null once a board has arrived.
 */
export const waiting = (link: LiveLink): Waiting | null => {
  switch (link.phase) {
    case 'Connected':
    case 'Interrupted':
      if (link.role !== 'Engineer') return waitingFor('This PC drives: the pit wall fills in on the engineer’s PC.')
      if (link.pitWall) return null
      // A driver's build before the pit wall streams telemetry but never sends a board.
      if (link.peer?.match === 'PeerOlder') {
        return { title: 'The driver’s Sprint is too old for the pit wall', reason: 'The telemetry gets through. The pit wall fills in once they update Sprint.', tone: 'warning' }
      }
      return waitingFor(link.phase === 'Interrupted' ? 'The link dropped: it picks up again on its own.' : 'Linked: the board shows once the driver is in a session.')
    case 'Off':
      return waitingFor('Not linked: link from the Live link page.')
    case 'Failed':
    case 'Ended':
      return waitingFor('The link ended: link again from the Live link page.')
    case 'Preparing':
    case 'Inviting':
    case 'Joining':
    case 'Connecting':
      return waitingFor('Linking: the board shows once the link is up.')
  }
}
