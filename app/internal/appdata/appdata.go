// Package appdata provides the application data directory path.
package appdata

import (
	"os"
	"path/filepath"
)

// Dir returns the data directory for Sprint config and state files.
// Files are stored in a "data" subfolder next to the executable, making
// the app portable — copy the folder and everything moves with it.
// Falls back to os.UserConfigDir()/sprint if the executable path cannot
// be determined.
func Dir() string {
	if exe, err := os.Executable(); err == nil {
		return filepath.Join(filepath.Dir(exe), "data")
	}
	base, _ := os.UserConfigDir()
	return filepath.Join(base, "sprint")
}

// ExeDir returns the directory that contains the running executable.
// Returns an empty string if the executable path cannot be determined.
func ExeDir() string {
	if exe, err := os.Executable(); err == nil {
		return filepath.Dir(exe)
	}
	return ""
}
