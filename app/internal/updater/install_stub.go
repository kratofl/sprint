//go:build !windows

package updater

import "errors"

func launchUpdate(_ string) error {
	return errors.New("one-click update is only supported on Windows")
}
