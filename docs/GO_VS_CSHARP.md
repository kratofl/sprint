# Go vs C# — Sprint Platform: Technical Analysis

A grounded comparison of Go and C# for this codebase, covering technical fit,
distribution, maintainability, and ecosystem. Written to answer the question:
_"Should Sprint be rewritten in C#, and what would be better or worse?"_

---

## What the codebase actually uses (Go-specific inventory)

### Desktop app (`/app`)

| Concern | How it's done today |
|---|---|
| Desktop framework | **Wails v2** — Go backend + embedded React/TS frontend |
| 2D rendering | **fogleman/gg** — canvas-based, produces `image.RGBA` |
| Font rendering | `golang.org/x/image/font` + `opentype` |
| VoCore USB | **Direct WinUSB syscalls** — no CGO, no libusb, pure Go `syscall` |
| USB device enumeration | **SetupDI Win32 APIs** — direct `syscall` calls |
| Shared memory (game telemetry) | **MapViewOfFile** — direct `syscall`, build-tagged per OS |
| Concurrency | **Goroutines** — render loop, SHM reader, WebSocket server, sync client |
| Cross-platform stubs | `//go:build windows` tags with stub files for macOS/Linux |
| Binary output | **Single `.exe`**, no runtime dependency |

### API server (`/api`)

| Concern | How it's done today |
|---|---|
| HTTP/WebSocket | Go stdlib `net/http` + `gorilla/websocket` |
| Auth | `golang-jwt/jwt` |
| Binary output | Single binary, no dependencies |

### Shared types (`/pkg`)

| Concern | How it's done today |
|---|---|
| DTO sharing | Go workspace (`go.work`) — `/app` and `/api` both import `/pkg/dto` |
| Type sync to TS | Manual mirror in `@sprint/types` |

---

## Where Go wins for this project

### 1. Single-binary distribution — major win

Go compiles to a single `.exe` with zero runtime dependencies. No installer, no "please
install .NET 8 runtime" prompt. For sim racers, this matters. A C# self-contained
publish starts around 70–100 MB and adds startup latency; a Go binary is 10–20 MB
and starts in milliseconds.

### 2. Wails is purpose-built for exactly this use case

Wails v2 is essentially "Go + WebView2 + embedded React" — identical to what this
project needs. The alternative in C# would be Blazor Hybrid (MAUI), which is:
- Significantly heavier (ships full MAUI runtime)
- Less mature for standalone Windows desktop tooling
- Harder to build/package as a single distributable

WebView2-based C# without MAUI is possible but requires hand-rolling the embedding
that Wails already provides.

### 3. The WinUSB driver is already done — and it's clean

The VoCore USB transport (`vocore_usb.go`) directly calls `winusb.dll` and
`setupapi.dll` via Go's `syscall` package — no CGO, no libusb, no third-party driver
wrapper needed. This code is complete and tested. In C#, the equivalent is P/Invoke
to the same DLLs, which is similarly verbose. Neither language has a clear edge here,
but the Go version is already working.

### 4. Goroutines map perfectly to the architecture

The concurrency pattern in this app is:

```
SHM reader goroutine → coordinator → render goroutine → USB writer
                                   → WebSocket broadcaster
                                   → sync client
```

Go goroutines are ~2 KB stack each and trivially cheap to spawn. The coordinator's
`SetEmit(fn)` pattern is idiomatic Go. In C#, `Task`/`async-await` would work but
introduces more ceremony (`CancellationToken`, `IHostedService`) and the mental model
is heavier for this kind of tight producer-consumer pipeline.

### 5. Go workspace cleanly shares types across modules

`go.work` lets `/app` and `/api` both import `/pkg/dto` at workspace-resolution time
— no publish, no version bump, no NuGet feed. The equivalent in C# is a shared class
library project referenced by two solutions, which works but requires more tooling
ceremony (NuGet local feeds or project references across solution boundaries).

### 6. No CGO = clean CI/CD

Every piece of Windows API interaction in this codebase (`WinUSB`, `SetupDI`,
`MapViewOfFile`) is done via Go's `syscall`/`golang.org/x/sys/windows` without CGO.
This means the app cross-compiles with `GOOS=windows GOARCH=amd64 go build` from
any OS. GitHub Actions runs it cleanly on `ubuntu-latest`. CGO would break this.

> **Note:** The Linux build path for VoCore (`vocore_scan_usb.go`) does use
> `google/gousb` with CGO. The Windows build — the primary target — is CGO-free.

### 7. 30 Hz render loop — predictable latency

Go's GC is designed for low-latency workloads (sub-1ms pauses are common). The
painter reuses a pre-allocated `*image.RGBA` across frames specifically to minimise
GC pressure. C#'s GC is more sophisticated but also more unpredictable for tight
render loops — you'd need to be deliberate with `Span<T>`, `ArrayPool`, and `unsafe`
to achieve the same latency profile.

---

## Where C# would be better

### 1. Graphics library depth

`fogleman/gg` is a capable 2D canvas but it's a hobby-grade library with no active
upstream development. C# has:

- **SkiaSharp** — Google's production 2D graphics engine (same one Chrome uses)
- **System.Drawing** / **ImageSharp** — well-maintained with extensive text rendering

For a dash layout with complex widgets, gradients, clipping, and bitmap composition,
SkiaSharp is significantly more capable than `gg`.

*Impact: medium-high if render complexity grows. Low right now.*
*See [issue #39](https://github.com/kratofl/sprint/issues/39) for the tracked concern.*

### 2. Sim racing ecosystem

iRacing's SDK is C# first. Existing tools in the sim racing space (SimHub, CrewChief,
iOverlay) are all .NET. This means more reference implementations, community libraries,
and protocol documentation framed around C#. For adding new game adapters, the
ecosystem advantage is real.

### 3. Visual Studio tooling

For Windows-specific API work (P/Invoke, COM interop, WinUSB), Visual Studio's
debugger, memory profiler, and IntelliSense are better than any Go IDE. GoLand is
strong, but for low-level Windows work C# has the edge.

### 4. LINQ for telemetry data processing

Data transformation pipelines (filtering laps, computing deltas, aggregating sector
times) are more ergonomic in C# with LINQ. Go's equivalent is loops, which work fine
but are more verbose.

### 5. P/Invoke documentation

The C# community has extensive documentation for every Windows API, including WinUSB
([pinvoke.net](https://www.pinvoke.net), Microsoft Docs). While Go's equivalent works
(as proven), finding examples and debugging edge cases is easier in C#.

---

## Where C# would be worse

### 1. Distribution story is weaker

- .NET 8+ must be installed OR you ship a ~80–100 MB self-contained bundle
- Go ships a 10–20 MB single `.exe` with no runtime dependency
- For a sim racing tool that competes with SimHub, bundle size matters

### 2. Wails equivalent is immature

Blazor Hybrid (via .NET MAUI) is the closest equivalent, but:
- MAUI is still maturing on Windows desktop
- It carries a much larger dependency surface
- The React/TS frontend would need to be replaced or wrapped differently
- Hot reload and dev iteration are slower than Wails

### 3. Type sharing across components degrades

The `/pkg` → `/app` → `/api` type-sharing story is clean in Go. In C#:
- You'd need a `Sprint.Shared` NuGet package or project reference
- The TypeScript mirror in `@sprint/types` still needs manual sync regardless
- No equivalent of `go.work` for monorepo workspace linking

### 4. Binary weight and startup time

A C# desktop app (even self-contained) takes longer to start and uses more RAM at
idle. For a process running in the background during a racing session, this matters.

---

## Neutral — equivalent in both

| Concern | Verdict |
|---|---|
| WinUSB / SetupDI | Both use direct OS API calls (syscall vs P/Invoke). Equivalent. |
| WebSocket server | Both have mature libraries. Equivalent. |
| JWT auth | Both have mature libraries. Equivalent. |
| Shared memory | Both map directly to Win32 APIs. Equivalent. |
| JSON serialisation | Both are fast and mature. Equivalent. |
| HTTP server (API) | Go stdlib is excellent; C# has ASP.NET Core. Both great. |

---

## Maintainability — Go vs C#

### Language complexity — Go wins clearly

Go's language spec is intentionally and permanently small. There are no:
- Generics abuse patterns (generics exist in Go 1.18+ but are used sparingly)
- Inheritance hierarchies
- Multiple async models (there is only goroutines + channels)
- Implicit interface magic
- Attribute-based DI frameworks
- Operator overloading, extension methods, partial classes

C# has accumulated features across 20+ years: `async/await`, `Task` vs `ValueTask`,
records, init-only setters, pattern matching, nullable reference types, expression-bodied
members, primary constructors, LINQ, spans, ref structs, default interface methods...
A C# codebase from 2018 looks visually different from one written in 2025. Go code
from 2015 looks almost identical to Go code written today.

**Impact:** Any developer who knows Go can read any part of this codebase immediately.
There is no "advanced C# features" prerequisite.

### This specific codebase is well-structured for long-term maintenance

**Coordinator (`app/internal/core/core.go`):**
- All dependencies are explicit struct fields — no hidden injection, no reflection
- 236 lines, zero magic
- Lifecycle is entirely traceable: `New()` → `SetEmit()` → `Start()` → goroutines

**Widget system (`app/internal/dashboard/widgets/`):**
- Adding a widget requires **exactly one new file**; zero other files change
- `init()` + registry pattern: each `widget_*.go` calls `RegisterWidget()` on load
- `WidgetCtx` provides helpers (`Panel()`, `HBar()`, `FontNumber()`) so widget
  implementations are typically 30–60 lines
- The `WidgetCtx` docstring includes a copy-paste example for new widgets

The equivalent in C# would likely involve base classes or interfaces, potentially a
DI-registered service locator — more ceremony for the same outcome.

### Error handling — trade-off, not a clear winner

Go's explicit error returns (`if err != nil`) are verbose but every error path is
visible in the code. You can read `vocore_usb.go` and trace exactly what happens on
each possible failure — there are no hidden exception paths.

C# exceptions are more concise to write but harder to trace. A thrown exception in a
deep call chain can propagate invisibly across dozens of stack frames. For a real-time
system where partial failure (e.g. USB write error → reconnect) must be handled
explicitly at the right layer, Go's explicitness is actually safer.

### The hard code — equally difficult in either language

`vocore_usb.go` and `pkg/shm/shm_windows.go` use `unsafe.Pointer` and direct
`syscall` invocations. This code is genuinely difficult to maintain regardless of
language. The C# equivalent (P/Invoke to `winusb.dll`, `MapViewOfFile`) has more
community documentation but is not structurally simpler:

```csharp
// C# P/Invoke equivalent of the WinUSB initialisation in vocore_usb.go
[DllImport("winusb.dll", SetLastError = true)]
static extern bool WinUsb_Initialize(SafeFileHandle DeviceHandle, out IntPtr InterfaceHandle);
```

The Go version (`procWinUsbInitialize.Call(...)`) is less ergonomic to read, but the
C# version requires understanding P/Invoke marshalling, `SafeHandle` lifecycle, and
COM-style `SetLastError` conventions. Neither is beginner-friendly.

**One genuine C# advantage:** `windows.h` types are documented exhaustively at
pinvoke.net. Translating those docs to Go `syscall` structs (like
`spDeviceInterfaceData`) requires more manual work — but it's a one-time cost.

### Tooling — C# wins for large-scale refactoring

| Task | Go | C# |
|---|---|---|
| Formatting | `go fmt` — enforced, no config, no debate | Configurable, can cause style arguments |
| Rename symbol | GoLand/VS Code (good) | Rider/Visual Studio (excellent, safer across projects) |
| Find usages | Works well | Works better, understands implicit interface implementations |
| Profiler | `pprof` — powerful but CLI-first | Visual Studio / Rider — GUI, easier to navigate |
| Static analysis | `golangci-lint` — solid | Roslyn analysers — deeper, more rules, IDE-integrated |
| Debugging | Delve (good) | VS debugger (excellent, especially for Windows API calls) |

For this project's current size, Go tooling is sufficient. The C# tooling advantage
becomes meaningful at 100k+ lines or during large structural refactors.

### Language stability — Go wins

Go has a [formal compatibility guarantee](https://go.dev/doc/go1compat): any code that
compiles with Go 1.0 still compiles today. This is not marketing — it's enforced.

C# and .NET have had significant migration pain:
- .NET Framework → .NET Core (2016) — not backwards compatible
- Nullable reference types (C# 8) — require opt-in and code changes across a codebase
- Each major .NET version deprecates some APIs

For a desktop tool maintained across years, Go's stability guarantee meaningfully
reduces future maintenance burden.

### Contributor pool — C# wins

C# has more developers globally. For a niche sim racing tool this matters less — the
intersection of "sim racer" and "developer" is already small, and Go has sufficient
adoption to find comfortable developers.

### Maintainability summary

| Dimension | Go | C# |
|---|---|---|
| Language simplicity | ✅ Much simpler spec | ❌ Enormous surface area |
| Code readability | ✅ No magic | ⚠️ Depends on team conventions |
| Adding a widget | ✅ 1 file, 0 other changes | ⚠️ More ceremony |
| Error tracing | ✅ Explicit at every layer | ⚠️ Exceptions can be opaque |
| Windows API documentation | ⚠️ Less community material | ✅ Excellent (pinvoke.net) |
| IDE / refactoring tools | ⚠️ Good | ✅ Excellent |
| Language stability | ✅ Formal compat guarantee | ⚠️ Historical churn |
| Contributor pool | ⚠️ Smaller | ✅ Larger |

---

## Overall verdict

**Stay with Go.** The case for switching is not strong enough to justify the rewrite
cost, and Go has specific advantages that are load-bearing for this project:

1. **Single binary** — biggest concrete win, hardest to replicate in C#
2. **Wails** — better fit than any C# desktop framework for this architecture
3. **Windows API code is already written** and works without CGO
4. **Goroutines** — model the concurrency pattern naturally
5. **Go's simplicity** — the codebase is readable and maintainable as-is

The one concrete area where C# would have a material advantage is graphics depth
(SkiaSharp > `fogleman/gg`). If the dashboard renderer needs to grow significantly in
complexity, the right move is replacing `gg` with a more capable Go renderer
([`tdewolff/canvas`](https://github.com/tdewolff/canvas) is the most likely candidate)
— not switching languages. See [issue #39](https://github.com/kratofl/sprint/issues/39).

**If this were greenfield today:** C# + SkiaSharp + WebView2 + embedded React is a
reasonable alternative. But "reasonable alternative" is not "worth rewriting."
