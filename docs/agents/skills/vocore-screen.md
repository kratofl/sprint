## VoCore Screen Skill

Use when touching the VoCore driver or debugging VoCore device behavior.

### Scope

- `app/internal/hardware/vocore_*`
- shared driver behavior in `app/internal/hardware/base_driver.go`

### Rules

- VoCore uses WinUSB with vendor-specific control transfers plus a bulk OUT endpoint.
- Query model details rather than assuming dimensions when the code already supports it.
- Treat wake, brightness, and frame send sequences carefully; firmware behavior is stateful.
- Keep hardware protocol handling in the hardware layer, not in UI code.

### Verify

- open and detect flow
- wake and brightness flow
- frame send sequence
- screen-dimension handling
- Windows-specific behavior and build tags
