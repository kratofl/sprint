# Releasing the desktop app

Releases are cut by pushing a `v*` tag. `.github/workflows/desktop-release.yml` builds Windows and
Linux packages the same way `make build-app` does and attaches them to one GitHub Release: the
Windows installer `sprint-<version>-setup.exe` with its `.blockmap` and `latest.yml` (what installed
apps update from — keep the names as built), and `sprint-<version>-linux-x64.tar.gz`. Tags with a
pre-release suffix are marked pre-release. The same tag publishes the server images (see
[below](#server-images)).

Pushing a tag publishes to users. Only do it when the maintainer asks for that exact version.

## Versions

```
v<major>.<minor>.<patch>              stable
v<major>.<minor>.<patch>-alpha.<n>    pre-release
v<major>.<minor>.<patch>-beta.<n>     pre-release
```

Use `alpha` or `beta` for pre-releases, not `rc`: electron-updater treats any other suffix as a
channel of its own, so installs on alpha/beta would never see an `-rc` release.

The tag minus its `v` is stamped through `-p:InformationalVersion=…`; `BuildInfo.Version` reads it
back.

## Server images

`.github/workflows/images.yml` builds `ghcr.io/<owner>/sprint-api` and `sprint-web` for
linux/amd64 and linux/arm64 on native runners and merges them into one multi-arch tag:

| Trigger | Tags |
| --- | --- |
| `v1.2.0` | `v1.2.0`, `stable` |
| `v1.2.0-beta.1` (any `-` suffix) | `v1.2.0-beta.1`, `unstable` |
| push to `main` touching server code | `edge` |

A Komodo stack following a channel (`unstable` by default) picks the release up on its next
deploy ([deployment](deployment.md#komodo)). The images take every setting from runtime env, so
nothing deployment-specific may be baked in at build time — no `NEXT_PUBLIC_*` in the web app.

## Gate before tagging

```sh
dotnet build app/Sprint.Desktop.slnx -warnaserror   # x86 SDK on Windows if needed (AGENTS.md#platform)
make test-app
make build-app VERSION=<ver>
```

Then run `app/build/bin/sprint-<ver>-setup.exe` (or launch `app/build/bin/win-unpacked/Sprint.exe`;
`mac-<arch>/Sprint.app` on macOS), confirm the window opens with data — the bundled host started —
and the views render. Run the
[`test-sprint-desktop`](../../.agents/skills/test-sprint-desktop/SKILL.md) pass on the packaged app.

```sh
git tag v0.2.0-alpha.1
git push origin v0.2.0-alpha.1
```

A bad tag: delete it locally and remotely (`git push origin :refs/tags/<tag>`), delete the GitHub
Release (`gh release delete <tag> --yes`), then re-tag. Both are destructive — ask first.

## What `make build-app` does

1. `dotnet publish` the host self-contained, single-file, for `RID` (default: this machine's, from
   `scripts/make-tasks.mjs rid`) into
   `app/desktop/resources/host`. The host's build compiles the dash renderer for that RID and to
   WebAssembly, so the release workflow needs Rust with `wasm32-unknown-unknown`; the library and
   `browser-display/` ship as files beside the host executable, outside the single file.
2. `pnpm --filter @sprint/desktop build` — renderer (`dist/`) and main process (`dist-electron/`).
3. `pnpm --filter @sprint/desktop package <version>` — electron-builder
   (`app/desktop/scripts/package.mjs`) bundles both into an asar with the host beside it in
   `resources/host`, and on Windows builds the one-click per-user NSIS installer (no admin prompt,
   `%LocalAppData%\Programs\Sprint`). Output: `app/build/bin/`. An untagged build is `0.0.0-dev`.
   Nothing is signed yet, so Windows SmartScreen warns on a first install.

Trimming and Native AOT are off: runtime persistence uses reflection-based `System.Text.Json`, which
both can break. Enabling either needs source-generated `JsonSerializerContext`s first.

## In-app updates

The Electron main process updates the app with electron-updater (`app/desktop/electron/updates.ts`):
it reads `latest.yml` from the newest GitHub Release on the driver's channel and runs the NSIS
installer. Only an installed Windows build updates; dev runs and other platforms report
`unsupported` and never check.

- One check at startup, plus "Check for updates" in Settings and the palette. Switching channel
  checks again.
- `autoInstallUpdates` (on by default) downloads in the background and installs when Sprint quits;
  off, Settings offers the download. Either way "Restart now" installs at once, never by itself
  mid-session.
- Channels are `stable` and `pre-release`; legacy `beta`/`alpha` settings normalise to
  `pre-release`, which maps to electron-updater's `allowPrerelease`. Opting in asks for
  confirmation. Moving back to stable never downgrades.
- The settings live in the host (`AppSettings`) and reach the main process through `/api/state`'s
  `updates`.
- Releases from before the installer (zip builds, v0.2.1-alpha.1 and older) cannot update into it:
  those installs need the installer once by hand.
