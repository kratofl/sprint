using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using DiagnosticsLogLevel = Sprint.Desktop.Features.Diagnostics.LogLevel;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Updates;
using Sprint.Desktop.Host;
using Sprint.Desktop.Runtime;
using Sprint.Games;

const string token = "SPRINT_DESKTOP_TOKEN";
string bearer = Environment.GetEnvironmentVariable(token) ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:0");
WebApplication app = builder.Build();
DesktopState state = new();
string? dataRoot = Environment.GetEnvironmentVariable("SPRINT_DESKTOP_DATA_ROOT");

// Diagnostics: installed first, before any other wiring, so logging and crash capture cover
// the entire host process lifetime -- mirrors the deleted Avalonia client's Program.Main, which
// called AppDiagnostics.Install() before composing the app. Rooted beside the runtime's other
// data, same convention as session-plans/lap-history below, so a temp data root in tests gets
// its own throwaway diagnostics directory instead of polluting %AppData%. Install() also hooks
// the global AppDomain/TaskScheduler unhandled-exception handlers into CrashReporter, and makes
// AppDiagnostics.Log/LiveLog the one canonical logger for the whole process (fed into
// DesktopRuntime below) instead of a second, parallel logger -- so /api/diagnostics/logs and a
// crash's mirrored log line read from the same store. echoToConsole stays off: stdout carries
// the { "type": "ready", port } readiness record Electron parses, and a stray log line would
// corrupt that contract.
string resolvedDataRoot = dataRoot ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sprint");
DiagnosticsPaths diagnosticsPaths = new(Path.Combine(resolvedDataRoot, "diagnostics"));
AppDiagnostics.Install(diagnosticsPaths, DiagnosticsLogLevel.Info);
AppDiagnostics.Log.Info($"Sprint Desktop Host {BuildInfo.Version} starting");
ILog log = AppDiagnostics.Log;
LiveLogStore liveLog = AppDiagnostics.LiveLog
    ?? throw new InvalidOperationException("AppDiagnostics.Install did not wire a LiveLogStore.");

DesktopRuntime runtime = new(dataRoot: dataRoot, log: log);
RuntimeCoordinator coordinator;
FrameStore frames = new();
// Last mile of the dash pipeline: connects frames POSTed by Electron's offscreen browsers to
// real USB screens (and, for the rear-view mirror purpose, captures the desktop natively). FrameStore
// above only remembers delivery stats for /api/state; this is what actually opens a driver and
// pushes RGB565 to hardware.
ScreenOutputService screenOutputs = new(log);
// Which page each screen currently shows (dash.page.next/prev). One shared instance: the
// RuntimeCoordinator command handlers advance it, and /api/state's screens[] below reads it back
// -- a command's effect would never be visible otherwise.
DashPageCycle dashPageCycle = new();
// Enums cross the wire as names, not ordinals: the TypeScript client models them
// as string unions, and a bare number is unreadable in a payload dump.
JsonSerializerOptions json = new(JsonSerializerDefaults.Web);
json.Converters.Add(new JsonStringEnumConverter());

// Session-planning/analysis persistence (WEB_DESKTOP_CUTOVER item 3) lives beside the
// runtime's other data (devices.json, dash-layouts/) rather than duplicating its own
// AppData/Sprint default, so both stores read/write the same directory the runtime does.
ISessionPlanStore planStore = new LocalSessionPlanStore(Path.Combine(runtime.DataRoot, "session-plans"), log);
ILapHistoryStore lapHistoryStore = new LocalLapHistoryStore(Path.Combine(runtime.DataRoot, "lap-history"), log);
ILapTraceStore lapTraceStore = new LocalLapTraceStore(Path.Combine(runtime.DataRoot, "lap-traces"), log);

// SessionPlannerService/AnalysisController own the write-side command surface (WEB_DESKTOP_CUTOVER
// item 1/2); /api/state keeps reading the stores directly below so a write through the service is
// visible on the next poll without the two paths needing to share one instance.
SessionPlannerService plannerService = new(planStore, log);
AnalysisController analysisController = new(new LapCorpusBrowser(lapHistoryStore, lapTraceStore));
coordinator = new RuntimeCoordinator(runtime, plannerService, analysisController, liveLog, dashPageCycle);

// The New plan dialog's prefill and recorded game/car/track choices (GET /api/planner/context).
// Only Prefill() and ContextOptions() are used: those rules live on the planner controller, so
// the dialog cannot drift from the spellings the lap-history buckets are keyed on.
SessionPlannerController planContext = new(plannerService, NoFuelHistorySource.Instance, LastSeenContext, lapHistoryStore);

// The LMU results import (#185): the startup prompt and the manual "Import results" action both
// go through these focused endpoints, never the polled state -- a scan can parse hundreds of files.
ResultsImports resultsImports = new(
    GameProviders.Default.Results,
    lapHistoryStore,
    new ResultsImportLedger(runtime.DataRoot, log),
    log);

// Update checks (WEB_DESKTOP_CUTOVER item 4): check-and-notify only, by product decision — no
// unattended install. UpdateCheckSession caches the last result per (version, channel) so
// repeated polls do not re-hit the network; ?force=true bypasses the cache for an explicit
// "Check for updates" action.
GitHubReleaseSource releaseSource = new();
UpdateCheckSession updateSession = new(ct => releaseSource.FetchAsync(GitHubReleaseSource.DefaultRepo, ct));

// Real game telemetry (WEB_DESKTOP_CUTOVER item 2): the shared provider selection,
// started headless and polled into DesktopState so /api/telemetry and /api/state carry
// live frames instead of the permanently-disconnected placeholder. TryRead/Connect never
// throw (contracted on ITelemetrySource/TelemetryEngine), so "no game running" surfaces
// as a clean disconnected/waiting status rather than an exception.
ITelemetrySource telemetrySource = GameProviders.Default.CreateTelemetrySource();
TelemetryEngine telemetryEngine = new(telemetrySource);
telemetryEngine.Start();

// The background wiring the deleted Avalonia MainWindow did for every telemetry frame
// (WEB_DESKTOP_CUTOVER parity gap): always-on lap recording, feeding the active session plan
// so an armed plan can auto-start and a tracked segment collects laps, remembering the
// game/car/track context a new plan is prefilled from, and latching the plan's lap-time
// target onto the delta tracker. Built over the SAME lapHistoryStore/lapTraceStore/plannerService
// instances above -- not fresh ones -- so a recorded lap or a plan write is visible on the very
// next /api/state poll and a plan.* command sees exactly what the ingest loop just did.
LapHistoryRecorder lapHistoryRecorder = new(lapHistoryStore, lapTraceStore, log: log);
PlanTargetDelivery planTargets = new(() => plannerService.ActivePlan, lapHistoryStore);
TelemetryIngestionPipeline ingestion = new(
    runtime,
    plannerService,
    lapHistoryRecorder,
    planTargets,
    telemetryEngine.RequestPlanReference,
    log);

// Bounds the trace tier's disk use (#194 parity). Off the request/ingest path, once at
// startup rather than per lap -- mirrors the deleted client's ThreadPool.QueueUserWorkItem
// call, just as a fire-and-forget Task instead.
LapTraceRetention lapTraceRetention = new(lapTraceStore, lapHistoryStore, log);
_ = Task.Run(() =>
{
    try
    {
        lapTraceRetention.Prune(runtime.Settings.SessionPlanner.TraceBudget(), DateTimeOffset.UtcNow);
    }
    catch (Exception ex)
    {
        log.Warn("Lap trace retention failed", ex);
    }
});

CancellationTokenSource telemetryPublishCts = new();
Task telemetryPublishLoop = Task.Run(async () =>
{
    using PeriodicTimer timer = new(TimeSpan.FromMilliseconds(33));
    try
    {
        while (await timer.WaitForNextTickAsync(telemetryPublishCts.Token))
        {
            EngineSnapshot snapshot = telemetryEngine.Snapshot;
            // Exactly-once per genuinely new frame regardless of this loop's poll cadence --
            // see TelemetryIngestionPipeline. Kept off the HTTP request path: this loop is the
            // only caller, and a bad frame in one consumer never stops the others or this loop.
            ingestion.Poll(snapshot.Frame);
            // Sources report the raw link; "stale" is derived from frame age, so it
            // only reaches the client if the host evaluates freshness here.
            TelemetryConnectionState effective = TelemetryFreshness.Evaluate(snapshot.Status, DateTimeOffset.UtcNow);
            TelemetryStatus status = effective == snapshot.Status.State
                ? snapshot.Status
                : snapshot.Status with { State = effective };
            state.Publish(new DesktopTelemetryState(snapshot.Frame, status, snapshot.Hz));
        }
    }
    catch (OperationCanceledException)
    {
        // Expected on shutdown.
    }
});

// Reconciles hardware screen outputs against the saved devices: starts/stops/rebuilds a
// ScreenPublisher per enabled dashboard device as they are added, removed, disabled, or
// reconfigured (WEB_DESKTOP_CUTOVER gate 3). Runs on its own short interval, independent of
// /api/state's poll cadence, so a device change takes effect even between polls.
CancellationTokenSource screenReconcileCts = new();
Task screenReconcileLoop = Task.Run(async () =>
{
    using PeriodicTimer timer = new(TimeSpan.FromSeconds(1));
    try
    {
        while (await timer.WaitForNextTickAsync(screenReconcileCts.Token))
        {
            // Held for the whole read-mutate-save sequence: this loop reads and can mutate the
            // very same SavedDevice objects a devices.* HTTP command mutates on a Kestrel thread,
            // so both sides take DesktopRuntime's DevicesGate (see its remarks) around their own
            // mutate-then-save block rather than letting a save race a concurrent mutation.
            lock (runtime.DevicesGate)
            {
                List<SavedDevice> devices = runtime.Devices.ToList();
                // Adopt hardware-detected sizes before reconciling so a size correction rebuilds
                // its output in this same tick rather than the next one (WEB_DESKTOP_CUTOVER item 3).
                if (screenOutputs.AdoptDetectedResolutions(devices))
                {
                    runtime.SaveDevices();
                }

                screenOutputs.Reconcile(devices);
            }
        }
    }
    catch (OperationCanceledException)
    {
        // Expected on shutdown.
    }
});

app.Lifetime.ApplicationStopping.Register(() =>
{
    telemetryPublishCts.Cancel();
    // Stamp the open lap-history session as finished so it is not left looking live, before
    // the engine that feeds it is torn down (mirrors the deleted Avalonia client's OnClosed).
    ingestion.Close();
    telemetryEngine.Dispose();
    screenReconcileCts.Cancel();
    screenOutputs.Dispose();
});

app.Use(async (context, next) =>
{
    if (!string.Equals(context.Request.Headers.Authorization.ToString(), $"Bearer {bearer}", StringComparison.Ordinal))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }
    await next(context);
});

app.MapGet("/api/state", () =>
{
    AnalysisState analysis = analysisController.State();
    return Results.Json(new
    {
        telemetry = state.Telemetry,
        // What the active plan is aiming at (#189 parity), for the target.* dash bindings
        // (packages/dashboard/src/bindings.ts DashTargets). Scoped once for the whole state,
        // not per screen: the deleted Avalonia client fed the very same PlanTargetDelivery
        // instance to every device's dash painter, so there was only ever one set of targets
        // in force at a time, never a per-device one.
        targets = planTargets.Targets,
        settings = runtime.Settings,
        controls = runtime.Controls,
        catalog = runtime.Catalog,
        devices = runtime.Devices,
        dashLayouts = runtime.DashLayouts,
        setupTemplates = runtime.SetupTemplates,
        setupPrograms = runtime.SetupPrograms,
        setupParameters = DesktopRuntime.SetupParameters,
        engineerControls = runtime.EngineerControls,
        radioLog = runtime.RadioLog,
        engineerPushState = runtime.EngineerPushState,
        plans = planStore.LoadAll(),
        lapHistory = lapHistoryStore.LoadAll(),
        analysis = new
        {
            filter = new
            {
                game = analysisController.Filter.Game,
                track = analysisController.Filter.Track,
                carClass = analysisController.Filter.CarClass,
                carModel = analysisController.Filter.CarModel,
                day = analysisController.Filter.Day,
                games = analysisController.Filter.Games,
                tracks = analysisController.Filter.Tracks,
                classes = analysisController.Filter.Classes,
                carModels = analysisController.Filter.CarModels,
                days = analysisController.Filter.Days,
                sessions = analysisController.Filter.Sessions,
            },
            session = analysis.Session,
            laps = analysis.Laps,
            primary = analysis.Primary,
            comparison = analysis.Comparison,
            notice = analysis.Notice,
        },
        // Whether the game has an archive to import from; hides every import entry point when not.
        resultsImport = new
        {
            available = resultsImports.Available,
            sourceName = resultsImports.SourceName,
        },
        diagnostics = new
        {
            logLevel = liveLog.MinimumLevel,
            directory = diagnosticsPaths.Root,
        },
        updates = new
        {
            version = BuildInfo.Version,
            channel = runtime.Settings.UpdateChannel,
        },
        screens = ScreenOutputs.Describe(runtime.Devices, runtime.DashLayouts, frames, state.Telemetry.Status.IsLive, screenOutputs.HardwareFor, dashPageCycle)
    }, json);
});

app.MapGet("/api/telemetry", () => Results.Json(state.Telemetry, json));
app.MapPost("/api/shutdown", () =>
{
    app.Lifetime.StopApplication();
    return Results.Accepted();
});
app.MapPost("/api/commands", async (HttpRequest request) =>
{
    using StreamReader reader = new(request.Body);
    string body = await reader.ReadToEndAsync();
    using JsonDocument document = JsonDocument.Parse(body);
    if (!document.RootElement.TryGetProperty("type", out JsonElement type))
    {
        return Results.BadRequest(new { error = "command type is required" });
    }
    if (!coordinator.Execute(document.RootElement, out string error)) return Results.BadRequest(new { error });
    return Results.Ok(new { accepted = true, type = type.GetString() });
});

// Focused endpoint (WEB_DESKTOP_CUTOVER item 2): a lap's channel trace can be a few hundred KB,
// so it stays out of the frequently-polled /api/state and is fetched on demand instead.
app.MapGet("/api/analysis/trace/{sessionId}/{lapNumber:int}", (string sessionId, int lapNumber) =>
{
    LapChannelTrace? trace = lapTraceStore.Load(LapTraceId.For(sessionId, lapNumber));
    return trace is null ? Results.NotFound() : Results.Json(trace, json);
});

// Focused endpoint: building the choices reads every lap-history file's context, which is far too
// much work for the 4 Hz state poll, so the New plan dialog fetches it once when it opens.
app.MapGet("/api/planner/context", async (CancellationToken ct) =>
{
    PlanContextChoices choices = await Task.Run(() => PlanContextChoices.From(planContext.Prefill(), planContext.ContextOptions()), ct);
    return Results.Json(choices, json);
});

app.MapPost("/api/results-import/scan", async (HttpRequest request, CancellationToken ct) =>
{
    bool includeDeclined = string.Equals(request.Query["includeDeclined"], "true", StringComparison.OrdinalIgnoreCase);
    ResultsImportOffer offer = await resultsImports.ScanAsync(includeDeclined, ct);
    return Results.Json(offer, json);
});

app.MapPost("/api/results-import/import", async (ResultsImportRequest body, CancellationToken ct) =>
{
    if (!body.TryGetIds(out IReadOnlyList<string> ids))
    {
        return Results.BadRequest(new { error = "ids must be an array of entry ids" });
    }

    ResultsImportResult result = await resultsImports.ImportAsync(ids, ct);
    if (result is { Outcome: ResultsImportOutcome.Imported, ImportedCount: > 0 })
    {
        // The corpus grew behind Analysis' session filter, which is only rebuilt on a load.
        analysisController.Load();
    }

    return Results.Json(result, json);
});

app.MapPost("/api/results-import/decline", async (ResultsImportRequest body, CancellationToken ct) =>
{
    if (!body.TryGetIds(out IReadOnlyList<string> ids))
    {
        return Results.BadRequest(new { error = "ids must be an array of entry ids" });
    }

    await resultsImports.DeclineAsync(ids, ct);
    return Results.NoContent();
});

app.MapGet("/api/diagnostics/logs", (HttpRequest request) =>
{
    string? levelText = request.Query["minLevel"];
    string? text = request.Query["text"];
    DiagnosticsLogLevel minLevel = Enum.TryParse(levelText, ignoreCase: true, out DiagnosticsLogLevel parsed) ? parsed : DiagnosticsLogLevel.Debug;
    return Results.Json(liveLog.Filter(minLevel, text), json);
});

app.MapPost("/api/updates/check", async (HttpRequest request) =>
{
    bool force = string.Equals(request.Query["force"], "true", StringComparison.OrdinalIgnoreCase);
    UpdateCheckResult result = await updateSession.CheckAsync(BuildInfo.Version, runtime.Settings.UpdateChannel, forceRefresh: force);
    return Results.Json(result, json);
});

// One-click self-replacing install (WEB_DESKTOP_CUTOVER item 2), explicitly requested only --
// never triggered automatically. The Electron main process is this host's parent and the only
// party that knows its own pid/install directory/executable name (the host itself runs from
// resources/host/, not the app), so it supplies them in the request body rather than the host
// deriving them from its own Environment.ProcessPath. Every field is validated strictly before
// anything touches disk: this endpoint overwrites installDir and launches a batch file.
app.MapPost("/api/updates/install", async (HttpRequest request, CancellationToken ct) =>
{
    string body;
    using (StreamReader reader = new(request.Body))
    {
        body = await reader.ReadToEndAsync(ct);
    }

    int pid = 0;
    string? installDir = null;
    string? exeName = null;
    try
    {
        using JsonDocument document = JsonDocument.Parse(body);
        JsonElement root = document.RootElement;
        if (root.TryGetProperty("pid", out JsonElement pidElement) && pidElement.TryGetInt32(out int parsedPid))
        {
            pid = parsedPid;
        }

        if (root.TryGetProperty("installDir", out JsonElement installDirElement) && installDirElement.ValueKind == JsonValueKind.String)
        {
            installDir = installDirElement.GetString();
        }

        if (root.TryGetProperty("exeName", out JsonElement exeNameElement) && exeNameElement.ValueKind == JsonValueKind.String)
        {
            exeName = exeNameElement.GetString();
        }
    }
    catch (JsonException)
    {
        return Results.BadRequest(new { error = "request body must be valid JSON." });
    }

    if (!UpdateInstallTargetValidator.TryValidate(pid, installDir, exeName, out UpdateInstallTarget? target, out string? validationError))
    {
        return Results.BadRequest(new { error = validationError });
    }

    if (!UpdateInstaller.SupportsSelfReplace)
    {
        return Results.BadRequest(new { error = "self-replacing update install is only supported on Windows." });
    }

    UpdateInstallResult result = await InstallUpdateAsync(target, ct);
    return Results.Json(result, json);
});

app.MapPost("/api/screens/{id}/frame", async (string id, HttpRequest request) =>
{
    if (!int.TryParse(request.Headers["x-frame-width"], out int width)
        || !int.TryParse(request.Headers["x-frame-height"], out int height)
        || !long.TryParse(request.Headers["x-frame-sequence"], out long sequence)
        || width <= 0 || height <= 0)
    {
        return Results.BadRequest(new { error = "frame headers are invalid" });
    }
    int expected = checked(width * height * 4);
    byte[] bgra = new byte[expected];
    int read = 0;
    while (read < expected)
    {
        int count = await request.Body.ReadAsync(bgra.AsMemory(read, expected - read), request.HttpContext.RequestAborted);
        if (count == 0) break;
        read += count;
    }
    if (read != expected) return Results.BadRequest(new { error = "frame body size does not match headers" });

    // Routing (real device output) and FrameStore (delivery stats for /api/state) are
    // independent: a frame for a device with no active output still counts as delivered.
    ScreenFramePublishResult routed = await screenOutputs.PublishFrameAsync(id, width, height, bgra, request.HttpContext.RequestAborted);
    if (routed == ScreenFramePublishResult.DimensionMismatch)
    {
        return Results.BadRequest(new { error = "frame dimensions do not match the device's configured output size" });
    }

    frames.Publish(id, width, height, sequence, bgra.Length);
    return Results.Accepted($"/api/screens/{id}/frame", new { accepted = true, sequence, routed = routed == ScreenFramePublishResult.Routed });
});

app.Lifetime.ApplicationStarted.Register(() =>
{
    string? address = app.Urls.FirstOrDefault();
    int port = address is null ? 0 : new Uri(address).Port;
    Console.WriteLine(JsonSerializer.Serialize(new { type = "ready", port }, json));
});

// Backs POST /api/updates/install: check → pick the platform asset → download/stage → build and
// launch the self-replace batch at the caller-supplied target. Downloading can take a while, so
// this stays async and threads the request's CancellationToken instead of blocking other
// endpoints. Never bricks the running host: any failure is reported back as a result, not thrown.
async Task<UpdateInstallResult> InstallUpdateAsync(UpdateInstallTarget target, CancellationToken ct)
{
    UpdateCheckResult check = await updateSession.CheckAsync(BuildInfo.Version, runtime.Settings.UpdateChannel, ct: ct);
    if (!check.UpdateAvailable || check.Latest is null)
    {
        return new UpdateInstallResult(UpdateInstallOutcome.NoUpdate);
    }

    ReleaseInfo latest = check.Latest;
    ReleaseAsset? asset = ReleaseAssetSelector.Select(latest.Assets, UpdateInstaller.CurrentRid);
    if (asset is null)
    {
        return new UpdateInstallResult(UpdateInstallOutcome.Failed, latest.Version, "No download is published for this platform.");
    }

    try
    {
        UpdateInstaller installer = new();
        StagedUpdate staged = await installer.DownloadAsync(latest.Version, asset, ct: ct);
        UpdateInstaller.LaunchWindowsSelfReplace(staged.StagingDir, target.Pid, target.InstallDir, target.ExeName);
        log.Info($"Update install staged and launched: version={latest.Version} pid={target.Pid} installDir={target.InstallDir}.");
        return new UpdateInstallResult(UpdateInstallOutcome.Staged, latest.Version);
    }
    catch (Exception ex)
    {
        log.Warn($"Update install failed: version={latest.Version}.", ex);
        return new UpdateInstallResult(UpdateInstallOutcome.Failed, latest.Version, UpdateInstaller.DescribeFailure(ex));
    }
}

// The remembered game/car/track (TelemetryIngestionPipeline keeps it current from every frame),
// as the planner controller's prefill and its "live" context option.
PlanContext LastSeenContext()
{
    LastSeenContext seen = runtime.Settings.LastSeenContext;
    return new PlanContext(seen.Game, seen.Car, seen.Track);
}

try
{
    await app.RunAsync();
    AppDiagnostics.Log.Info("Sprint Desktop Host exited normally");
}
catch (Exception ex)
{
    // Fatal exception escaping the web host: record it before the process dies so a report
    // exists to attach to a bug, then rethrow so the OS still sees a non-zero exit / normal
    // crash semantics -- mirrors the deleted Avalonia client's Program.Main.
    string? crashReportPath = AppDiagnostics.Crash?.Report("Host", ex);
    AppDiagnostics.Log.Error(
        crashReportPath is null
            ? "Fatal host exception (crash report could not be written)"
            : $"Fatal host exception; crash report: {crashReportPath}");
    throw;
}
