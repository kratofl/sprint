# Live link: driver to engineer, no server

The desktop streams the driver's telemetry straight to an engineer's desktop. Two people trade a
pasted invite and reply, then the two PCs talk UDP directly. Code: `app/Sprint.Desktop.Core/Features/Peer/`.
The server path ([live-telemetry.md](live-telemetry.md)) is separate and untouched.

## Why our own protocol and no WebRTC library

- SIPSorcery, the .NET WebRTC stack, adds a geographic use restriction to its BSD licence (since
  2025). Shipping it would put that restriction on Sprint. It also had a run of remotely reachable
  parser bugs in exactly the parts a data channel uses (SCTP, ICE).
- Chromium's WebRTC in Electron would work, but the connection would then live outside the host,
  which owns the data, and it would need a second fast pipe between host and renderer.
- Telemetry where only the newest sample matters does not need SCTP's reliability. Plain UDP, one
  STUN request, hole punching and AES-GCM from the .NET standard library cover it in a few hundred lines.

## Traps

- **STUN must go out on the link's own socket.** The answer is the router's mapping for that socket.
  A second socket gets a different public port and the code would point nowhere. STUN answers and
  link packets share the socket and are told apart by their first byte.
- **Mappings expire while a code waits.** Routers drop idle UDP mappings after as little as 30 s, so
  STUN is asked again every 15 s until the other code is pasted.
- **Two STUN servers on purpose.** If they report different public ports, the router maps per
  destination (`Strict`), and a direct link mostly fails. The page warns before the user tries.
- **Windows reports ICMP "port unreachable" as a receive error** (`ConnectionReset`) on the next
  read. Probing stale candidates provokes it all the time. The socket turns it off with
  `SIO_UDP_CONNRESET`, and the receive loop also skips it.
- **The codes are the credential.** Each carries an ephemeral P-256 public key, so the packets can
  only be opened by the two PCs that made the codes. Someone who can change both codes in transit
  can sit in the middle. They are trusted because the two people trade them over a chat they trust.
- **Only packets newer than the newest are opened.** That is the replay protection, and loss is
  computed from the counter gaps. Do not add reordering: a late sample is worth nothing.
- **One sample per datagram, under 1200 bytes**, so nothing is fragmented (a lost fragment loses the
  whole sample). `PeerProtocolTests` holds the size down if `LiveSample` grows.
- **The round trip leaves out Sprint's own waiting.** The worker steps every 50 ms. Datagrams are
  stamped on arrival, and a pong carries how long its ping waited, so the page shows network time.
- **There is no relay.** When neither side can be reached (both routers `Strict`, or UDP blocked),
  the link fails after 30 s by design. A relay is server work, which is the other path.
- **Windows asks for firewall access** the first time the host opens the UDP socket. Denying it
  usually still works, because replies to our own outgoing packets pass, but it is the first thing
  to check when a link never connects.

## The pit wall over the link

The engineer's pit wall (`Features/PitWall/`) gets more than samples: a board (session, field, car)
twice a second, radar ten times a second, and the shared plan and its target lap.

- **Anything bigger than a datagram is a blob** (`PeerBlobs`): deflated, base64url (JSON escapes
  nothing in it), cut into numbered parts of one `version`. Base64 with `+` and `/` would be escaped
  to six bytes each by System.Text.Json and break the 1200-byte budget.
- **The replay rule drops a part that arrives behind a newer packet**, and a lost part loses the
  version. So the plan and target are repeated (5 s, 10 s) under the same version until they change,
  and the receiver keeps the parts it has; a board is not repeated, the next one replaces it.
- **A newer version drops the one being collected.** Versions are the sender's clock in ms (or one
  more), so they keep rising across a restart of the driver's desktop.
- **Every ping says what its build's link carries**: `PeerLinkRules.Level`, not the version string,
  which dev builds share. Raise the level when one side starts needing something an older peer does
  not send; a ping without one is level 1. Both sides then say who should update, and the pit wall
  says why it stays empty. The codes keep their own version byte, for changes that break the
  exchange itself.
- **Unknown message types read as null.** That is how an older build ignores `blob` and `radar`; keep
  `PeerMessage.Deserialize` that way when adding types.
- **The plan travels as `state.plans` writes it**, with its `state.planFuel` entry as `raceFuel`, and
  the engineer passes the JSON through unparsed, so the pit wall reads the same shape the planner
  does, whatever build the driver runs. The stint tile cuts the race from `raceFuel`, never from the
  plan's own figures: the engineer has neither the driver's lap history nor their tank. A plan with no
  `raceFuel` key comes from a driver build before it (the tile says so); a plan swapped in mid-read
  goes out with `raceFuel: null`, so keep the key present whenever the plan is shared.
- **Race control, stopped cars and the pit loss are the engineer's own work**
  (`PitWallAccumulator`), from the changes between boards on the game's clock (`Elapsed`): the game
  says none of them. So an engineer who links mid-race sees only what changed since, a stop counts
  only when it was seen from its pit entry, and a full course yellow and a safety car stay one phase
  because LMU reports them as one. The order of LMU's `mSectorFlag` is read like `mSector`
  (sector 3 first); its own header is unsure, so check it the first time a yellow is live.
