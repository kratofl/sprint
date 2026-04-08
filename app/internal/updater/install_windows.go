//go:build windows

package updater

import "os/exec"

func launchInstaller(path string) error {
	return exec.Command(path, "/S").Start()
}
