// Package logger initialises the structured logger for the Sprint desktop app.
//
// It wraps log/slog and sets up a multi-handler that writes:
//   - JSON records to a file in the OS user log/cache directory (for post-session analysis)
//   - Text records to stdout (for development visibility)
//
// Usage:
//
//	logger := logger.Init(logger.DefaultConfig())
//	sub := logger.With("component", "vocore")
//	sub.Info("renderer starting", "port", "/dev/cu.usbmodem14201")
package logger

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// Config controls logger behaviour.
type Config struct {
	// Level is the minimum log level to emit. Accepts "debug", "info", "warn", "error".
	// Defaults to "info".
	Level string

	// LogFile is the path to the log file. If empty, DefaultLogFile() is used.
	LogFile string

	// Console controls whether log records are also written to stdout.
	// Always true in development; may be disabled in a silent production build.
	Console bool
}

// DefaultConfig returns a Config that reads LOG_LEVEL from the environment
// and writes to the default OS log file location.
func DefaultConfig() Config {
	return Config{
		Level:   envOrDefault("LOG_LEVEL", "info"),
		LogFile: "", // resolved lazily in Init
		Console: true,
	}
}

// Init configures the global slog default logger and returns the root logger.
// Call this once at application startup and pass the returned logger to subsystems.
func Init(cfg Config) *slog.Logger {
	level := parseLevel(cfg.Level)

	var handlers []slog.Handler

	// ── File handler (JSON) ──────────────────────────────────────────────────
	logPath := cfg.LogFile
	if logPath == "" {
		logPath = DefaultLogFile()
	}
	if f, err := openLogFile(logPath); err == nil {
		handlers = append(handlers, slog.NewJSONHandler(f, &slog.HandlerOptions{Level: level}))
	}

	// ── Stdout handler (text) ────────────────────────────────────────────────
	if cfg.Console {
		handlers = append(handlers, slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	}

	var handler slog.Handler
	switch len(handlers) {
	case 0:
		handler = slog.NewTextHandler(io.Discard, nil)
	case 1:
		handler = handlers[0]
	default:
		handler = &multiHandler{handlers: handlers}
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

// DefaultLogFile returns the OS-appropriate path for the Sprint log file.
//
//   - macOS:   ~/Library/Logs/Sprint/sprint.log
//   - Linux:   ~/.cache/sprint/sprint.log
//   - Windows: %LOCALAPPDATA%\Sprint\sprint.log
func DefaultLogFile() string {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}
	return filepath.Join(base, "sprint", "sprint.log")
}

// openLogFile creates the log file and any missing parent directories.
func openLogFile(path string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
}

// parseLevel converts a string level name to slog.Level.
func parseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
