## USBD480 Screen Skill

Use when touching the USBD480 driver or debugging device communication.

### Scope

- `app/internal/hardware/usbd480_*`

### Rules

- Query device details rather than hardcoding dimensions.
- Treat the device as a composite USB device with a display interface and optional touchscreen HID.
- Keep control transfer recipient and setup packet details exact; protocol mismatches cause failures.
- Keep hardware protocol logic in the hardware layer.

### Verify

- open and enumerate flow
- control transfer constants
- brightness and frame send sequence
- Windows WinUSB behavior
