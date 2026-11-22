# Releasing the desktop app

The **Release** workflow (`.github/workflows/release.yml`) is the only way to release: Actions →
Release → Run workflow on `main`, pick stable or pre-release. It picks the next version
(`scripts/next-version.mjs`, see [Versions](#versions)) and pushes that tag. Then it builds Windows
and Linux packages the same way `make build-app` does and attaches them to one GitHub Release: the
Windows installer `sprint-<version>-setup.exe` with its `.blockmap` and `latest.yml` (what installed
apps update from; keep the names as built), and `sprint-<version>-linux-x64.tar.gz`. Pre-release
versions are marked pre-release. The same run publishes the server images (see
[below](#server-images)). A tag pushed by hand builds nothing.

Running the workflow publishes to users. Only do it when the maintainer asks.

## Versions

```
v<major>.<minor>.<patch>              stable
v<major>.<minor>.<patch>-beta.<n>     pre-release
```

Pre-releases are `beta`. Not `rc`: electron-updater treats any other suffix as a channel of its own,
so installs on the pre-release channel would never see an `-rc` release. Older tags used `alpha`.

The bump comes from the labels on the PRs merged since the last stable release, the biggest wins:

| Label | Bump | Means for a driver |
| --- | --- | --- |
| `type/breaking` | major | Something they have stops working or has to be redone |
| `type/feature` | minor | They can do something they could not before |
| none | patch | Fixes, polish, refactors, docs, dependency bumps |

A release with any number of fixes and nothing else is a patch. A forgotten label can be added to the
merged PR before cutting. The bump is measured from the last stable release, so repeated
pre-releases count up one line and a stable release then promotes it: after `v1.0.0` with only
fixes merged, pre-release gives `v1.0.1-beta.1`, again `v1.0.1-beta.2`, then stable gives `v1.0.1`.
A `type/feature` PR merged in between moves the line to `v1.1.0-beta.1`. It refuses a version that
would not be the newest tag (a label removed after its beta shipped), because installed apps only
update forward.

The tag minus its `v` is stamped through `-p:InformationalVersion=…`; `BuildInfo.Version` reads it
back.

## Server images

`.github/workflows/images.yml` builds `ghcr.io/<owner>/sprint-api` and `sprint-web` for
linux/amd64 and linux/arm64 on native runners and merges them into one multi-arch tag:

| Trigger | Tags |
| --- | --- |
| release `v1.2.0` | `v1.2.0`, `stable` |
| release `v1.2.0-beta.1` (any `-` suffix) | `v1.2.0-beta.1`, `unstable` |
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

Then run Release.

A failed build: re-run its failed jobs in that run; a new run refuses a commit that is already
released. A bad release: delete the GitHub Release (`gh release delete <tag> --yes`) and the tag
(`git push origin :refs/tags/<tag>`), then run Release again. Both are destructive, so ask first.

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

- At launch a splash window covers the host's start. With `autoInstallUpdates` on, it also checks
  and, when there is a new version, downloads and installs it before the main window opens. The
  check gives up after 8 s so an offline launch is not held up.
- While Sprint runs it checks once an hour (plus "Check for updates" in Settings and the palette,
  and on a channel switch) but never downloads by itself: nothing should pull an installer
  mid-session. A version on offer shows as the toolbar's update button; a click downloads it and
  restarts into the installer.
- `autoInstallUpdates` defaults per channel: on for `stable` (opt out), off for `pre-release`
  (opt in). Switching channel resets it to the new channel's default.
- Channels are `stable` and `pre-release`; legacy `beta`/`alpha` settings normalise to
  `pre-release`, which maps to electron-updater's `allowPrerelease`. Opting in asks for
  confirmation. Moving back to stable never downgrades.
- The settings live in the host (`AppSettings`) and reach the main process through `/api/state`'s
  `updates`.
- Releases from before the installer (zip builds, v0.2.1-alpha.1 and older) cannot update into it:
  those installs need the installer once by hand.
