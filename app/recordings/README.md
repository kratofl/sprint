# Telemetry recordings

Real driven sessions, one file per session, for replaying the app without the game:
`make replay-app FILE=<name>` or `make agent-app FILE=<name>`. `make record-app` adds new ones
here. Format: `app/Sprint.Games/Recording/TelemetryRecording.cs`.

- The files are in Git LFS (`.gitattributes`). Without git-lfs installed a clone has small
  pointer files instead, and a replay of one reports it is not a recording.
- No real names: the recorder writes the driver as `Player` and everyone else as
  `Driver <car id>`. A file recorded any other way gets scrubbed the same way before it is
  committed; car and team names are game liveries and stay.
- Recordings carry the telemetry fields that existed when they were made; newer fields read as
  their defaults.
