//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"text/template"
)

// updateScriptTmpl is a batch script that waits for the running process to
// exit, copies the downloaded exe over the current one, starts the new
// binary, then cleans up both itself and the downloaded file.
var updateScriptTmpl = template.Must(template.New("update").Parse(
	`@echo off
timeout /t 3 /nobreak >nul
copy /Y "{{.New}}" "{{.Current}}"
start "" "{{.Current}}"
del "{{.Script}}"
del "{{.New}}"
`))

func launchUpdate(newExe string) error {
	current, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve current exe: %w", err)
	}

	script := filepath.Join(os.TempDir(), "sprint-update.cmd")
	f, err := os.Create(script)
	if err != nil {
		return fmt.Errorf("create update script: %w", err)
	}
	err = updateScriptTmpl.Execute(f, map[string]string{
		"New":     newExe,
		"Current": current,
		"Script":  script,
	})
	f.Close()
	if err != nil {
		return fmt.Errorf("write update script: %w", err)
	}

	cmd := exec.Command("cmd.exe", "/C", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
}
