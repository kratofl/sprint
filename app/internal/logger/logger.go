// Package logger initialises the structured logger for the Sprint desktop app.
//
// It wraps log/slog and sets up a multi-handler that writes:
//   - JSON records to a daily rotating file in <exe>/logs/ (14-day retention)
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
	"time"
)

// Config controls logger behaviour.
type Config struct {
	// Level is the minimum log level to emit. Accepts "debug", "info", "warn", "error".
	// Defaults to "info".
	Level string

	// LogFile overrides the log file path. If empty, a daily file under LogDir() is used.
	LogFile string

	// Console controls whether log records are also written to stdout.
	// Always true in development; may be disabled in a silent production build.
	Console bool
}

// DefaultConfig returns a Config that reads LOG_LEVEL from the environment
// and writes to a daily log file next to the executable.
func DefaultConfig() Config {
	return Config{
		Level:   envOrDefault("LOG_LEVEL", "info"),
		LogFile: "", // resolved lazily in Init → daily file in LogDir()
		Console: true,
	}
}

// LogDir returns the logs directory next to the running executable.
// Falls back to the OS cache dir if the executable path cannot be determined.
func LogDir() string {
	if exe, err := os.Executable(); err == nil {
		return filepath.Join(filepath.Dir(exe), "logs")
	}
	base, _ := os.UserCacheDir()
	return filepath.Join(base, "sprint", "logs")
}

// Init configures the global slog default logger and returns the root logger.
// Call this once at application startup and pass the returned logger to subsystems.
func Init(cfg Config) *slog.Logger {
	level := parseLevel(cfg.Level)

	var handlers []slog.Handler

	// File handler (JSON, daily rotation).
	logPath := cfg.LogFile
	if logPath == "" {
		logPath = dailyLogPath()
	}
	pruneOldLogs(filepath.Dir(logPath), 14)
	if f, err := openLogFile(logPath); err == nil {
		handlers = append(handlers, slog.NewJSONHandler(f, &slog.HandlerOptions{Level: level}))
	}

	// Stdout handler (text).
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

// dailyLogPath returns the path for today's log file inside LogDir().
func dailyLogPath() string {
	return filepath.Join(LogDir(), "sprint-"+time.Now().Format("2006-01-02")+".log")
}

// pruneOldLogs deletes sprint-YYYY-MM-DD.log files in dir older than retentionDays.
func pruneOldLogs(dir string, retentionDays int) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasPrefix(name, "sprint-") || !strings.HasSuffix(name, ".log") {
			continue
		}
		dateStr := strings.TrimPrefix(strings.TrimSuffix(name, ".log"), "sprint-")
		t, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			continue
		}
		if t.Before(cutoff) {
			_ = os.Remove(filepath.Join(dir, name))
		}
	}
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

