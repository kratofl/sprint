# Driving guide: an AR line and brake boards

Draws a reference lap into the driver's view: a ribbon on the road coloured by what the pedals did
(throttle, coast, brake), and boards where that lap started braking. Each is a setting of its own.
Two outputs show it: a VR headset through an OpenXR API layer, and a monitor through a transparent
click-through window over the game.

Code: `app/Sprint.Desktop.Core/Features/DrivingGuide/` (the geometry, the lap choice, the settings),
`app/Sprint.Desktop.Host/DrivingGuide/` (the shared-memory feed, the stream, layer registration),
`app/desktop/src/guide/` (the monitor overlay), `app/Sprint.OpenXrLayer/` (the VR layer).

## The lap

- The guide draws one lap: the fastest valid lap with a world-position trace on the current game,
  track and car, else on the same track with any car. It is chosen when the track or car changes
  and again on every lap crossing, so a new best becomes the guide one lap later (the recorder
  files a lap only once its time arrives).
- It is never the Live Compare target or the plan target. Those can be time-only; the guide needs
  positions.
- World positions are trace channels (`worldX`, `worldY`, `worldZ`). Laps recorded before the
  channels existed cannot be a guide and are skipped, not errors.

## One frame for every consumer

`CarPose` in `Sprint.Desktop.Api` is game-neutral: right-handed, +Y up, body +X right / +Y up /
-Z forward (OpenXR's convention), and the quaternion rotates body into world. The LMU mapper is the
only place that knows LMU is left-handed with +X left and +Z back: it mirrors X on both frames
(`R = F·Rₗ·F`, `F = diag(-1, 1, 1)`), and angular velocity, a pseudovector, becomes `-F·ω`.
`CarState.PositionX/Y/Z` stay in the game's own frame because the track map reads them.

The host checks the convention live: while the car moves, it logs when the heading derived from
the orientation disagrees with the direction of travel. A wrong row/column reading of LMU's
`mOri` would show as exactly that, and nobody can see it without a headset.

## From world to the driver's eye

Both renderers do the same thing, in this order; the TypeScript (`guideProjection.ts`) and the C++
(`guide_math.h`) must agree.

1. Extrapolate the pose by `dt` (clamped to 0–100 ms): position `+= q·v·dt`, orientation
   `q ⊗ exp(ω·dt/2)` with `ω` in the body frame. Telemetry arrives slower than the display
   refreshes; without this the line swims in corners. VR extrapolates to the QPC time of
   `xrBeginFrame`, because that is roughly when the game sampled its own physics for the frame.
   The monitor extrapolates to now.
2. Body: `b = q⁻¹·(w − p)`.
3. Seat: `s = Rx(pitch)·Ry(−yaw)·(b − e)`, with `e = (right, up, −forward)` from the calibration.
   Positive yaw turns the guide right, positive pitch raises it.
4. VR: `s` is in the game's own reference space, since LMU fixes that space to the seat when the
   driver resets the view. The layer renders with the game's own submitted view poses and FOVs,
   so it needs no projection of its own. Monitor: a perspective with the in-game vertical FOV.

The eye offset is shared between outputs. The game's cockpit camera and the VR reset origin are
the same point in the car.

## VR: an OpenXR API layer, so code in the game's process

This is the one exception to Live Compare's "no injection" rule. LMU renders straight to the
headset runtime, so nothing outside the game process can add a layer to its frames, and a SteamVR
overlay would force the driver through SteamVR and cost frame rate. An API layer is the sanctioned
OpenXR mechanism (OpenKneeboard and OpenXR Toolkit use it). The DLL must be signed before anti-cheat
will tolerate it.

- Registered per user (`HKCU\Software\Khronos\OpenXR\1\ApiLayers\Implicit`), so turning VR on
  needs no admin rights. The value is the manifest path; turning VR off deletes the value. The host
  reconciles the registry with the setting on start, so a moved install heals itself.
- The layer reads the shared memory `Local\SprintDrivingGuide` (layout in
  `app/Sprint.OpenXrLayer/src/guide_feed_layout.h` and `DrivingGuideFeedLayout.cs`, one seqlock per
  block). Without Sprint running, the mapping is absent and the layer passes every call through.
- It adds one projection layer with alpha on top of the game's. There is no depth, so the guide
  draws over the cockpit and other cars. Accepted for now. The ribbon starts a few metres ahead,
  which keeps most of it off the bonnet.
- It handles D3D11 sessions natively and D3D12 sessions through D3D11On12. Which one LMU uses is
  unconfirmed; the layer logs it to `%LOCALAPPDATA%\Sprint\openxr-layer.log`.

## Monitor: a click-through window

- A transparent, topmost, click-through, non-focusable window over the primary display. It cannot
  match a game in exclusive fullscreen, like the HUD (`HudInterop.IsExclusiveFullscreenActive`).
- The pose comes from a streaming endpoint at telemetry rate, not the 250 ms state poll.
- In-game head movement (look to apex, head physics) moves the camera without telemetry saying so.
  The overlay is only right with those off.
