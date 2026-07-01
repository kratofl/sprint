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
2. Restores the .NET desktop project
3. Publishes the Windows `.exe` via `dotnet publish -p:InformationalVersion=<ver>`
4. Renames the artifact to `sprint-<tag>-windows-amd64.exe`
5. Uploads it to a GitHub Release (auto-generates release notes from commits)
(The release workflow currently publishes only the desktop `.exe`. A Linux API
   server binary is not built by `desktop-release.yml` today; build/ship it
   separately if a server release is needed.)

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
# Uses the most recent tag (e.g. 0.2.0-alpha.1) as the version
make build-app

# Override the version explicitly
make build-app VERSION=0.2.0-alpha.1-dev

# Output is under
app/build/bin
```

---

## What gets built

| Artifact | Platform | Runner | Trigger |
|---|---|---|---|
| `sprint-<tag>-windows-amd64.exe` | Windows x64 | `windows-latest` | tag push |

The desktop `.exe` is the only artifact produced by `desktop-release.yml`. (A
self-hosted API server binary is not part of this release workflow today.)

---

## In-app version reporting & updates (WS10)

The desktop client reports its own version and offers a manual update check:

- **Version metadata** — `Directory.Build.props` carries `Version` (and
  Product/Company); `make build-app` / the release workflow stamp the tag via
  `-p:InformationalVersion=<ver>`. `Runtime/BuildInfo.Version` reads that back
  (stripping any `+<sha>` suffix), shown as a badge on the **Settings → About**
  card next to the active update channel.
- **Update check** — `Features/Updates/UpdateChecker` is a pure, channel-aware
  semver check: it picks the newest release visible on the user's channel
  (`stable` sees stable; `beta` sees stable+beta; `alpha` sees all) and reports
  whether it is newer than the running build. `GitHubReleaseSource` fetches the
  repo's releases on an explicit **Check for updates** click and degrades to "no
  releases" on any network failure (never crashes).
- **Updater decision (resolves Open Question #5):** the client **checks and
  notifies**; downloading + installing an update is **manual** (the user opens
  the GitHub Release). The old Windows-batch **self-replacing auto-install is
  intentionally deferred** — it is risky to run unattended and is out of scope
  for the current parity pass. Revisit if unattended updates become a
  requirement.

## Publish target (WS10 / WS2)

The client project declares an intentional Windows publish target
(`<RuntimeIdentifiers>win-x64</RuntimeIdentifiers>`, framework-dependent —
`SelfContained=false`). Flip `SelfContained` to `true` for a standalone build
that bundles the runtime. Assets, fonts, presets, and the app icon are marked
`CopyToOutputDirectory` and are verified present in the publish output.

## Release validation

Before tagging, run the full local gate:

```powershell
& 'C:\Program Files (x86)\dotnet\dotnet.exe' build app/Sprint.Desktop.sln -warnaserror   # 0/0
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
