---
description: 'Go conventions for this project: workspace layout, package rules, HTTP client pattern, io.Reader usage, logging, and platform-specific code.'
applyTo: '**/*.go,**/go.mod,**/go.sum'
---

# Go Conventions

## Package Declaration Rules (CRITICAL)

- **NEVER duplicate `package` declarations** — each Go file must have exactly ONE `package` line.
- When editing an existing `.go` file, **preserve** the existing `package` declaration.
- When creating a new `.go` file, check what package name other `.go` files in the same directory use and match it. If it is a new directory, use the directory name.
- When replacing file content, include only ONE `package` declaration. **Never** create files with multiple `package` lines.

## Architecture and Go Workspace

- Each deployable binary is its own Go module with `main.go` at the module root (`app/main.go`, `api/main.go`) — required by Wails.
- Use `go.work` to link all modules (`app`, `api`, `pkg`) so local changes resolve without publishing.
- Run `go work sync` after updating any module's `go.mod`.
- Use `internal/` for packages that should not be imported by external projects.
- Prefer generics over unconstrained types; use `any` instead of `interface{}` (Go 1.18+).

## HTTP Client Pattern

- Keep the client struct focused on configuration only (base URL, `*http.Client`, auth, headers). **No per-request state on the struct.**
- Do not store `*http.Request` on a long-lived client; construct a fresh request per method invocation.
- Methods accept `context.Context` and input parameters, assemble `*http.Request` locally, then call `c.httpClient.Do(req)`.
- Factor reused request-building logic into unexported helpers or a per-call builder; never keep URL params, body, or headers as client fields.
- Always close response bodies (`defer resp.Body.Close()`).

## I/O: Readers and Buffers

- `io.Reader` streams are consumable once. To re-read, buffer with `io.ReadAll` then create fresh readers via `bytes.NewReader(buf)`.
- For HTTP requests: keep payload as `[]byte`, set `req.Body = io.NopCloser(bytes.NewReader(buf))` before each send. Configure `req.GetBody` for redirects/retries.
- Use `io.TeeReader` to duplicate a stream while reading; `io.MultiWriter` to write to multiple sinks.
- `io.Pipe`: write in a goroutine, consume from reader. Always `CloseWithError(err)` on failure. Writes must be sequential (especially with multipart).
- Streaming multipart/form-data: `pr, pw := io.Pipe()`; `mw := multipart.NewWriter(pw)`; use `pr` as request body. Write all parts in order in a goroutine, then `mw.Close()` then `pw.Close()`.
- For large payloads, avoid unbounded buffering; use `io.LimitReader` or on-disk temp storage.

## Concurrency (Project-Specific Patterns)

- Use `WaitGroup.Go` to launch goroutines tracked by a WaitGroup:
	```go
	var wg sync.WaitGroup
	wg.Go(task1)
	wg.Go(task2)
	wg.Wait()
	```
- Use `atomic.Pointer[T]` and `atomic.Bool` for lock-free reads/writes on hot paths (e.g., latest telemetry frame, flags checked every render tick) — prefer atomics over mutexes when the shared state is a single value read far more often than written.

## Logging

- Use `log/slog` for structured logging throughout the codebase.
- Create tagged child loggers per subsystem: `logger.With("component", "vocore")`.
- Use `slog.NewJSONHandler` for file output and `slog.NewTextHandler` for console output.
- Set log level via environment variable (`LOG_LEVEL=debug`).
- Avoid `log.Printf` in new code — use `slog.Info`, `slog.Error`, etc.

## Platform-Specific Code

- Use Go build tag file naming: `_windows.go`, `_linux.go`, `_darwin.go`.
- Provide a stub file with a `//go:build` constraint for unsupported platforms.
- Keep the platform-independent interface in a shared file and implementations in per-OS files.

## HTTP Server Pattern

- Use the enhanced `net/http` `ServeMux` with pattern-based routing and method matching (e.g., `mux.HandleFunc("GET /api/health", handler)`).
- Use middleware for cross-cutting concerns.
- Wrap errors with context using `fmt.Errorf` with `%w`; do not log and return errors (choose one).

## Error Handling

- Check errors immediately after the function call.
- Wrap with context: `fmt.Errorf("doing X: %w", err)`.
- Keep error messages lowercase, no trailing punctuation.
- Use `errors.Is` and `errors.As` for checking; export sentinel errors with `errors.New`.
