# Browser displays

A Browser / VR display is a dash device with no USB link: the host serves its dash at
`http://127.0.0.1:28780/dash/<device id>` for a VR overlay tool's web source or a browser tab. Code:
[`BrowserDisplays.cs`](../../app/Sprint.Desktop.Core/Features/Devices/BrowserDisplays.cs),
[`BrowserDisplayServer.cs`](../../app/Sprint.Desktop.Host/BrowserDisplayServer.cs) and the page in
[`app/Sprint.Desktop.Host/browser-display/`](../../app/Sprint.Desktop.Host/browser-display).

## Why it is served the way it is

- **No token, so it is a separate server.** A web source in another program is a bare URL; it
  cannot send the host's bearer token, and the token changes every launch while the URL is saved.
  So the displays get their own small Kestrel app beside the host's main one, which serves nothing
  else: no state, no commands, no device that is not a browser display.
- **Opt-in by existence.** The port is open only while at least one browser display is added and
  turned on, and closes when the last one goes. A user who never adds one has no tokenless
  listener on their PC.
- **Loopback, Host check, GET only.** It binds 127.0.0.1 and refuses a request whose `Host` is not
  `127.0.0.1` or `localhost` on its port, so a web page cannot reach it through DNS rebinding. It
  answers GET only and sends no CORS headers, so other origins cannot read the feed. Keep all three
  when changing it; any one alone is not enough.
- **A fixed port, never picked.** 28780 is pasted into the other program's settings, so it must not
  move between launches. When another program holds it, every browser display reads `Faulted`
  with the port in the reason, and the host retries every few seconds instead of moving.

## One scene path with the wheel

A browser display reads the same `DashSceneFeed` a wheel's renderer reads (built by
`ScreenOutputService`), with its own size and background, and the page draws it with the same
renderer compiled to WebAssembly (`packages/dashboard/src/dashWasm.js`, copied next to the page by
the host's build with the `.wasm`). A dash, page, target or driver-name change therefore reaches both
in the same way; do not give the page a scene or frame shape of its own.

The feed is NDJSON: a scene line when the scene changes, a frame line per new telemetry frame, an
empty line after a second of nothing so the page can tell a still dash from a dropped feed. A reader
that falls behind skips to the newest frame; nothing queues for it, so a slow VR tool cannot grow
the host's memory or delay anyone else. The page paints only when a frame or the scene changed (or
while the picture depends on time), never on a loop.
