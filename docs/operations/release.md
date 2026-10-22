# Releasing the desktop app

Releases are cut by pushing a `v*` tag. `.github/workflows/desktop-release.yml` builds Windows and
Linux packages the same way `make build-app` does and attaches
`sprint-<tag>-windows-amd64.zip` / `sprint-<tag>-linux-amd64.tar.gz` to one GitHub Release. Tags with
a pre-release suffix are marked pre-release. The same tag publishes the server images (see
[below](#server-images)).

Pushing a tag publishes to users. Only do it when the maintainer asks for that exact version.

## Versions

```
v<major>.<minor>.<patch>              stable
v<major>.<minor>.<patch>-alpha.<n>    pre-release
v<major>.<minor>.<patch>-beta.<n>     pre-release
v<major>.<minor>.<patch>-rc.<n>       release candidate
```

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

Then launch `app/build/bin/Sprint-<platform>-<arch>/Sprint.exe` (`Sprint.app` on macOS), confirm the
window opens, the views render and `resources/host/presets/` shipped beside the app
(`Sprint.app/Contents/Resources/host/presets/` on macOS). Run the
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
   `app/desktop/resources/host`.
2. `pnpm --filter @sprint/desktop build` — renderer (`dist/`) and main process (`dist-electron/`).
3. `pnpm --filter @sprint/desktop package` — `@electron/packager` bundles both plus the host as an
   unpacked `extraResource` into `app/build/bin/Sprint-<platform>-<arch>/`
   (`app/desktop/scripts/package.mjs`).

Trimming and Native AOT are off: runtime persistence uses reflection-based `System.Text.Json`, which
both can break. Enabling either needs source-generated `JsonSerializerContext`s first.

## In-app updates

- Channels are `stable` and `pre-release`; legacy `beta`/`alpha` settings normalise to `pre-release`.
  Opting into pre-release asks for confirmation.
- Checking is on demand only (`POST /api/updates/check`). `GitHubReleaseSource` degrades to "no
  releases" on any network failure.
- `POST /api/updates/install` downloads the platform asset, stages it and runs a Windows self-replace
  helper (elevating when the install directory is protected). It is refused in dev and off Windows.
