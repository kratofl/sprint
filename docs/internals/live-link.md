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
