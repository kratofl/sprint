using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Sprint.Contracts;
using Sprint.Desktop;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.FirstRun;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Input;
using DiagnosticsLogLevel = Sprint.Desktop.Features.Diagnostics.LogLevel;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.Peer;
using Sprint.Desktop.Features.PitWall;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Features.Sharing;
using Sprint.Desktop.Host;
using Sprint.Desktop.Runtime;
using Sprint.Games;
using Sprint.Games.Recording;

const string token = "SPRINT_DESKTOP_TOKEN";
string bearer = Environment.GetEnvironmentVariable(token) ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
// The shipped appsettings.json sits beside the binary; the content root is wherever the host
// was started from, so it is read from there explicitly. Environment variables go back on top, so
// they still override it (e.g. Sprint__Features__SprintWeb=true for a dev run).
builder.Configuration.AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.json"), optional: true);
builder.Configuration.AddEnvironmentVariables();
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
// Which page each screen currently shows (dash.page.next/prev). One shared instance: the
// RuntimeCoordinator command handlers advance it, the wheel screens read it on every frame, and
// /api/state's screens[] below reads it back -- a command's effect would never be visible otherwise.
DashPageCycle dashPageCycle = new();
// Enums as names, the dash document's own spelling for its enums (see HostJson).
JsonSerializerOptions json = HostJson.Create();
// Browser / VR displays: a second, tokenless, read-only listener on 127.0.0.1:28780 that is open
// only while one is added and turned on. Its loop opens and closes the port; the screen outputs
// below hand it each display's scene.
BrowserDisplayServer browserDisplays = new(state, json, log);
CancellationTokenSource browserDisplaysCts = new();
Task browserDisplaysLoop = browserDisplays.RunAsync(browserDisplaysCts.Token);
// Where each wheel's multi-position dial stands, from its held position buttons (Raw Input, wired
// below). The wheel screens read it every frame to pop a turn up on the dash; /api/state reports it.
MultiDialTracker multiDials = new();
// The wheel screens: one render loop per enabled screen device draws its dash in-process with the
// Rust renderer from the published telemetry (or, for the rear-view mirror purpose, captures the
// desktop) and pushes RGB565 to the USB panel; browser displays get the same scenes, served. The
// reconcile loop below keeps it in step with the saved devices and dashes.
ScreenOutputService screenOutputs = new(log, telemetry: state, pageCycle: dashPageCycle, browserServer: browserDisplays, multiDials: multiDials);
// What a change of screen size would leave out of each dash, for /api/state's dashRefitLosses;
// it refits a dash again only once its layout has changed, not on every poll.
DashRefitLosses dashRefitLosses = new();

// Session-planning/analysis persistence (WEB_DESKTOP_CUTOVER item 3) lives beside the
// runtime's other data (devices.json, dash-layouts/) rather than duplicating its own
// AppData/Sprint default, so both stores read/write the same directory the runtime does.
ISessionPlanStore planStore = new LocalSessionPlanStore(Path.Combine(runtime.DataRoot, "session-plans"), log);
// Cached: every reader (state poll, Analysis, Live Compare, targets) would otherwise parse every
// history file on each call. Every writer in the host goes through this one instance, which keeps
// the cache true to disk (see CachingLapHistoryStore).
ILapHistoryStore lapHistoryStore = new CachingLapHistoryStore(new LocalLapHistoryStore(Path.Combine(runtime.DataRoot, "lap-history"), log));
ILapTraceStore lapTraceStore = new LocalLapTraceStore(Path.Combine(runtime.DataRoot, "lap-traces"), log);
// Where Le Mans Ultimate is installed. Applied before anything reads the game's files, and again
// by game.setFolder: setups and results are read through the provider per use, so they follow.
GameFolder gameFolder = new(GameProviders.LeMansUltimate);
gameFolder.Apply(runtime.Settings.GameFolder);
// The game's setups and every version of them Sprint has seen, for the Setups pages. Read-only
// towards the game folder; versions are kept in Sprint's own data directory.
SetupLibrary setupLibrary = new(GameProviders.Default, new LocalSetupSnapshotStore(Path.Combine(runtime.DataRoot, "setup-snapshots"), log), log);
// Which setup each run was driven with, as the driver picked it in Analysis.
RunSetups runSetups = new(Path.Combine(runtime.DataRoot, "run-setups.json"), log);

// SessionPlannerService/AnalysisController own the write-side command surface (WEB_DESKTOP_CUTOVER
// item 1/2); /api/state keeps reading the stores directly below so a write through the service is
// visible on the next poll without the two paths needing to share one instance.
SessionPlannerService plannerService = new(planStore, log, warnOnRaceFormatMismatch: () => runtime.Settings.SessionPlanner.WarnOnRaceFormatMismatch);
// The notes the driver leaves on laps in Analysis; they go with a lap when it is shared.
LapNotes lapNotes = new(Path.Combine(runtime.DataRoot, "lap-notes.json"), log);
AnalysisController analysisController = new(new LapCorpusBrowser(lapHistoryStore, lapTraceStore, lapNotes), runSetups, setupLibrary);
// Records every lap into the stores above; built here because Live Compare follows its open
// session to know which course is being driven. Fed by the telemetry loop further down.
LapHistoryRecorder lapHistoryRecorder = new(lapHistoryStore, lapTraceStore, log: log);
// Leaving the garage fixes the setup for the run: keep the version the game just read, off the
// telemetry thread, before the game can overwrite the file.
lapHistoryRecorder.OutingStarted += () => ThreadPool.QueueUserWorkItem(_ =>
{
    try
    {
        setupLibrary.Look();
    }
    catch (Exception ex)
    {
        log.Warn("Could not look at the game's setups when the car left the garage", ex);
    }
});
// Training against an older lap: the commands pick the target and open the HUD, the telemetry
// loop feeds the live line, and /api/compare/frame is what the HUD windows draw.
LiveCompareService liveCompare = new(new LapCorpusBrowser(lapHistoryStore, lapTraceStore), () => lapHistoryRecorder.OpenSession?.Context);
lock (runtime.SettingsGate)
{
    if (runtime.Settings.LiveCompare.Migrate())
    {
        runtime.SaveSettings();
    }

    liveCompare.Configure(runtime.Settings.LiveCompare);
}
// A plan's race figures from the lap history (#50), narrowed by the driver's planner setting.
LapHistoryFuelSource fuelHistory = new(lapHistoryStore, () => runtime.Settings.SessionPlanner.FuelHistorySource);

// The live link: this PC's telemetry straight to an engineer's desktop, no server in between.
// The link.* commands drive it, the telemetry loop below feeds it, its own worker owns the socket.
// The driver's side shares the planner's active plan, its race fuel and its target lap with the engineer's pit wall.
PitWallPlanShare pitWallShare = new(plannerService, lapTraceStore, fuelHistory);
PeerLink peerLink = new(UdpPeerSocket.Open, PeerNetwork.ResolveStunAsync, PeerNetwork.LocalAddresses, log, pitWallShare.Snapshot);
peerLink.SetSharePlan(runtime.Settings.LiveLink.SharePlan);
CancellationTokenSource peerLinkCts = new();
Task peerLinkLoop = peerLink.RunAsync(peerLinkCts.Token);
// The engineer's pit wall arrangement on this PC (pitwall.* commands, state.pitWallLayout).
PitWallLayoutStore pitWallLayouts = new(runtime.DataRoot, log);
// Deletes the traces no lap points at, and old ones only once the driver opts into an age limit
// in Settings (#194); the coordinator runs it the moment they do.
LapTraceRetention lapTraceRetention = new(lapTraceStore, lapHistoryStore, log);
coordinator = new RuntimeCoordinator(runtime, plannerService, analysisController, liveLog, dashPageCycle, peerLink, liveCompare, gameFolder, lapHistoryStore, pitWallLayouts, lapTraceRetention);

// The plan dialogs' prefill, recorded game/car/track choices and Quick plan detection
// (GET /api/planner/context), and their fuel calculator (POST /api/planner/fuel-estimate). Only
// Prefill(), ContextOptions(), Detect() and PreviewFuel() are used: those rules
// live on the planner controller, so the dialogs cannot drift from the spellings the lap-history
// buckets are keyed on, and the renderer never works out what was detected.
SessionPlannerController planContext = new(plannerService, fuelHistory, LastSeenContext, lapHistoryStore);

// The LMU results import (#185): the startup prompt and the manual "Import results" action both
// go through these focused endpoints, never the polled state -- a scan can parse hundreds of files.
ResultsImports resultsImports = new(
    () => GameProviders.Default.Results,
    lapHistoryStore,
    new ResultsImportLedger(runtime.DataRoot, log),
    log);

// The Sprint account: signing in goes over the network, so it has focused endpoints rather than
// a command, and /api/state only reports who is signed in. Kept beside the runtime's other data.
// Discovery and sync share its transport. The official server's address ships in appsettings.json
// (Sprint:OfficialServerUrl); empty means there is no official server yet.
SocketsHttpHandler cloudTransport = new() { ConnectTimeout = TimeSpan.FromSeconds(10) };
CloudAccount cloudAccount = new(new CloudSession(runtime.DataRoot, log), cloudTransport);
ServerDiscovery serverDiscovery = new(cloudTransport);
CloudSyncRunner cloudSync = new(
    cloudAccount,
    new CloudSync(new RuntimeSyncLocal(runtime, lapHistoryStore, log), new CloudSyncLedger(runtime.DataRoot, log)),
    runtime,
    log);
string officialServerUrl = (builder.Configuration["Sprint:OfficialServerUrl"] ?? "").Trim();
// Sprint web (accounts, sync, the server live stream) is behind a feature flag, off in the shipped
// appsettings.json until the server side is ready. Off, nothing talks to a server even if a sign-in
// is left over, and the UI hides every Sprint web surface. Sprint__Features__SprintWeb=true turns it on.
bool sprintWeb = builder.Configuration.GetValue<bool>("Sprint:Features:SprintWeb");
CancellationTokenSource cloudSyncCts = new();
Task cloudSyncLoop = sprintWeb ? cloudSync.RunAsync(cloudSyncCts.Token) : Task.CompletedTask;

// "Continue with Discord": the browser leg comes back to this host's loopback callback
// (DiscordCallbackPage.Path, the one route without the bearer token), guarded by DiscordSignIn's nonce.
DiscordSignIn discordSignIn = new(cloudAccount);

// Streams the session being driven to the signed-in server while sync keeps data there. Fed from
// the telemetry loop below without waiting on it; its own worker owns the WebSocket.
LiveUplink liveUplink = new(WebSocketLiveConnection.ConnectAsync, log);
Task liveUplinkLoop = sprintWeb ? liveUplink.RunAsync(cloudSyncCts.Token) : Task.CompletedTask;

// Real game telemetry (WEB_DESKTOP_CUTOVER item 2): the shared provider selection,
// started headless and polled into DesktopState so /api/telemetry and /api/state carry
// live frames instead of the permanently-disconnected placeholder. TryRead/Connect never
// throw (contracted on ITelemetrySource/TelemetryEngine), so "no game running" surfaces
// as a clean disconnected/waiting status rather than an exception.
ITelemetrySource telemetrySource = CreateTelemetrySource(log);

TelemetryEngine telemetryEngine = new(telemetrySource);
telemetryEngine.Start();

// The background wiring the deleted Avalonia MainWindow did for every telemetry frame
// (WEB_DESKTOP_CUTOVER parity gap): always-on lap recording, feeding the active session plan
// so an armed plan can auto-start and a tracked segment collects laps, remembering the
// game/car/track context a new plan is prefilled from, and latching the plan's lap-time
// target onto the delta tracker. Built over the SAME lapHistoryStore/lapTraceStore/plannerService
// instances above -- not fresh ones -- so a recorded lap or a plan write is visible on the very
// next /api/state poll and a plan.* command sees exactly what the ingest loop just did.
PlanTargetDelivery planTargets = new(() => plannerService.ReadActive(PlanTargetDelivery.Aim.Of), lapHistoryStore, fuelHistory);
TelemetryIngestionPipeline ingestion = new(
    runtime,
    plannerService,
    lapHistoryRecorder,
    planTargets,
    telemetryEngine.RequestPlanReference,
    log,
    liveUplink,
    peerLink);

// Names history filed before cars were named by class and make (CarNames): a one-time rewrite,
// which looks a stored livery up in the game's results archive only if one still needs naming.
// Shared with the shared-lap import, which names a friend's lap from an older Sprint the same way.
StoredCarNames storedCarNames = new(() => GameProviders.Default.Results?.ListCars() ?? []);

// Trace retention, off the request/ingest path, once at startup rather than per lap. The
// renaming goes first, in the same task: both rewrite sessions, and retention protects the
// fastest laps per car, so it should see the names.
_ = Task.Run(() =>
{
    try
    {
        int renamed = storedCarNames.RenameAll(lapHistoryStore);
        if (renamed > 0)
        {
            log.Info($"Named the car of {renamed} stored session(s)");
            // The cars changed behind Analysis' session filter, which is only rebuilt on a load.
            analysisController.Load();
        }

        // Plans and the remembered context named the car as its sessions did, and follow them.
        // From every session, not just the ones renamed now: installs renamed before this
        // existed still have plans under the old names.
        IReadOnlyDictionary<string, string> currentNames = StoredCarNames.FormerNames(lapHistoryStore.LoadAll());
        int replanned = plannerService.RenameCars(currentNames);
        if (replanned > 0)
        {
            log.Info($"Named the car of {replanned} session plan(s)");
        }

        lock (runtime.SettingsGate)
        {
            LastSeenContext seen = runtime.Settings.LastSeenContext;
            if (currentNames.TryGetValue(seen.Car, out string? seenCar) && !string.Equals(seenCar, seen.Car, StringComparison.Ordinal))
            {
                seen.Car = seenCar;
                runtime.SaveSettings();
            }
        }
    }
    catch (Exception ex)
    {
        log.Warn("Naming the cars of stored sessions failed", ex);
    }

    try
    {
        lapTraceRetention.Prune(runtime.Settings.SessionPlanner.TraceBudget(), DateTimeOffset.UtcNow);
    }
    catch (Exception ex)
    {
        log.Warn("Lap trace retention failed", ex);
    }
});

// How long the state takes to assemble (before serialisation) and the telemetry tick to run, for
// the dev debug window (/api/debug).
DebugTimings debugTimings = new();

CancellationTokenSource telemetryPublishCts = new();
Task telemetryPublishLoop = Task.Run(async () =>
{
    using PeriodicTimer timer = new(TimeSpan.FromMilliseconds(33));
    try
    {
        while (await timer.WaitForNextTickAsync(telemetryPublishCts.Token))
        {
            long tickStarted = Stopwatch.GetTimestamp();
            EngineSnapshot snapshot = telemetryEngine.Snapshot;
            // Exactly-once per genuinely new frame regardless of this loop's poll cadence --
            // see TelemetryIngestionPipeline. Kept off the HTTP request path: this loop is the
            // only caller, and a bad frame in one consumer never stops the others or this loop.
            ingestion.Poll(snapshot.Frame);
            liveCompare.Controller.Ingest(snapshot.Frame);
            liveUplink.Update(cloudAccount.Credentials, runtime.Settings.Cloud.Storage, lapHistoryRecorder.OpenSession);
            peerLink.Update(lapHistoryRecorder.OpenSession);
            // Sources report the raw link; "stale" is derived from frame age, so it
            // only reaches the client if the host evaluates freshness here.
            TelemetryConnectionState effective = TelemetryFreshness.Evaluate(snapshot.Status, DateTimeOffset.UtcNow);
            TelemetryStatus status = effective == snapshot.Status.State
                ? snapshot.Status
                : snapshot.Status with { State = effective };
            state.Publish(new DesktopTelemetryState(snapshot.Frame, status, snapshot.Hz));
            debugTimings.PublishTicked(Stopwatch.GetElapsedTime(tickStarted));
        }
    }
    catch (OperationCanceledException)
    {
        // Expected on shutdown.
    }
});

// Wheel buttons, encoders and dials (Raw Input; no-op off Windows). For now only the
// multi-position dials are followed: the tracker turns a wheel's held position button into the
// dial position /api/state reports, which the desktop shows and the dash pops up on a turn. Its
// dials are re-read from the saved devices on every reconcile tick below.
lock (runtime.DevicesGate)
{
    multiDials.Configure(MultiDials.Sources(runtime.Devices, runtime.Catalog));
}

IHardwareInputSource hardwareInput = HardwareInputSourceFactory.Create(log);
hardwareInput.InputPressed += (_, input) => multiDials.Observe(input);

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

                // Each dash screen's scene (its dash, the driver's name and number, the plan's
                // targets) is serialized here once a tick and only taken by a screen when it
                // changed, so a dash edit reaches the wheel within a second. The page and the
                // live/idle switch do not wait for this loop: the screens read those per frame.
                // Dash commands change the dash list without this gate; a copy that races one is
                // skipped, and the screens keep their scenes until the next tick.
                DashSceneInputs? scenes = null;
                try
                {
                    scenes = new DashSceneInputs([.. runtime.DashLayouts], runtime.Settings.DriverName, runtime.Settings.DriverNumber, planTargets.Targets);
                }
                catch (InvalidOperationException)
                {
                }

                screenOutputs.Reconcile(devices, scenes, runtime.Catalog);
                multiDials.Configure(MultiDials.Sources(devices, runtime.Catalog));
            }
        }
    }
    catch (OperationCanceledException)
    {
        // Expected on shutdown.
    }
});

// What is plugged into USB, for the Add device dialog's "Plugged in now" (foundDevices in
// /api/state, matched by DeviceDetection). A scan only lists devices -- it opens none -- so it
// never disturbs a screen an output is driving; every few seconds is enough for a dialog.
IReadOnlyList<UsbId> usbPresent = [];
CancellationTokenSource usbScanCts = new();
Task usbScanLoop = Task.Run(async () =>
{
    using PeriodicTimer timer = new(TimeSpan.FromSeconds(3));
    try
    {
        do
        {
            try
            {
                usbPresent = UsbPresence.Scan();
            }
            catch (Exception ex)
            {
                log.Debug($"USB scan failed: {ex.Message}");
            }
        }
        while (await timer.WaitForNextTickAsync(usbScanCts.Token));
    }
    catch (OperationCanceledException)
    {
        // Expected on shutdown.
    }
});

app.Lifetime.ApplicationStopping.Register(() =>
{
    // The open lap-history session is closed once this loop has finished its tick, after the
    // host has stopped (below): closing it here could race a tick filing a lap.
    telemetryPublishCts.Cancel();
    screenReconcileCts.Cancel();
    usbScanCts.Cancel();
    cloudSyncCts.Cancel();
    peerLinkCts.Cancel();
    discordSignIn.Cancel();
    screenOutputs.Dispose();
    hardwareInput.Dispose();
    browserDisplaysCts.Cancel();
});

app.Use(async (context, next) =>
{
    // The browser returning from Discord cannot carry the bearer token; the nonce guards this route instead.
    if (HttpMethods.IsGet(context.Request.Method) && context.Request.Path.Equals(DiscordCallbackPage.Path, StringComparison.Ordinal))
    {
        await next(context);
        return;
    }

    if (!string.Equals(context.Request.Headers.Authorization.ToString(), $"Bearer {bearer}", StringComparison.Ordinal))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }
    await next(context);
});

app.MapGet("/api/state", () =>
{
    long started = Stopwatch.GetTimestamp();
    AnalysisState analysis = analysisController.State();
    LapTraceUsage traceUsage = lapTraceStore.Usage();
    // From disk, not the planner's live objects: the telemetry loop mutates those under the
    // planner's lock, and serializing them here would race it.
    IReadOnlyList<SessionPlan> plans = planStore.LoadAll();
    // The active plan's target-lap curves, found here so the start/finish latch on the telemetry
    // loop never reads the corpus itself (PlanTargetDelivery.ResolveReferences). A failed resolve
    // leaves the curves the last one found, for the next poll to retry; it never fails this one.
    try
    {
        planTargets.ResolveReferences();
    }
    catch (Exception ex)
    {
        log.Debug($"Resolving the plan's target laps failed: {ex.Message}");
    }

    IResult result = Results.Json(new
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
        multiDials = MultiDials.Describe(runtime.Devices, runtime.Catalog, multiDials),
        // Catalog ids plugged in but not added yet, one per device (the Add device dialog).
        foundDevices = DeviceDetection.FindNew(runtime.Catalog, runtime.Devices, usbPresent),
        dashLayouts = runtime.DashLayouts,
        // Dash id -> screen profile id -> widgets that size would leave out (only sizes that lose any).
        dashRefitLosses = dashRefitLosses.For(runtime.DashLayouts),
        // Built-ins in their fixed order, then the user's own, so the Dashes page hardcodes neither.
        dashCategories = new
        {
            builtIn = DashCategories.BuiltIn,
            custom = runtime.Settings.CustomDashCategories,
        },
        setupTemplates = runtime.SetupTemplates,
        setupPrograms = runtime.SetupPrograms,
        setupParameters = DesktopRuntime.SetupParameters,
        engineerControls = runtime.EngineerControls,
        radioLog = runtime.RadioLog,
        engineerPushState = runtime.EngineerPushState,
        plans,
        // Each plan's race fuel (RaceFuelEstimate), by plan id: small, and cheap over the cached
        // corpus, so the Race card follows new laps and setting changes without its own fetch.
        planFuel = PlanFuel(plans),
        // Never the corpus itself: it runs to megabytes and this is polled several times a second.
        // Views get what they show; pages that need laps fetch them on their own endpoints.
        sessionCount = lapHistoryStore.LoadAll().Count,
        recentSessions = RecentSessions.From(lapHistoryStore.LoadAll()),
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
            sessions = analysis.Sessions,
            session = analysis.Session,
            laps = analysis.Laps,
            runs = analysis.Runs,
            courseLaps = analysis.CourseLaps,
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
        // The first-run setup: whether it is finished, and the game folder its Game step shows
        // (null where the game cannot run). The folder's file counts are cached, not counted per poll.
        firstRun = new
        {
            done = runtime.Settings.FirstRunDone,
            game = gameFolder.Summary(),
        },
        account = cloudAccount.State,
        cloud = new
        {
            setupDone = runtime.Settings.Cloud.SetupDone,
            server = runtime.Settings.Cloud.Server,
            storage = runtime.Settings.Cloud.Storage,
            officialServerUrl,
            progress = cloudSync.Progress,
            lastSync = cloudSync.Last,
            live = new
            {
                status = liveUplink.Status,
                detail = liveUplink.Detail,
            },
        },
        link = peerLink.State,
        pitWallLayout = pitWallLayouts.Layout,
        compare = CompareState(),
        features = new { sprintWeb },
        updates = new
        {
            version = BuildInfo.Version,
            channel = runtime.Settings.UpdateChannel,
            // The Electron main process updates the app (electron/updates.ts); it reads these two here.
            autoInstall = runtime.Settings.AutoInstallUpdates,
        },
        // What the stored laps' telemetry takes on disk, for Settings. Nothing caps it.
        storage = new
        {
            traceBytes = traceUsage.Bytes,
            traceLaps = traceUsage.Laps,
            traceExpiryDays = runtime.Settings.SessionPlanner.TraceExpiryDays,
        },
        screens = ScreenOutputs.Describe(runtime.Devices, runtime.DashLayouts, state.Telemetry.Status.IsLive, screenOutputs.HardwareFor, dashPageCycle)
    }, json);
    debugTimings.StateAssembled(Stopwatch.GetElapsedTime(started));
    return result;
});

#if DEBUG
// The dev debug window (app/desktop/src/debug): everything worth knowing while driving and
// testing, polled at the state's cadence only while that window is open. Debug builds only: an
// installed (Release) host has no such route, as the installed app has no such window.
app.MapGet("/api/debug", () =>
{
    LiveCompareState compare = liveCompare.State();
    List<SavedDevice> devices;
    lock (runtime.DevicesGate)
    {
        devices = [.. runtime.Devices];
    }

    DebugSprint sprint = new(
        DebugTargets.From(planTargets.Targets, planTargets.Reference?.LapTimeSeconds),
        DebugPlan.Active(planStore.LoadAll()),
        new DebugHud(compare.HudOpen, compare.Arranging, HudInterop.IsExclusiveFullscreenActive()),
        DebugLink.From(peerLink.State),
        DebugRecorder.From(lapHistoryRecorder.OpenSession),
        debugTimings.Snapshot);
    return Results.Json(DebugSnapshot.Build(state.Telemetry, DateTimeOffset.UtcNow, devices, screenOutputs.HardwareFor, sprint), json);
});
#endif

app.MapGet("/api/telemetry", () => Results.Json(state.Telemetry, json));

// The pit wall's lap traces (engineer side): the lap being driven, the last, the best, or the
// target the driver shares. Polled once a second while the Traces tile shows, so not in /api/state.
app.MapGet("/api/pitwall/trace", (string? lap) =>
    Enum.TryParse(lap, ignoreCase: true, out PitWallTraceLap which) && Enum.IsDefined(which)
        ? Results.Json(peerLink.Trace(which), json)
        : Results.BadRequest(new { error = "lap must be current, last, best or target" }));
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
// so it stays out of the frequently-polled /api/state and is fetched on demand instead. The
// driving at the lap's own resolution; the car's readings beside it as `car`, thinned, because
// whole they would be megabytes as JSON.
app.MapGet("/api/analysis/trace/{sessionId}/{lapNumber:int}", (string sessionId, int lapNumber) =>
{
    LapChannelTrace? trace = lapTraceStore.Load(LapTraceId.For(sessionId, lapNumber));
    if (trace is null)
    {
        return Results.NotFound();
    }

    LapChannelTrace driving = LapTraceCar.Without(trace);
    return Results.Json(
        new { driving.Version, driving.PositionStep, driving.TrackLengthMeters, driving.Channels, Car = LapTraceCar.Only(trace) },
        json);
});

// Focused endpoints for the Setups pages: the game's setup folder is read on request (only the
// files that changed since the last look), which is too slow and too large for /api/state.
app.MapGet("/api/setups", () => Results.Json(new
{
    available = setupLibrary.Available,
    folder = setupLibrary.Folder,
    setups = setupLibrary.List(),
}, json));
app.MapGet("/api/setups/sheet", (string id, string? version) =>
    setupLibrary.Sheet(id, version) is { } sheet ? Results.Json(sheet, json) : Results.NotFound());
// How each version of one setup drove, over the runs the driver put it on in Analysis.
app.MapGet("/api/setups/driven", (string id) =>
    setupLibrary.Sheet(id) is { } sheet
        ? Results.Json(SetupDriving.Summarize([.. sheet.Versions.Select(version => version.Id)], lapHistoryStore.LoadAll(), runSetups.All()), json)
        : Results.NotFound());

// The HUD's feed: Electron polls this while the HUD is open and hands each window its part.
// A focused endpoint rather than /api/state, because it is resampled per request and wanted
// several times faster than the state poll. 204 when there is no target to draw.
app.MapGet("/api/compare/frame", () =>
{
    if (liveCompare.Controller.Snapshot() is not { } frame)
    {
        return Results.NoContent();
    }

    return Results.Json(new
    {
        targetName = frame.TargetName,
        deltaSeconds = frame.DeltaSeconds,
        hasLiveLine = frame.HasLiveLine,
        carMeters = frame.CarMeters,
        domain = new { min = frame.Stack.Domain.Min, max = frame.Stack.Domain.Max },
        panels = frame.PanelIds.Zip(frame.Stack.Charts, (id, chart) => new { id, title = chart.Title, unit = chart.Unit, series = chart.Series }),
    }, json);
});

// Where each HUD window opens, given the displays Electron sees (primary first): the place the
// driver left it on one of them, else the first-run column. The placement rules are Core's.
app.MapPost("/api/compare/hud/windows", (HudWindowsRequest body) =>
{
    List<HudScreen> screens = [.. (body.Screens ?? [])
        .Where(screen => screen.Width > 0 && screen.Height > 0)
        .Select(screen => new HudScreen(screen.X, screen.Y, screen.Width, screen.Height))];
    lock (runtime.SettingsGate)
    {
        LiveCompareSettings settings = runtime.Settings.LiveCompare;
        IReadOnlyList<HudWindowSpec> specs = HudWindowPlan.Build(settings);
        IReadOnlyList<HudWindowLayout> layouts = HudLayoutStore.Arrange(settings, specs, screens);
        return Results.Json(specs.Zip(layouts, (spec, layout) => new
        {
            id = spec.Id,
            title = spec.Title,
            minWidth = spec.MinWidth,
            minHeight = spec.MinHeight,
            x = layout.X,
            y = layout.Y,
            width = layout.Width,
            height = layout.Height,
        }), json);
    }
});

// Focused endpoint: building the choices reads every lap-history file's context, which is far too
// much work for the 4 Hz state poll, so the New plan dialog fetches it once when it opens.
// Lap files (#198): a lap with channels as a .sprintlap, and back. Electron owns the file
// dialogs and the disk; these only turn a lap into bytes and bytes into a corpus entry.
const long maxLapFileBytes = 32 * 1024 * 1024;
SharedLapImporter sharedLapImporter = new(lapHistoryStore, lapTraceStore, log: log, carNames: storedCarNames);
app.MapGet("/api/laps/{sessionId}/{lapNumber:int}/file", (string sessionId, int lapNumber, HttpContext context) =>
{
    SharedLapExportResult export = SharedLapExport.Build(lapHistoryStore, lapTraceStore, sessionId, lapNumber, runtime.Settings.DriverName, DateTimeOffset.UtcNow, lapNotes.For(sessionId, lapNumber));
    if (export.Lap is not { } lap)
    {
        return Results.NotFound(new { error = export.Error });
    }

    using MemoryStream buffer = new();
    SharedLapFile.Write(buffer, lap);
    context.Response.Headers["x-lap-filename"] = Uri.EscapeDataString(SharedLapFile.SuggestedFileName(lap));
    context.Response.Headers["x-lap-has-positions"] = export.HasPositions ? "true" : "false";
    return Results.Bytes(buffer.ToArray(), "application/octet-stream");
});

// Reads a posted .sprintlap without filing it: the lap, or which of the failures it was.
async Task<SharedLapOffer> ReadLapFileAsync(HttpRequest request, CancellationToken ct)
{
    if (request.ContentLength is > maxLapFileBytes)
    {
        return new SharedLapOffer(null, "That file is far too large to be a Sprint lap file.");
    }

    using MemoryStream body = new();
    await request.Body.CopyToAsync(body, ct);
    body.Position = 0;
    SharedLapReadResult read = SharedLapFile.Read(body);
    return new SharedLapOffer(read.Lap, read.Message);
}

// What a lap file holds, read but not filed: the driver sees it and confirms before
// /api/laps/import adds it (#198: import never happens silently).
app.MapPost("/api/laps/import/preview", async (HttpRequest request, CancellationToken ct) =>
{
    SharedLapOffer offer = await ReadLapFileAsync(request, ct);
    if (offer.Lap is not { } lap)
    {
        return Results.Json(new { outcome = "Failed", error = offer.Message }, json);
    }

    return Results.Json(new
    {
        outcome = "Ready",
        sharedBy = lap.Attribution,
        track = lap.Context.TrackCourse,
        car = lap.Context.CarModel,
        lapTimeSeconds = lap.LapTimeSeconds,
        drivenAt = lap.Provenance.DrivenAt,
        alreadyPresent = sharedLapImporter.IsPresent(lap),
    }, json);
});

app.MapPost("/api/laps/import", async (HttpRequest request, CancellationToken ct) =>
{
    SharedLapOffer offer = await ReadLapFileAsync(request, ct);
    if (offer.Lap is not { } lap)
    {
        return Results.Json(new { outcome = "Failed", error = offer.Message }, json);
    }

    SharedLapImportResult imported = sharedLapImporter.Import(lap);
    if (imported.Added)
    {
        // The corpus grew behind Analysis' session filter, which is only rebuilt on a load.
        analysisController.Load();
    }

    return Results.Json(new
    {
        outcome = imported.Added ? "Imported" : "AlreadyPresent",
        sharedBy = lap.Attribution,
        track = lap.Context.TrackCourse,
        car = lap.Context.CarModel,
        lapTimeSeconds = lap.LapTimeSeconds,
        hasPositions = lap.Trace.TryGetChannel(LapTraceChannels.WorldX, out float[] _),
    }, json);
});

app.MapGet("/api/planner/context", async (CancellationToken ct) =>
{
    PlanContextChoices choices = await Task.Run(
        () => PlanContextChoices.From(planContext.Prefill(), planContext.ContextOptions(), planContext.Detect(state.Telemetry.Frame.Session)),
        ct);
    return Results.Json(choices, json);
});

// The plan dialogs' fuel calculator, asked as their fields change: the lap history for a car and
// track (the dialogs pre-fill from it) and the race worked out from what is typed. Refused inputs
// answer 200 with the reason, like plan.create's, so the dialog can say it beside its fields, and
// still with the history: it depends only on the car and track, and a dialog whose answer lacked it
// would keep showing another car's laps.
app.MapPost("/api/planner/fuel-estimate", async (PlanFuelEstimateRequest body, CancellationToken ct) =>
{
    if (!body.TryGetInputs(runtime.Settings.SessionPlanner.FuelReserveLaps, out PlanFuelInputs inputs, out string error))
    {
        FuelHistoryFigures history = await Task.Run(() => fuelHistory.ForRace(body.ToContext()), ct);
        return Results.Json(new { outcome = "Invalid", error, history }, json);
    }

    TelemetryFrame frame = state.Telemetry.Frame;
    PlanFuelPreview preview = await Task.Run(() => planContext.PreviewFuel(inputs, frame.Session, frame.Car.FuelCapacityLiters), ct);
    return Results.Json(new { outcome = "Ready", preview.History, preview.Estimate }, json);
});

// What a plan's targets can be: per scope (this qualifying, qualifying, practice, programs) the
// fastest/median/slowest lap and every lap, for this plan's car and track. plan.setTarget picks one.
app.MapGet("/api/planner/targets", async (string planId, CancellationToken ct) =>
{
    if (plannerService.Find(planId) is not { } plan)
    {
        return Results.NotFound(new { error = "plan not found" });
    }

    PlanTargetChoices choices = await Task.Run(() => PlanTargetResolver.ForPlan(lapHistoryStore, plan), ct);
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

app.MapPost("/api/account/sign-in", async (AccountSignInRequest body, CancellationToken ct) =>
{
    if (!body.IsComplete)
    {
        return Results.BadRequest(new { error = "serverUrl, email and password are required" });
    }

    CloudSignInResult result = await cloudAccount.SignInAsync(body.ServerUrl ?? "", body.Email ?? "", body.Password ?? "", body.CreateAccount, ct);
    return Results.Json(result, json);
});

// What the sign-in step needs to know about a server before showing it: whether Discord sign-in is on.
app.MapPost("/api/cloud/server-info", async (ServerAddressRequest body, CancellationToken ct) =>
{
    ServerSettingsDto? settings = await cloudAccount.ServerSettingsAsync(body.ServerUrl ?? "", ct);
    return settings is null
        ? Results.Json(new { reachable = false }, json)
        : Results.Json(new { reachable = true, settings.InstanceName, settings.AllowRegistration, settings.DiscordSignIn }, json);
});

// Discord sign-in, in three calls from Electron: start (the URL it opens in the system browser),
// wait (until the browser leg comes back to the callback below, is cancelled or times out), cancel.
app.MapPost("/api/account/discord/start", (ServerAddressRequest body, HttpContext context) =>
{
    Uri callback = new($"http://127.0.0.1:{context.Connection.LocalPort}{DiscordCallbackPage.Path}");
    DiscordSignInStart start = discordSignIn.Begin(body.ServerUrl ?? "", callback);
    return start.AuthorizeUrl is { } url
        ? Results.Json(new { authorizeUrl = url.ToString() }, json)
        : Results.Json(new DiscordSignInResult(DiscordSignInOutcome.Failed, start.Error), json);
});

app.MapPost("/api/account/discord/wait", async (CancellationToken ct) =>
    Results.Json(await discordSignIn.WaitAsync(TimeSpan.FromMinutes(5), ct), json));

app.MapPost("/api/account/discord/cancel", () =>
{
    discordSignIn.Cancel();
    return Results.NoContent();
});

app.MapGet(DiscordCallbackPage.Path, (HttpRequest request) =>
{
    string? error = request.Query["error"];
    bool taken = discordSignIn.Complete(request.Query["state"], request.Query["ticket"], error);
    return Results.Content(DiscordCallbackPage.Render(taken, error), "text/html; charset=utf-8", statusCode: taken ? 200 : 400);
});

// Looks for Sprint servers on the local network: this machine, then its /24. A few seconds.
app.MapPost("/api/cloud/discover", async (CancellationToken ct) =>
{
    IReadOnlyList<Uri> candidates = ServerDiscovery.Candidates(ServerDiscovery.LocalInterfaces(), ServerDiscovery.DefaultPort);
    IReadOnlyList<DiscoveredServer> servers = await serverDiscovery.ScanAsync(candidates, ct);
    return Results.Json(new { servers }, json);
});

app.MapPost("/api/cloud/push", async (CancellationToken ct) =>
{
    SyncReport report = await cloudSync.PushAsync(ct);
    // "Web only" may have removed sessions behind Analysis' session list.
    if (report.RemovedLocally > 0) analysisController.Load();
    return Results.Json(report, json);
});

app.MapPost("/api/cloud/pull", async (CancellationToken ct) =>
{
    SyncReport report = await cloudSync.PullAsync(ct);
    if (report.Downloaded > 0) analysisController.Load();
    return Results.Json(report, json);
});

app.MapPost("/api/account/sign-out", () =>
{
    cloudAccount.SignOut();
    return Results.NoContent();
});

app.MapGet("/api/diagnostics/logs", (HttpRequest request) =>
{
    string? levelText = request.Query["minLevel"];
    string? text = request.Query["text"];
    DiagnosticsLogLevel minLevel = Enum.TryParse(levelText, ignoreCase: true, out DiagnosticsLogLevel parsed) ? parsed : DiagnosticsLogLevel.Debug;
    return Results.Json(liveLog.Filter(minLevel, text), json);
});

app.Lifetime.ApplicationStarted.Register(() =>
{
    string? address = app.Urls.FirstOrDefault();
    int port = address is null ? 0 : new Uri(address).Port;
    Console.WriteLine(JsonSerializer.Serialize(new { type = "ready", port }, json));
});

// The remembered game/car/track (TelemetryIngestionPipeline keeps it current from every frame),
// as the planner controller's prefill and its "live" context option.
// Training against an older lap, for the On track page. `fullscreen` warns that a game in
// exclusive fullscreen hides every HUD window -- said, rather than left as an empty screen.
object CompareState()
{
    LiveCompareState compare = liveCompare.State();
    return new
    {
        courses = compare.Courses,
        course = compare.Course,
        laps = compare.Laps,
        lapCount = compare.LapCount,
        target = compare.Target,
        hudOpen = compare.HudOpen,
        arranging = compare.Arranging,
        // The HUD's rolling window as it is drawn now (compare.range).
        metersBehind = liveCompare.Controller.MetersBehind,
        metersAhead = liveCompare.Controller.MetersAhead,
        fullscreen = (compare.HudOpen || compare.Arranging) && HudInterop.IsExclusiveFullscreenActive(),
    };
}

// Every plan's race fuel over the one shared corpus, keyed by plan id, with the tank of the car
// being driven for the active plan when its history has none (RaceFuelEstimate.ForPlans).
Dictionary<string, RaceFuelEstimate> PlanFuel(IReadOnlyList<SessionPlan> plans) =>
    RaceFuelEstimate.ForPlans(plans, fuelHistory, state.Telemetry.Frame.Car.FuelCapacityLiters);

PlanContext LastSeenContext()
{
    LastSeenContext seen = runtime.Settings.LastSeenContext;
    return new PlanContext(seen.Game, seen.Car, seen.Track);
}

// The game's live source. Debug builds also honour two dev switches: SPRINT_TELEMETRY_REPLAY
// plays a recording instead of the game (make replay-app), SPRINT_TELEMETRY_RECORD records
// every frame of the game into a folder (make record-app). Release builds ignore both.
static ITelemetrySource CreateTelemetrySource(ILog log)
{
#if DEBUG
    string? replayFile = Environment.GetEnvironmentVariable("SPRINT_TELEMETRY_REPLAY");
    if (!string.IsNullOrWhiteSpace(replayFile))
    {
        log.Info($"Telemetry: replaying {replayFile} instead of the game.");
        return new ReplayTelemetrySource(replayFile);
    }

    string? recordFolder = Environment.GetEnvironmentVariable("SPRINT_TELEMETRY_RECORD");
    if (!string.IsNullOrWhiteSpace(recordFolder))
    {
        log.Info($"Telemetry: recording every frame into {recordFolder}.");
        return new RecordingTelemetrySource(
            GameProviders.Default.CreateTelemetrySource(),
            recordFolder,
            ex => log.Error("Telemetry recording stopped: the file could not be written.", ex));
    }
#endif

    return GameProviders.Default.CreateTelemetrySource();
}

try
{
    await app.RunAsync();

    // Stamp the open lap-history session as finished so it is not left looking live (mirrors the
    // deleted Avalonia client's OnClosed). Only once the publish loop ApplicationStopping cancelled
    // has finished its tick: the recorder belongs to that loop, and a tick may be filing a lap.
    // Then wait for the finished session's save, queued behind that lap's writes, and only then
    // tear down the engine that fed it. Bounded: the desktop app kills the host 3 s after asking.
    if (await Task.WhenAny(telemetryPublishLoop, Task.Delay(TimeSpan.FromSeconds(1))) == telemetryPublishLoop)
    {
        ingestion.Close();
        if (!await lapHistoryRecorder.FlushAsync(TimeSpan.FromSeconds(1.5)))
        {
            AppDiagnostics.Log.Warn("Lap history was still saving at exit");
        }
    }
    else
    {
        AppDiagnostics.Log.Warn("The telemetry loop did not stop before exit; the open lap-history session was left open");
    }

    telemetryEngine.Dispose();

    // ApplicationStopping cancelled the uplink; give it the moment it needs to send the live
    // session's `end` (EndTimeout) and close the socket, so engineers see "ended" rather than a drop.
    try
    {
        await liveUplinkLoop.WaitAsync(TimeSpan.FromSeconds(5));
    }
    catch (TimeoutException)
    {
        AppDiagnostics.Log.Warn("Live telemetry did not close before exit");
    }

    // Likewise the live link's bye, so the engineer sees "ended" rather than a dropped connection.
    try
    {
        await peerLinkLoop.WaitAsync(TimeSpan.FromSeconds(2));
    }
    catch (TimeoutException)
    {
        AppDiagnostics.Log.Warn("Live link did not close before exit");
    }

    // The browser displays' port closes with the host.
    try
    {
        await browserDisplaysLoop.WaitAsync(TimeSpan.FromSeconds(5));
    }
    catch (TimeoutException)
    {
        AppDiagnostics.Log.Warn("Browser displays did not close before exit");
    }

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
