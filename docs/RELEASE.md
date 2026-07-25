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
3. Publishes a **self-contained, single-file** binary per OS via `dotnet publish
   -r <rid> -p:PublishSingleFile=true` — no installed .NET runtime is required to
   run it
4. Packages the binary + its `presets/`/`Assets/` into one archive per OS:
   `sprint-<tag>-windows-amd64.zip` and `sprint-<tag>-linux-amd64.tar.gz`
5. Uploads both to a single GitHub Release (auto-generates notes; marks
   alpha/beta/rc tags as pre-releases)

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
# Windows self-contained single-file binary (default RID = win-x64)
make build-app

# Linux self-contained single-file binary (cross-publishes from any host)
make build-app RID=linux-x64

# Override the version explicitly
make build-app VERSION=0.2.0-alpha.1-dev

# Output (one self-contained binary + presets/ + Assets/) is under
app/build/bin
```

---

## What gets built

| Artifact | Platform | Runner | Trigger |
|---|---|---|---|
| `sprint-<tag>-windows-amd64.zip` | Windows x64 | `windows-latest` | tag push |
| `sprint-<tag>-linux-amd64.tar.gz` | Linux x64 | `ubuntu-latest` | tag push |

Each archive contains one **self-contained, single-file** binary (no installed
.NET runtime required) plus its `presets/` and `Assets/`. `desktop-release.yml`
produces both; the .NET API server ships as a container (see `api/Dockerfile` /
`docker-compose.yml`), not as part of this workflow.

---

## In-app version reporting & updates (WS10, issue #28)

The desktop client reports its own version and installs updates in one click:

- **Version metadata** — `Directory.Build.props` carries `Version` (and
  Product/Company); `make build-app` / the release workflow stamp the tag via
  `-p:InformationalVersion=<ver>`. `Runtime/BuildInfo.Version` reads that back
  (stripping any `+<sha>` suffix), shown as a badge on the **Settings → About**
  card next to the active update channel.
- **Channels — two, not three:** `stable` and `pre-release`
  (`AppSettings.Channels`). `stable` sees stable releases only; `pre-release`
  sees stable + pre-release. Legacy persisted `beta`/`alpha` settings normalize
  to `pre-release` on load (`AppSettings.NormalizeChannel`, applied in
  `DesktopRuntime.LoadSettings`). Selecting `pre-release` in Settings requires
  confirming a "may contain bugs" warning; cancelling reverts to `stable`.
- **Update check** — `Features/Updates/UpdateChecker` is a pure, channel-aware
  semver check: it picks the newest release visible on the user's channel and
  reports whether it is newer than the running build. `GitHubReleaseSource`
  fetches the repo's releases (`GitHubReleaseSource.DefaultRepo`), carries each
  release's assets, and degrades to "no releases" on any network failure (never
  crashes). It runs on an explicit **Check for updates** click and once at
  startup.
- **Startup notice** — an in-app Graphite toast (bottom-right, ~8s, "Open
  Settings" action). Best-effort and silent when up to date or offline; it runs
  only under a classic desktop lifetime, so headless/test hosts never fetch.
- **One-click install (Windows)** — `ReleaseAssetSelector` picks the platform
  archive (`win-x64` → `*windows-amd64.zip`, `linux-x64` → `*linux-amd64.tar.gz`),
  `UpdateInstaller.DownloadAsync` streams it to
  `%TEMP%\Sprint\updates\<version>\` with progress and extracts it to a staging
  dir, then `UpdateScript.BuildWindowsBatch` produces the helper batch that waits
  for the app's PID to exit, robocopies staging over the install dir, relaunches,
  and deletes itself. The app confirms first, then shuts down so the swap can run.
- **Linux and fallbacks** — self-replace is Windows-only
  (`UpdateInstaller.SupportsSelfReplace`). Elsewhere — and on any download,
  extract, or swap failure — Sprint reveals the downloaded archive in the file
  manager and keeps running on the working build. Nothing is ever left
  half-installed by the app itself.
- **Decision record (resolves Open Question #5):** the earlier
  "check-and-notify only, self-replace deferred" decision is **superseded** by
  issue #28. Unattended/background auto-install (no user click) remains out of
  scope: every install is user-initiated and confirmed.

## Publish target

The client project targets `<RuntimeIdentifiers>win-x64;linux-x64</RuntimeIdentifiers>`.
Dev `build`/`run`/`test` stay framework-dependent (fast); a **publish** with
`-p:PublishSingleFile=true` (what `make build-app` and the release workflow use)
switches on the shipping profile:

- **self-contained** — bundles the .NET runtime, so no runtime install is needed;
- **single-file** with native libraries self-extracting (SkiaSharp/Avalonia) and
  the payload compressed → one ~55 MB binary;
- a post-publish target **strips the 100+ MB of native `.pdb`** the Skia/HarfBuzz
  runtime packs would otherwise dump into the output.

Assets, fonts, presets, and the app icon are `CopyToOutputDirectory` and verified
present alongside the binary.

### Going smaller: trimming / Native AOT (future)

`-p:PublishTrimmed=true` roughly halves the size and **Native AOT**
(`-p:PublishAot=true`) produces a true native binary with faster startup. Both are
**not enabled yet** because the runtime persistence uses **reflection-based
`System.Text.Json`**, which trimming/AOT can break — enabling them first requires
`System.Text.Json` source generators (`JsonSerializerContext`) plus a per-OS GUI
smoke run to confirm nothing was trimmed away. Native AOT additionally **cannot
cross-compile** (each OS must build on its own runner — which the release matrix
already does). Treat this as the follow-up once a GUI smoke harness exists.

## Release validation

Before tagging, run the full local gate:

```powershell
& 'C:\Program Files (x86)\dotnet\dotnet.exe' build app/Sprint.Desktop.slnx -warnaserror   # 0/0
make test-app                                                                            # all green
make build-app VERSION=<ver>                                                             # publishes to app/build/bin
```

Then smoke the artifact: launch `app/build/bin/Sprint.Desktop.Client.exe`, confirm
the shell opens, and confirm the publish output contains `presets/`,
`Assets/Fonts/`, and `build/appicon.png`.

## Checklist before tagging

- [ ] `main` is green (CI passes)
- [ ] `CHANGELOG` or release notes drafted (GitHub auto-generates from commits
      if [Conventional Commits](https://www.conventionalcommits.org) are used)
- [ ] Version number follows semver and has not been used before
- [ ] For alpha: the feature being tested is merged and working end-to-end
