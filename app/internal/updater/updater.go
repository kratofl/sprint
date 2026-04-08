// Package updater checks GitHub Releases for newer versions of Sprint
// and downloads the Windows installer for one-click updates.
package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const releasesURL = "https://api.github.com/repos/kratofl/sprint/releases"

// ReleaseInfo describes an available update.
type ReleaseInfo struct {
	Version      string `json:"version"`
	DownloadURL  string `json:"downloadURL"`
	ReleaseNotes string `json:"releaseNotes"`
	IsPrerelease bool   `json:"isPrerelease"`
}

// CheckLatest queries GitHub Releases and returns the newest release that is
// newer than currentVersion and compatible with channel ("stable" or
// "pre-release"). Returns nil if the app is already up-to-date.
func CheckLatest(currentVersion, channel string) (*ReleaseInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, releasesURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch releases: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api status %d", resp.StatusCode)
	}

	var releases []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("decode releases: %w", err)
	}

	includePrerelease := channel == "pre-release"
	for _, r := range releases {
		if r.Draft {
			continue
		}
		if r.Prerelease && !includePrerelease {
			continue
		}
		if !isNewer(r.TagName, currentVersion) {
			continue
		}
		url := installerAssetURL(r)
		if url == "" {
			continue
		}
		return &ReleaseInfo{
			Version:      strings.TrimPrefix(r.TagName, "v"),
			DownloadURL:  url,
			ReleaseNotes: r.Body,
			IsPrerelease: r.Prerelease,
		}, nil
	}
	return nil, nil
}

// DownloadAndInstall downloads the installer from downloadURL to the OS temp
// directory and launches it silently. The caller should quit the app after
// this returns without error.
func DownloadAndInstall(ctx context.Context, downloadURL string) error {
	dest := filepath.Join(os.TempDir(), "sprint-update-installer.exe")
	if err := downloadFile(ctx, downloadURL, dest); err != nil {
		return fmt.Errorf("download installer: %w", err)
	}
	return launchInstaller(dest)
}

func downloadFile(ctx context.Context, url, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return err
	}
	return nil
}

type githubRelease struct {
	TagName    string         `json:"tag_name"`
	Prerelease bool           `json:"prerelease"`
	Draft      bool           `json:"draft"`
	Body       string         `json:"body"`
	Assets     []githubAsset  `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

func installerAssetURL(r githubRelease) string {
	tag := r.TagName
	want := fmt.Sprintf("sprint-%s-windows-amd64-installer.exe", tag)
	for _, a := range r.Assets {
		if a.Name == want {
			return a.BrowserDownloadURL
		}
	}
	return ""
}

// isNewer returns true if candidate is strictly newer than current.
// Both are expected to be semver tags such as "v1.2.3" or "1.2.3".
// Pre-release suffixes (e.g. "-alpha.1") are stripped before comparison.
func isNewer(candidate, current string) bool {
	cMaj, cMin, cPat, cOk := parseVersion(candidate)
	rMaj, rMin, rPat, rOk := parseVersion(current)
	if !cOk || !rOk {
		return false
	}
	if cMaj != rMaj {
		return cMaj > rMaj
	}
	if cMin != rMin {
		return cMin > rMin
	}
	return cPat > rPat
}

func parseVersion(v string) (major, minor, patch int, ok bool) {
	v = strings.TrimPrefix(v, "v")
	if idx := strings.IndexByte(v, '-'); idx >= 0 {
		v = v[:idx]
	}
	parts := strings.SplitN(v, ".", 3)
	if len(parts) != 3 {
		return
	}
	var err error
	if major, err = strconv.Atoi(parts[0]); err != nil {
		return
	}
	if minor, err = strconv.Atoi(parts[1]); err != nil {
		return
	}
	if patch, err = strconv.Atoi(parts[2]); err != nil {
		return
	}
	ok = true
	return
}
