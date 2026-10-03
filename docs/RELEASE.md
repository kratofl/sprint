# Releasing the Desktop App

This guide covers how to cut a release of the Sprint desktop app — both stable
and pre-release (alpha/beta) builds.

---

## How releases work

Releases are fully automated by GitHub Actions
(`.github/workflows/desktop-release.yml`). The trigger is a **Git tag** that
starts with `v`. Pushing the tag is the only manual step you need.

When you push a tag the workflow:

1. Strips the leading `v` to get a bare version number (`1.2.3`)
2. Runs a **Windows + Linux** matrix (`windows-latest` / `ubuntu-latest`)
3. Builds and packages the desktop app the same way `make build-app` does locally
   (below) — a self-contained native host plus the packaged Electron app
4. Packages the output into one archive per OS: `sprint-<tag>-windows-amd64.zip`
   and `sprint-<tag>-linux-amd64.tar.gz`
5. Uploads both to a single GitHub Release (auto-generates notes; marks
   alpha/beta/rc tags as pre-releases)

> The workflow file (`.github/workflows/desktop-release.yml`) still publishes the
> retired `Sprint.Desktop.Client` project as of this writing and needs updating to
> the `make build-app` pipeline described below before the next tag push — it is
> not part of this doc pass.

(The workflow ships the desktop app only. The .NET API server is deployed as a
   container image built from `api/Dockerfile` via `docker compose`, not as a
   released binary.)

---

## Versioning scheme

```
v<major>.<minor>.<patch>              → stable release
v<major>.<minor>.<patch>-alpha.<n>   → alpha pre-release
v<major>.<minor>.<patch>-beta.<n>    → beta pre-release
v<major>.<minor>.<patch>-rc.<n>      → release candidate
```

Examples: `v0.1.0`, `v0.2.0-alpha.1`, `v1.0.0-rc.2`

The full tag (e.g. `v0.2.0-alpha.1`) is used as the artifact filename.
The bare version (e.g. `0.2.0-alpha.1`) is passed to the .NET build through
`-p:InformationalVersion=...`.

---

## Cutting a stable release

```bash
# 1. Make sure you're on main and it's clean
git checkout main
git pull

# 2. Tag the release
git tag v1.2.3

# 3. Push the tag — this triggers the release workflow
git push origin v1.2.3
```

GitHub Actions will create the GitHub Release automatically. Check the
**Actions** tab to watch the build progress.

---

## Cutting an alpha (pre-release)

Alpha builds are for internal testing before a stable release. The process
is identical to a stable release — only the tag format differs.

```bash
# First alpha for the upcoming 0.2.0 release
git tag v0.2.0-alpha.1
git push origin v0.2.0-alpha.1

# If you need to fix something and cut another alpha
git tag v0.2.0-alpha.2
git push origin v0.2.0-alpha.2
```

GitHub automatically marks any release whose tag contains a pre-release
identifier (hyphen-separated suffix) as a **pre-release** on the releases
page, so stable users won't see it as "latest".

---

## Deleting / re-cutting a bad tag

If a tag was pushed by mistake or the build failed for a non-code reason:

```bash
# Delete the tag locally and remotely
git tag -d v0.2.0-alpha.1
git push origin :refs/tags/v0.2.0-alpha.1

# Delete the corresponding GitHub Release in the UI (or with gh):
gh release delete v0.2.0-alpha.1 --yes

# Then re-tag and push
git tag v0.2.0-alpha.1
git push origin v0.2.0-alpha.1
```

---

## Building locally

Use the Makefile to produce a local build without triggering a GitHub Release.
The version defaults to the most recent git tag; override it with `VERSION=`.

```bash
# Windows package (default RID = win-x64)
make build-app

# Linux package (cross-publishes the host from any host OS)
make build-app RID=linux-x64

# Override the version explicitly
make build-app VERSION=0.2.0-alpha.1-dev
```

`build-app` does three things in order (`Makefile`, `app/desktop/scripts/package.mjs`):

1. `dotnet publish` the native host (`Sprint.Desktop.Host`), self-contained for
   the target RID with `-p:PublishSingleFile=true`, into `app/desktop/resources/host`.
2. `pnpm --filter @sprint/desktop build` — type-checks and builds the Vite
   renderer (`dist/`) and the Electron main process (`dist-electron/`).
3. `pnpm --filter @sprint/desktop package` — `@electron/packager` bundles the
   renderer, main process, and the published host (as `extraResource`, unpacked
   from the asar so the native binary stays executable) into
   `app/build/bin/Sprint-<platform>-<arch>/` (e.g. `Sprint-win32-x64/Sprint.exe`
   on Windows).

Packaging fails fast with a clear message if step 1 or 2 has not run yet.

---

## What gets built

| Artifact | Platform | Runner | Trigger |
|---|---|---|---|
| `sprint-<tag>-windows-amd64.zip` | Windows x64 | `windows-latest` | tag push |
| `sprint-<tag>-linux-amd64.tar.gz` | Linux x64 | `ubuntu-latest` | tag push |

Each archive should contain the packaged Electron app produced by `make build-app`
(see "Building locally" above) — no installed .NET runtime or Node required to
run it. `desktop-release.yml` is meant to produce both archives; the .NET API
server ships as a container (see `api/Dockerfile` / `docker-compose.yml`), not as
part of this workflow.

---

## In-app version reporting & updates

The desktop app reports its own version and checks for updates on demand; it
never self-installs:

- **Version metadata** — `Directory.Build.props` carries `Version` (and
  Product/Company); `make build-app` / the release workflow stamp the tag via
  `-p:InformationalVersion=<ver>`. `Runtime/BuildInfo.Version` reads that back
  (stripping any `+<sha>` suffix), shown in the **Settings → About** card next
  to the active update channel, and again under **Help & diagnostics →
  Updates**.
- **Channels — two, not three:** `stable` and `pre-release`
  (`AppSettings.Channels`). `stable` sees stable releases only; `pre-release`
  sees stable + pre-release. Legacy persisted `beta`/`alpha` settings normalize
  to `pre-release` on load (`AppSettings.NormalizeChannel`, applied in
  `DesktopRuntime.LoadSettings`). Selecting `pre-release` in Settings requires
  confirming a "may contain bugs" warning; cancelling reverts to `stable`.
- **Update check** — `Features/Updates/UpdateChecker` is a pure, channel-aware
  semver check: it picks the newest release visible on the user's channel and
  reports whether it is newer than the running build. `GitHubReleaseSource`
  fetches the repo's releases (`GitHubReleaseSource.DefaultRepo`) and degrades
  to "no releases" on any network failure (never crashes). The host exposes it
  at `POST /api/updates/check`; **Check for updates** in Settings or in Help &
  diagnostics is the only thing that triggers a check — there is no automatic
  check at startup. A result that finds a newer release shows the version and a
  link to the GitHub release page; there is no in-app download or install.
- **One-click self-replace installer (built, not wired)** — `UpdateInstaller`,
  `UpdateScript`, and `ReleaseAssetSelector` in `Sprint.Desktop.Core/Features/Updates`
  implement a full download-stage-elevate-swap-relaunch flow (Windows helper
  batch, robocopy over the install dir, UAC elevation when the install directory
  is protected, a relaunch watcher, and a logged recovery path on a persistent
  copy failure), and are covered by `UpdateInstallerTests`/`UpdateScriptTests`.
  Nothing in `Sprint.Desktop.Host` or `app/desktop` calls into this flow today —
  the shipped app is check-and-notify only. Wiring it up is a real follow-up, not
  a description of current behavior.

## Publish target

`Sprint.Desktop.Host` has no `<RuntimeIdentifiers>` fixed in the project — the
RID is passed on the command line (`Makefile`'s `RID`, default `win-x64`).
Dev `run`/`watch`/`test` stay framework-dependent (fast); the `-r <rid>
-p:PublishSingleFile=true` publish `make build-app` uses (see "Building locally"
above) switches on the shipping profile:

- **self-contained** — bundles the .NET runtime, so no runtime install is needed
  to run the host;
- **single-file** — the host's managed assemblies compress into one executable
  under `app/desktop/resources/host`. The host is a plain ASP.NET Core minimal
  API with no graphics/UI native dependencies, so it carries none of the
  SkiaSharp/Avalonia native-library weight the previous UI binary did;
- presets (`app/Sprint.Desktop.Host/presets/**/*.json`) are `CopyToOutputDirectory`
  and ship alongside the host executable.

`@electron/packager` (step 3 of `build-app`) then bundles that published host as
an unpacked `extraResource` next to the Electron/Chromium runtime, the renderer
bundle, and the app icon — see `app/desktop/scripts/package.mjs`.

### Going smaller: trimming / Native AOT (future)

`-p:PublishTrimmed=true` and **Native AOT** (`-p:PublishAot=true`) are not
enabled for the host publish. `Sprint.Desktop.Core`'s runtime persistence uses
**reflection-based `System.Text.Json`** (`DesktopRuntime`'s (de)serialization),
which trimming/AOT can break — enabling either first requires
`System.Text.Json` source generators (`JsonSerializerContext`) plus a smoke run
to confirm nothing was trimmed away. Native AOT additionally **cannot
cross-compile** (each OS must build on its own runner — which the release matrix
already does).

## Release validation

Before tagging, run the full local gate:

```powershell
& 'C:\Program Files (x86)\dotnet\dotnet.exe' build app/Sprint.Desktop.slnx -warnaserror   # 0/0
make test-app                                                                            # all green
make build-app VERSION=<ver>                                                             # publishes + packages -> app/build/bin
```

Then smoke the artifact: launch the packaged executable under
`app/build/bin/Sprint-<platform>-<arch>/` (e.g. `Sprint.exe` on Windows), confirm
the window opens and telemetry/dash pages render, and confirm
`resources/host/presets/` shipped alongside the app.

## Checklist before tagging

- [ ] `main` is green (CI passes)
- [ ] `CHANGELOG` or release notes drafted (GitHub auto-generates from commits
      if [Conventional Commits](https://www.conventionalcommits.org) are used)
- [ ] Version number follows semver and has not been used before
- [ ] For alpha: the feature being tested is merged and working end-to-end
