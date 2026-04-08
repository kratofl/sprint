//go:build !windows

package updater

import "errors"

func launchInstaller(_ string) error {
	return errors.New("one-click update is only supported on Windows")
}
