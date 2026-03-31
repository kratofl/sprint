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
2. Patches `app/wails.json` → `info.productVersion` with that number
3. Builds the Windows `.exe` via `wails build -ldflags "-X main.Version=<ver>"`
4. Renames the artifact to `sprint-<tag>-windows-amd64.exe`
5. Uploads it to a GitHub Release (auto-generates release notes from commits)
6. Also builds the API server binary (Linux) and attaches it to the same release

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
The bare version (e.g. `0.2.0-alpha.1`) is baked into the binary via
`-ldflags "-X main.Version=..."` and shown in the app's about screen.

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

# Output is at
app/build/bin/Sprint.exe
```

Requires the [Wails CLI](https://wails.io/docs/gettingstarted/installation)
to be installed (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`).

---

## What gets built

| Artifact | Platform | Runner | Trigger |
|---|---|---|---|
| `sprint-<tag>-windows-amd64.exe` | Windows x64 | `windows-latest` | tag push |
| `sprint-api-<tag>-linux-amd64` | Linux x64 | `ubuntu-latest` | tag push |

Only the desktop `.exe` is relevant for driver installs. The API binary is for
self-hosted server deployments.

---

## Checklist before tagging

- [ ] `main` is green (CI passes)
- [ ] `CHANGELOG` or release notes drafted (GitHub auto-generates from commits
      if [Conventional Commits](https://www.conventionalcommits.org) are used)
- [ ] Version number follows semver and has not been used before
- [ ] For alpha: the feature being tested is merged and working end-to-end
