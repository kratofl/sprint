## Go Guidance

### Package Rules

- Each Go file must have exactly one `package` declaration.
- Preserve the existing package name when editing a file.
- New files must match the package used by sibling files in the same directory.

### Workspace Rules

- `app`, `api`, and `pkg` are linked by `go.work`.
- Run `go work sync` after changing module dependencies.
- Use `internal/` for packages that should not be imported externally.
- Prefer generics over unconstrained types and use `any` instead of `interface{}`.

### HTTP Clients

- Keep client structs limited to configuration such as base URL, auth, and `*http.Client`.
- Build a fresh `*http.Request` per method call.
- Accept `context.Context` on request methods.
- Always close response bodies.

### I/O

- Treat `io.Reader` values as single-use unless buffered explicitly.
- Reuse payloads via `[]byte` plus `bytes.NewReader`.
- For streaming multipart uploads, write sequentially through `io.Pipe`.
- Avoid unbounded buffering for large payloads.

### Concurrency

- Use `WaitGroup.Go` for tracked goroutines.
- Use `atomic.Pointer[T]` and `atomic.Bool` for hot-path state when reads greatly outnumber writes.

### Logging

- Use `log/slog` for new logging.
- Create tagged child loggers per subsystem.
- Prefer structured fields over interpolated strings.

### Platform Files

- Use `_windows.go`, `_linux.go`, and `_darwin.go` file naming for platform implementations.
- Provide explicit stubs for unsupported platforms where needed.

### HTTP Servers

- Use `net/http` `ServeMux` pattern routing.
- Use middleware for cross-cutting concerns.
- Wrap returned errors with context using `%w`.

### Errors

- Check errors immediately.
- Keep error messages lowercase and without trailing punctuation.
- Use `errors.Is` and `errors.As` for checks.
