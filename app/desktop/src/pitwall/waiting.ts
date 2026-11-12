import type { LiveLink } from '../bridge'

/**
 * Why the pit wall has no board to show, said once above the tiles (they stay empty and quiet);
 * null once a board has arrived.
 */
export const waitingReason = (link: LiveLink): string | null => {
  switch (link.phase) {
    case 'Connected':
    case 'Interrupted':
      if (link.role !== 'Engineer') return 'This PC drives: the pit wall fills in on the engineer’s PC.'
      if (link.pitWall) return null
      return link.phase === 'Interrupted' ? 'The link dropped: it picks up again on its own.' : 'Linked: the board shows once the driver is in a session.'
    case 'Off':
      return 'Not linked: link from the Live link page.'
    case 'Failed':
    case 'Ended':
      return 'The link ended: link again from the Live link page.'
    case 'Preparing':
    case 'Inviting':
    case 'Joining':
    case 'Connecting':
      return 'Linking: the board shows once the link is up.'
  }
}
