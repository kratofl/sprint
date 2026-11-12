import type { LinkHealth, LinkPath, LinkPeer, LinkReachability, LinkRole, LiveLink } from '../bridge'
import type { StatusTone } from '../shell/Status'

// The Live link page's wording, apart from React. The host decides every phase change;
// this only says it in words.

const PATH_LABEL: Record<LinkPath, string> = {
  LocalNetwork: 'Same network',
  Ipv4: 'Direct over the internet',
  Ipv6: 'Direct over IPv6',
}

/** The page's status word for each phase. */
export const linkStatus = (link: LiveLink): { label: string; tone: StatusTone } => {
  switch (link.phase) {
    case 'Off':
      return { label: 'Not connected', tone: 'neutral' }
    case 'Preparing':
      return { label: 'Getting ready', tone: 'info' }
    case 'Inviting':
      return { label: 'Waiting for the reply', tone: 'info' }
    case 'Joining':
      return { label: 'Waiting for the driver', tone: 'info' }
    case 'Connecting':
      return { label: 'Connecting', tone: 'info' }
    case 'Connected':
      return { label: 'Connected', tone: 'success' }
    case 'Interrupted':
      return { label: 'Reconnecting', tone: 'warning' }
    case 'Failed':
      return { label: 'Not connected', tone: 'danger' }
    case 'Ended':
      return { label: 'Ended', tone: 'neutral' }
  }
}

/** What stands between this PC and a direct link, from the STUN answers. Null when nothing does. */
export const reachabilityWarning = (reachability: LinkReachability): { title: string; message: string } | null => {
  switch (reachability) {
    case 'Strict':
      return {
        title: 'Your router may block a direct link',
        message: 'It gives every connection its own port. If the other router does the same, the link will not connect.',
      }
    case 'LocalOnly':
      return {
        title: 'Sprint could not find your public address',
        message: 'Only a PC on your own network, or one with IPv6, can connect. A firewall may be blocking UDP.',
      }
    default:
      return null
  }
}

/**
 * When the two sides run Sprints whose links carry different things: who should update. Null
 * while they match, or before the other side's first ping says.
 */
export const versionNotice = (role: LinkRole, peer: LinkPeer | null): { title: string; message: string } | null => {
  if (!peer || peer.match === 'Same') return null
  const them = role === 'Driver' ? 'Your engineer' : 'The driver'
  const version = peer.app ? ` (${peer.app})` : ''
  if (peer.match === 'PeerNewer') return { title: `${them} runs a newer Sprint${version}`, message: 'The telemetry gets through. Update Sprint to get everything the link carries.' }
  return {
    title: `${them} runs an older Sprint${version}`,
    message: role === 'Driver' ? 'The telemetry gets through. For the rest, like the pit wall, they need to update Sprint.' : 'The telemetry gets through. The pit wall fills in once they update Sprint.',
  }
}

/** The connected link in short pieces: path, round trip, sample rate and loss. Unknown values are left out. */
export const healthParts = (health: LinkHealth): string[] => [
  PATH_LABEL[health.path],
  ...(health.roundTripMs === null ? [] : [`${health.roundTripMs} ms`]),
  `${health.sampleRate.toFixed(0)} samples/s`,
  ...(health.lossPercent === null ? [] : [`${health.lossPercent.toFixed(1)}% lost`]),
]

export const formatGear = (gear: number): string => (gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear))
