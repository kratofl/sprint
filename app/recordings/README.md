# Telemetry recordings

Real driven sessions, one file per session, for running the app without the game:
`make dev-app REPLAY=<name>` or `make agent-app REPLAY=<name>` replays one, `make dev-data` files the
laps of all of them into the dev data at once. `make dev-app RECORD=1` adds new ones here. Format:
`app/Sprint.Games/Recording/TelemetryRecording.cs`.

- The files are in Git LFS (`.gitattributes`). Without git-lfs installed a clone has small
  pointer files instead; `make dev-app REPLAY=` and `make dev-data` say so and stop.
- No real names: the recorder writes the driver as `Player` and everyone else as
  `Driver <car id>`. A file recorded any other way gets scrubbed the same way before it is
  committed; car and team names are game liveries and stay.
- Recordings carry the telemetry fields that existed when they were made; newer fields read as
  their defaults.
