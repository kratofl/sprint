using System.Text.Json;
using Sprint.Desktop;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Engineer;
using Sprint.Desktop.Features.FirstRun;
using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.Peer;
using Sprint.Desktop.Features.PitWall;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Runtime;
using Sprint.Games.LeMansUltimate;

namespace Sprint.Desktop.Core;

/// <summary>
/// Translates untrusted JSON commands from the loopback HTTP boundary into calls
/// against <see cref="IDesktopRuntime"/>. Every case validates its own arguments
/// and returns a clear error string on bad input instead of throwing or letting a
/// runtime exception (e.g. <see cref="DesktopRuntime.SaveDashLayout"/>'s invalid-
/// layout guard) escape to the HTTP layer. Settings and controls are mutable
/// objects reached through the runtime, so their commands apply a validated patch
/// and then call the corresponding Save method rather than accepting a blind
/// whole-object overwrite of client JSON.
/// </summary>
public sealed class RuntimeCoordinator
{
    private static readonly JsonSerializerOptions DashLayoutJsonOptions = new() { PropertyNameCaseInsensitive = true };

    private readonly IDesktopRuntime _runtime;
    private readonly SessionPlannerService _planner;
    private readonly AnalysisController _analysis;
    private readonly LiveLogStore _diagnosticsLog;
    private readonly DashPageCycle _pageCycle;
    private readonly PeerLink? _link;
    private readonly LiveCompareService _liveCompare;
    private readonly GameFolder _gameFolder;
    private readonly ILapHistoryStore _lapHistory;
    private readonly PitWallLayoutStore _pitWall;
    private readonly LapTraceRetention? _traceRetention;

    /// <summary>
    /// <paramref name="planner"/>/<paramref name="analysis"/>/<paramref name="diagnosticsLog"/> default
    /// to a runtime-rooted store each when omitted, so existing callers that only care about the
    /// runtime-backed commands (most tests) do not have to wire up the session-planning, analysis,
    /// and diagnostics stacks just to construct a coordinator. The host wires the real, shared
    /// instances explicitly so command writes and <c>/api/state</c> reads agree -- <paramref
    /// name="pageCycle"/> in particular has to be the very instance <c>ScreenOutputs.Describe</c>
    /// reads, or a <c>dash.page.next</c> command would never be visible in <c>screens[]</c>.
    /// Without <paramref name="link"/> the <c>link.*</c> commands are refused. <paramref
    /// name="liveCompare"/> must be the instance the host's telemetry loop feeds and its HUD reads.
    /// <paramref name="gameFolder"/> must wrap the provider the host reads setups and results
    /// through; without it <c>game.setFolder</c> points a private provider nobody reads.
    /// <paramref name="lapHistory"/> is the corpus <c>plan.setTarget</c> resolves a pick against;
    /// the host passes its one shared store. <paramref name="pitWall"/> must be the store
    /// <c>/api/state</c> reads <c>pitWallLayout</c> from. With <paramref name="traceRetention"/>,
    /// opting into a trace age limit deletes what is already past it at once rather than at the
    /// next start.
    /// </summary>
    public RuntimeCoordinator(
        IDesktopRuntime runtime,
        SessionPlannerService? planner = null,
        AnalysisController? analysis = null,
        LiveLogStore? diagnosticsLog = null,
        DashPageCycle? pageCycle = null,
        PeerLink? link = null,
        LiveCompareService? liveCompare = null,
        GameFolder? gameFolder = null,
        ILapHistoryStore? lapHistory = null,
        PitWallLayoutStore? pitWall = null,
        LapTraceRetention? traceRetention = null)
    {
        this._runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        this._planner = planner ?? new SessionPlannerService(new LocalSessionPlanStore(Path.Combine(runtime.DataRoot, "session-plans")));
        this._analysis = analysis ?? new AnalysisController(new LapCorpusBrowser(
            new LocalLapHistoryStore(Path.Combine(runtime.DataRoot, "lap-history")),
            new LocalLapTraceStore(Path.Combine(runtime.DataRoot, "lap-traces")),
            new LapNotes(Path.Combine(runtime.DataRoot, "lap-notes.json"))));
        this._diagnosticsLog = diagnosticsLog ?? new LiveLogStore();
        this._pageCycle = pageCycle ?? new DashPageCycle();
        this._link = link;
        this._liveCompare = liveCompare ?? new LiveCompareService(
            new LapCorpusBrowser(
                new LocalLapHistoryStore(Path.Combine(runtime.DataRoot, "lap-history")),
                new LocalLapTraceStore(Path.Combine(runtime.DataRoot, "lap-traces"))),
            () => null);
        this._gameFolder = gameFolder ?? new GameFolder(new LeMansUltimateGameProvider());
        this._lapHistory = lapHistory ?? new LocalLapHistoryStore(Path.Combine(runtime.DataRoot, "lap-history"));
        this._pitWall = pitWall ?? new PitWallLayoutStore(runtime.DataRoot);
        this._traceRetention = traceRetention;
    }

    public bool Execute(JsonElement command, out string error)
    {
        error = "";
        if (!command.TryGetProperty("type", out JsonElement typeElement) || typeElement.ValueKind != JsonValueKind.String) { error = "command type is required"; return false; }
        string type = typeElement.GetString() ?? "";
        switch (type)
        {
            case "settings.save": this._runtime.SaveSettings(); return true;
            case "settings.reset": this._runtime.ResetSettingsToDefaults(); return true;
            case "settings.update": return this.UpdateSettings(command, out error);
            case "cloud.configure": return this.ConfigureCloud(command, out error);
            case "firstRun.complete": return this.CompleteFirstRun(command, out error);
            case "game.setFolder": return this.SetGameFolder(command, out error);
            case "controls.save": this._runtime.SaveControls(); return true;
            case "controls.update": return this.UpdateControls(command, out error);
            case "engineer.revert": this._runtime.RevertEngineerChanges(); return true;
            case "engineer.push": this._runtime.PushEngineerChanges(); return true;
            case "engineer.acknowledge": return this.AcknowledgeEngineer(command, out error);
            case "engineer.stage": return this.StageEngineerControl(command, out error);
            case "engineer.message": if (!TryString(command, "message", out string message)) { error = "message is required"; return false; } this._runtime.SendQuickMessage(message); return true;
            case "devices.remove": return this.RemoveDevice(command, out error);
            case "devices.add": return this.AddDevice(command, out error);
            case "devices.addCustom": return this.AddCustomDevice(command, out error);
            case "devices.update": return this.UpdateDevice(command, out error);
            case "devices.purpose": return this.UpdateDevicePurpose(command, out error);
            case "devices.captureRegion": return this.UpdateDeviceCaptureRegion(command, out error);
            case "devices.refreshHz": return this.UpdateDeviceRefreshHz(command, out error);
            case "devices.save": return this.SaveDevice(command, out error);
            case "dash.create": return this.CreateDash(command, out error);
            case "dash.save": return this.SaveDash(command, out error);
            case "dash.reset": return this.ResetDash(command, out error);
            case "dash.delete": return this.DeleteDash(command, out error);
            case "dash.setCategory": return this.SetDashCategory(command, out error);
            case "dash.category.create": return this.CreateDashCategory(command, out error);
            case "dash.category.rename": return this.RenameDashCategory(command, out error);
            case "dash.category.delete": return this.DeleteDashCategory(command, out error);
            case "dash.setScreenProfile": return this.SetDashScreenProfile(command, out error);
            case SprintCommands.DashPageNext: return this.CycleDashPage(command, offset: 1, out error);
            case SprintCommands.DashPagePrev: return this.CycleDashPage(command, offset: -1, out error);
            case "setup.duplicate": return this.DuplicateSetup(command, out error);
            case "setup.save": return this.SaveSetup(command, out error);
            case "setup.delete": return this.DeleteSetup(command, out error);
            case "plan.create": return this.CreatePlan(command, out error);
            case "plan.update": return this.UpdatePlan(command, out error);
            case "plan.delete": return this.DeletePlan(command, out error);
            case "plan.arm": return this.ArmPlan(command, out error);
            case "plan.disarm": return this.DisarmPlan(command, out error);
            case "plan.start": return this.StartPlanSegment(command, out error);
            case "plan.stop": return this.StopPlanSegment(command, out error);
            case "plan.releaseActive": return this.ReleaseActivePlan(out error);
            case "plan.setTarget": return this.SetPlanTarget(command, out error);
            case "plan.clearTarget": return this.ClearPlanTarget(command, out error);
            case "analysis.refresh": this._analysis.Load(); return true;
            case "analysis.selectSession": return this.SelectAnalysisSession(command, out error);
            case "analysis.filter": return this.FilterAnalysis(command, out error);
            case "analysis.selectLap": return this.SelectAnalysisLap(command, out error);
            case "analysis.setRunSetup": return this.SetAnalysisRunSetup(command, out error);
            case "lap.note.add": return this.AddLapNote(command, out error);
            case "lap.note.update": return this.UpdateLapNote(command, out error);
            case "lap.note.delete": return this.DeleteLapNote(command, out error);
            case "compare.course": return this.SelectCompareCourse(command, out error);
            case "compare.target.set": return this.SetCompareTarget(command, out error);
            case "compare.target.clear": this._liveCompare.ClearTarget(); return true;
            case SprintCommands.CompareHudToggle: return this._liveCompare.SetHudOpen(!this._liveCompare.HudOpen, out error);
            case "compare.hud.arrange": return this.ArrangeCompareHud(command, out error);
            case "compare.readings": return this.SetCompareReadings(command, out error);
            case "compare.hud.layout": return this.SaveCompareHudLayout(command, out error);
            case "diagnostics.setLogLevel": return this.SetLogLevel(command, out error);
            case "link.invite": return this.LinkInvite(out error);
            case "link.join": return this.LinkJoin(command, out error);
            case "link.complete": return this.LinkComplete(command, out error);
            case "link.close": return this.LinkClose(out error);
            case "link.sharePlan": return this.LinkSharePlan(command, out error);
            case "pitwall.saveLayout": return this.SavePitWallLayout(command, out error);
            case "pitwall.placeWindow": return this.PlacePitWallWindow(command, out error);
            case "pitwall.resetLayout": this._pitWall.Reset(); return true;
            default: error = $"unknown command type: {type}"; return false;
        }
    }

    // ── Live Compare: training against an older lap ───────────────────────────

    /// <summary>Lists another course's laps on the On track page; no game/track/car follows the car again.</summary>
    private bool SelectCompareCourse(JsonElement command, out string error)
    {
        error = "";
        bool hasGame = TryString(command, "game", out string game);
        bool hasTrack = TryString(command, "track", out string track);
        bool hasCar = TryString(command, "car", out string car);
        if (!hasGame && !hasTrack && !hasCar)
        {
            this._liveCompare.SelectCourse(null);
            return true;
        }

        if (!hasGame || !hasTrack || !hasCar) { error = "game, track and car are required together"; return false; }
        this._liveCompare.SelectCourse(new LiveCompareCourse(game, track, car));
        return true;
    }

    private bool SetCompareTarget(JsonElement command, out string error)
    {
        if (!TryString(command, "sessionId", out string sessionId)) { error = "sessionId is required"; return false; }
        if (!TryInt(command, "lapNumber", out int lapNumber)) { error = "lapNumber is required"; return false; }
        return this._liveCompare.SetTarget(sessionId, lapNumber, out error);
    }

    /// <summary>Opens the HUD windows unlocked to move, size, add or remove them on the monitor; false locks them again.</summary>
    private bool ArrangeCompareHud(JsonElement command, out string error)
    {
        error = "";
        if (!TryBool(command, "arranging", out bool arranging)) { error = "arranging is required"; return false; }
        this._liveCompare.SetArranging(arranging);
        return true;
    }

    /// <summary>Which readings get a HUD window: chart panel ids from the catalogue, plus the delta.</summary>
    private bool SetCompareReadings(JsonElement command, out string error)
    {
        error = "";
        if (!TryBool(command, "showDelta", out bool showDelta)) { error = "showDelta is required"; return false; }
        if (!command.TryGetProperty("panelIds", out JsonElement idsElement) || idsElement.ValueKind != JsonValueKind.Array)
        {
            error = "panelIds is required";
            return false;
        }

        List<string> panelIds = [];
        foreach (JsonElement item in idsElement.EnumerateArray())
        {
            string id = item.ValueKind == JsonValueKind.String ? item.GetString() ?? "" : "";
            if (LapChartPanels.ById(id) is null) { error = $"unknown reading: {id}"; return false; }
            if (!panelIds.Contains(id, StringComparer.Ordinal)) panelIds.Add(id);
        }

        if (panelIds.Count == 0 && !showDelta) { error = "Keep at least one reading on the HUD."; return false; }

        lock (this._runtime.SettingsGate)
        {
            LiveCompareSettings settings = this._runtime.Settings.LiveCompare;
            settings.PanelIds = panelIds;
            settings.ShowDelta = showDelta;
            this._runtime.SaveSettings();
            this._liveCompare.Configure(settings);
        }

        return true;
    }

    /// <summary>Remembers where the driver left one HUD window, keyed by the monitor it is on.</summary>
    private bool SaveCompareHudLayout(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "windowId", out string windowId)) { error = "windowId is required"; return false; }
        if (windowId != HudWindowPlan.DeltaWindowId && LapChartPanels.ById(windowId) is null) { error = $"unknown HUD window: {windowId}"; return false; }
        if (!command.TryGetProperty("screen", out JsonElement screenElement) || screenElement.ValueKind != JsonValueKind.Object ||
            !TryInt(screenElement, "x", out int screenX) || !TryInt(screenElement, "y", out int screenY) ||
            !TryInt(screenElement, "width", out int screenWidth) || !TryInt(screenElement, "height", out int screenHeight) ||
            screenWidth <= 0 || screenHeight <= 0)
        {
            error = "screen must carry x, y and a positive width and height";
            return false;
        }

        if (!TryInt(command, "x", out int x) || !TryInt(command, "y", out int y) ||
            !TryInt(command, "width", out int width) || !TryInt(command, "height", out int height) ||
            width <= 0 || height <= 0)
        {
            error = "x, y and a positive width and height are required";
            return false;
        }

        lock (this._runtime.SettingsGate)
        {
            HudLayoutStore.Save(this._runtime.Settings.LiveCompare, windowId, new HudScreen(screenX, screenY, screenWidth, screenHeight), x, y, width, height);
            this._runtime.SaveSettings();
        }

        return true;
    }

    // ── Live link (driver to engineer, no server) ─────────────────────────────

    private bool LinkInvite(out string error)
    {
        if (this._link is not { } link) { error = LinkUnavailable; return false; }
        link.Invite();
        error = "";
        return true;
    }

    /// <summary>The engineer pastes the driver's invite. The code is checked here, so a bad paste fails the command.</summary>
    private bool LinkJoin(JsonElement command, out string error)
    {
        if (this._link is not { } link) { error = LinkUnavailable; return false; }
        if (!TryString(command, "code", out string code)) { error = "code is required"; return false; }
        return link.TryJoin(code, out error);
    }

    /// <summary>The driver pastes the engineer's reply to the invite that is open.</summary>
    private bool LinkComplete(JsonElement command, out string error)
    {
        if (this._link is not { } link) { error = LinkUnavailable; return false; }
        if (!TryString(command, "code", out string code)) { error = "code is required"; return false; }
        return link.TryComplete(code, out error);
    }

    private bool LinkClose(out string error)
    {
        if (this._link is not { } link) { error = LinkUnavailable; return false; }
        link.Close();
        error = "";
        return true;
    }

    /// <summary>Whether the driver shares the session plan and its target lap. Remembered, and applied to the link at once.</summary>
    private bool LinkSharePlan(JsonElement command, out string error)
    {
        error = "";
        if (!TryBool(command, "share", out bool share)) { error = "share is required"; return false; }
        lock (this._runtime.SettingsGate)
        {
            this._runtime.Settings.LiveLink.SharePlan = share;
            this._runtime.SaveSettings();
        }

        this._link?.SetSharePlan(share);
        return true;
    }

    private const string LinkUnavailable = "the live link is not available";

    // ── Pit wall layout (engineer side, per PC) ───────────────────────────────

    /// <summary>Replaces the whole layout; the store validates it (pages, ids, kinds, the grid, overlaps, stack timing).</summary>
    private bool SavePitWallLayout(JsonElement command, out string error)
    {
        if (!command.TryGetProperty("layout", out JsonElement layout)) { error = "layout is required"; return false; }
        return this._pitWall.TrySave(layout, out error);
    }

    /// <summary>Remembers where Electron left a pit wall window: <c>main</c>, or a <c>page</c> or <c>tile</c> by id.</summary>
    private bool PlacePitWallWindow(JsonElement command, out string error)
    {
        TryString(command, "kind", out string kindText);
        PitWallWindow? window = kindText switch
        {
            "main" => PitWallWindow.Main,
            "page" => PitWallWindow.Page,
            "tile" => PitWallWindow.Tile,
            _ => null,
        };
        if (window is not { } kind) { error = "kind must be main, page or tile"; return false; }

        string? id = null;
        if (kind != PitWallWindow.Main)
        {
            if (!TryString(command, "id", out string named)) { error = "id is required for a page or tile window"; return false; }
            id = named;
        }

        if (!command.TryGetProperty("bounds", out JsonElement boundsJson)
            || !PitWallLayouts.TryBounds(boundsJson, out PitWallBounds? bounds, out error)
            || bounds is null)
        {
            error = "bounds must carry x, y and a positive width and height";
            return false;
        }

        return this._pitWall.TryPlace(kind, id, bounds, out error);
    }

    // ── Settings / controls (validated patch, never a whole-object overwrite) ──

    private bool UpdateSettings(JsonElement command, out string error)
    {
        error = "";
        bool applied = false;
        LapTraceBudget? prune = null;

        // Mutation and save happen under the same lock the background telemetry-ingest loop's
        // last-seen-context capture also takes (DesktopRuntime.SettingsGate), so a Kestrel
        // request thread here can never race that loop's own Settings mutate-then-save.
        lock (this._runtime.SettingsGate)
        {
            if (TryBool(command, "sidebarCollapsed", out bool sidebarCollapsed))
            {
                this._runtime.Settings.SidebarCollapsed = sidebarCollapsed;
                applied = true;
            }

            if (TryStringField(command, "updateChannel", out string updateChannel))
            {
                this._runtime.Settings.UpdateChannel = AppSettings.NormalizeChannel(updateChannel);
                applied = true;
            }

            if (TryStringField(command, "driverName", out string driverName) && !string.IsNullOrWhiteSpace(driverName))
            {
                this._runtime.Settings.DriverName = driverName.Trim();
                applied = true;
            }

            if (TryStringField(command, "driverNumber", out string driverNumber) && !string.IsNullOrWhiteSpace(driverNumber))
            {
                this._runtime.Settings.DriverNumber = driverNumber.Trim();
                applied = true;
            }

            if (TryStringField(command, "devicesUiViewMode", out string devicesUiViewMode) && !string.IsNullOrWhiteSpace(devicesUiViewMode))
            {
                if (!OverviewViewModes.Contains(devicesUiViewMode.Trim(), StringComparer.OrdinalIgnoreCase))
                {
                    error = $"unknown devices UI view mode: {devicesUiViewMode}";
                    return false;
                }

                this._runtime.Settings.DevicesUI.ViewMode = devicesUiViewMode.Trim();
                applied = true;
            }

            if (TryStringField(command, "dashesUiViewMode", out string dashesUiViewMode) && !string.IsNullOrWhiteSpace(dashesUiViewMode))
            {
                if (!OverviewViewModes.Contains(dashesUiViewMode.Trim(), StringComparer.OrdinalIgnoreCase))
                {
                    error = $"unknown dashes UI view mode: {dashesUiViewMode}";
                    return false;
                }

                this._runtime.Settings.DashesUI.ViewMode = dashesUiViewMode.Trim();
                applied = true;
            }

            if (command.TryGetProperty("traceExpiryDays", out _))
            {
                if (!TryInt(command, "traceExpiryDays", out int traceExpiryDays) ||
                    traceExpiryDays < 0 || traceExpiryDays > SessionPlannerSettings.MaxTraceExpiryDays)
                {
                    error = $"traceExpiryDays must be 0 (keep) to {SessionPlannerSettings.MaxTraceExpiryDays}";
                    return false;
                }

                this._runtime.Settings.SessionPlanner.TraceExpiryDays = traceExpiryDays;
                prune = this._runtime.Settings.SessionPlanner.TraceBudget();
                applied = true;
            }

            if (!applied) { error = "no recognized settings fields were provided"; return false; }

            this._runtime.SaveSettings();
        }

        // Outside the settings lock: it reads every stored session. The driver was told the old
        // laps go now, so they go now and Settings shows the smaller total on its next poll.
        if (prune is { MaxAgeDays: not null } budget)
        {
            this._traceRetention?.Prune(budget, DateTimeOffset.UtcNow);
        }

        return true;
    }

    /// <summary>
    /// Records the driver's answer to "use a Sprint server?" and where data lives. Either field may
    /// be sent alone; any accepted call marks the first-run setup as done.
    /// </summary>
    private bool ConfigureCloud(JsonElement command, out string error)
    {
        error = "";
        CloudServerChoice? server = null;
        CloudStorageMode? storage = null;
        if (TryStringField(command, "server", out string serverText))
        {
            if (!Enum.TryParse(serverText, ignoreCase: false, out CloudServerChoice parsed) || !Enum.IsDefined(parsed))
            {
                error = $"unknown server choice: {serverText}";
                return false;
            }
            server = parsed;
        }

        if (TryStringField(command, "storage", out string storageText))
        {
            if (!Enum.TryParse(storageText, ignoreCase: false, out CloudStorageMode parsed) || !Enum.IsDefined(parsed))
            {
                error = $"unknown storage mode: {storageText}";
                return false;
            }
            storage = parsed;
        }

        lock (this._runtime.SettingsGate)
        {
            CloudSettings cloud = this._runtime.Settings.Cloud;
            if (server is { } chosenServer) cloud.Server = chosenServer;
            if (storage is { } chosenStorage) cloud.Storage = chosenStorage;
            cloud.SetupDone = true;
            this._runtime.SaveSettings();
        }

        return true;
    }

    /// <summary>
    /// Finishes the first-run setup: the driver's name (required, and not the placeholder) and
    /// race number (optional; when given, 1 to 3 digits). A blank number keeps the current one.
    /// </summary>
    private bool CompleteFirstRun(JsonElement command, out string error)
    {
        error = "";
        string name = TryStringField(command, "driverName", out string nameText) ? nameText.Trim() : "";
        if (name.Length == 0 || name.Equals(AppSettings.DefaultDriverName, StringComparison.OrdinalIgnoreCase))
        {
            error = "Enter your driver name.";
            return false;
        }

        string number = TryStringField(command, "driverNumber", out string numberText) ? numberText.Trim() : "";
        if (number.Length > 3 || !number.All(char.IsAsciiDigit))
        {
            error = "Your race number is 1 to 3 digits.";
            return false;
        }

        lock (this._runtime.SettingsGate)
        {
            this._runtime.Settings.DriverName = name;
            if (number.Length > 0)
            {
                this._runtime.Settings.DriverNumber = number;
            }

            this._runtime.Settings.FirstRunDone = true;
            this._runtime.SaveSettings();
        }

        return true;
    }

    /// <summary>
    /// Where Le Mans Ultimate is installed: a full path to an install (<see cref="LmuInstall.IsInstall"/>),
    /// or null to find it in the Steam libraries again. Setups and results follow at once.
    /// </summary>
    private bool SetGameFolder(JsonElement command, out string error)
    {
        error = "";
        if (!TryOptionalNullableString(command, "folder", out bool present, out string? folderText) || !present)
        {
            error = "folder is required (a path, or null to find the game automatically)";
            return false;
        }

        string? folder = null;
        if (folderText is not null)
        {
            string trimmed = folderText.Trim();
            if (!Path.IsPathFullyQualified(trimmed) || !LmuInstall.IsInstall(trimmed))
            {
                error = "That folder isn't a Le Mans Ultimate install.";
                return false;
            }

            folder = Path.TrimEndingDirectorySeparator(Path.GetFullPath(trimmed));
        }

        lock (this._runtime.SettingsGate)
        {
            this._runtime.Settings.GameFolder = folder;
            this._runtime.SaveSettings();
            this._gameFolder.Apply(folder);
        }

        return true;
    }

    /// <summary>The Devices and Dashes overviews' two list modes (<see cref="DevicesUiSettings.ViewMode"/>, <see cref="DashesUiSettings.ViewMode"/>).</summary>
    private static readonly string[] OverviewViewModes = ["gallery", "list"];

    private bool UpdateControls(JsonElement command, out string error)
    {
        error = "";
        if (!command.TryGetProperty("bindings", out JsonElement bindingsElement) || bindingsElement.ValueKind != JsonValueKind.Array)
        {
            error = "bindings must be an array";
            return false;
        }

        List<InputBinding> bindings = [];
        foreach (JsonElement item in bindingsElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object ||
                !TryString(item, "input", out string input) ||
                !TryString(item, "command", out string commandName))
            {
                error = "each binding needs a non-empty input and command";
                return false;
            }

            bindings.Add(new InputBinding { Input = input, Command = commandName });
        }

        this._runtime.Controls.Bindings = bindings;
        this._runtime.SaveControls();
        return true;
    }

    // ── Devices ─────────────────────────────────────────────────────────────

    private bool RemoveDevice(JsonElement command, out string error)
    {
        if (!this.FindDevice(command, out SavedDevice device, out error)) return false;
        this._runtime.RemoveDevice(device);
        return true;
    }

    private bool AddDevice(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "catalogId", out string catalogId)) { error = "catalogId is required"; return false; }
        CatalogDevice? catalog = this._runtime.Catalog.FirstOrDefault(item => string.Equals(item.Id, catalogId, StringComparison.OrdinalIgnoreCase));
        if (catalog is null) { error = "catalog device not found"; return false; }
        this._runtime.AddDevice(catalog);
        return true;
    }

    /// <summary>
    /// Builds a user-defined wheel catalog entry (issue #49's "Generic" tab) via
    /// <see cref="CustomWheelBuilder"/> and adds it exactly like a catalog pick. The synthesized
    /// entry is never persisted to the catalog itself, matching existing behavior: a custom
    /// wheel is a one-shot device, not a reusable preset.
    /// </summary>
    private bool AddCustomDevice(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "name", out string name)) { error = "name is required"; return false; }

        bool hasScreen = false;
        if (command.TryGetProperty("hasScreen", out JsonElement hasScreenElement))
        {
            if (hasScreenElement.ValueKind == JsonValueKind.True) { hasScreen = true; }
            else if (hasScreenElement.ValueKind == JsonValueKind.False) { hasScreen = false; }
            else { error = "hasScreen must be a boolean"; return false; }
        }

        TryStringField(command, "driver", out string driver);
        TryInt(command, "width", out int width);
        TryInt(command, "height", out int height);

        CustomWheelRequest request = new(name, hasScreen, driver, width, height);
        if (!CustomWheelBuilder.TryBuild(request, out CatalogDevice device, out string? failure))
        {
            error = failure ?? "invalid custom wheel";
            return false;
        }

        this._runtime.AddDevice(device);
        return true;
    }

    private bool UpdateDevice(JsonElement command, out string error)
    {
        error = "";
        if (!this.FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryStringField(command, "name", out string name)) { error = "name is required"; return false; }
        if (!TryInt(command, "rotation", out int rotation)) { error = "rotation is required"; return false; }
        if (!TryInt(command, "offsetX", out int offsetX)) { error = "offsetX is required"; return false; }
        if (!TryInt(command, "offsetY", out int offsetY)) { error = "offsetY is required"; return false; }
        if (!TryInt(command, "margin", out int margin)) { error = "margin is required"; return false; }
        if (!TryStringField(command, "dashId", out string dashId)) { error = "dashId is required"; return false; }

        DeviceOrientation orientation = DeviceOrientations.Resolve(rotation);
        DeviceOrientation previousOrientation = device.Orientation;
        // A saved capture region describes a rectangle in the panel's own axes; a rotation that
        // flips landscape<->portrait has to swap its width/height along with it, or the region
        // silently keeps describing the wrong axis (mirrors the deleted Avalonia client's
        // MainWindow.SetDeviceRotation). Computed before UpdateDevice mutates the device.
        ScreenCaptureRegion? reorientedCapture = previousOrientation != orientation && device.CaptureRegion is { IsValid: true } region
            ? CaptureSelectionGeometry.ReorientRegion(region, previousOrientation, orientation)
            : null;

        this._runtime.UpdateDevice(device, name, orientation, offsetX, offsetY, margin, dashId);

        if (reorientedCapture is not null && !Equals(device.CaptureRegion, reorientedCapture))
        {
            this._runtime.UpdateDeviceCaptureRegion(device, reorientedCapture);
        }

        return true;
    }

    private bool UpdateDevicePurpose(JsonElement command, out string error)
    {
        error = "";
        if (!this.FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryString(command, "purpose", out string purpose)) { error = "purpose is required"; return false; }
        this._runtime.UpdateDevicePurpose(device, purpose);
        return true;
    }

    private bool UpdateDeviceCaptureRegion(JsonElement command, out string error)
    {
        error = "";
        if (!this.FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryInt(command, "x", out int x) || !TryInt(command, "y", out int y) ||
            !TryInt(command, "width", out int width) || !TryInt(command, "height", out int height))
        {
            error = "x, y, width, and height are required";
            return false;
        }

        if (width <= 0 || height <= 0) { error = "a capture region needs a positive size"; return false; }

        this._runtime.UpdateDeviceCaptureRegion(device, new ScreenCaptureRegion(x, y, width, height));
        return true;
    }

    private bool UpdateDeviceRefreshHz(JsonElement command, out string error)
    {
        error = "";
        if (!this.FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryInt(command, "refreshHz", out int refreshHz)) { error = "refreshHz is required"; return false; }
        this._runtime.UpdateDeviceRefreshHz(device, refreshHz);
        return true;
    }

    /// <summary>
    /// Persists fields with no dedicated update command — today just
    /// <see cref="SavedDevice.Disabled"/>, toggled by direct field mutation followed by a
    /// plain save.
    /// </summary>
    private bool SaveDevice(JsonElement command, out string error)
    {
        error = "";
        if (!this.FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryBool(command, "disabled", out bool disabled)) { error = "disabled is required"; return false; }

        // Same gate DesktopRuntime's own device-mutating methods hold around their
        // mutate-then-save sequence (see DesktopRuntime.DevicesGate) -- this command mutates the
        // device directly rather than through one of those methods.
        lock (this._runtime.DevicesGate)
        {
            device.Disabled = disabled;
            this._runtime.SaveDevices();
        }

        return true;
    }

    private bool FindDevice(JsonElement command, out SavedDevice device, out string error)
    {
        device = null!;
        error = "";
        if (!TryString(command, "deviceId", out string id)) { error = "deviceId is required"; return false; }
        SavedDevice? found = this._runtime.Devices.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (found is null) { error = "device not found"; return false; }
        device = found;
        return true;
    }

    // ── Dashes ──────────────────────────────────────────────────────────────

    /// <summary>
    /// The New dash and Duplicate dialogs: <c>{ profileId?, sourceDashId?, name?, category? }</c>. Without
    /// <c>sourceDashId</c> it starts blank; with one it duplicates that dash refitted to the
    /// profile. <c>profileId</c> defaults to the source's own size, else the default profile.
    /// <c>name</c> defaults per start ("New dash" / "&lt;source&gt; copy"). <c>category</c> is a
    /// known category or null for "Other"; left out, a copy keeps the source's and a blank dash has none.
    /// </summary>
    private bool CreateDash(JsonElement command, out string error)
    {
        error = "";
        DashLayout? source = null;
        if (command.TryGetProperty("sourceDashId", out JsonElement sourceElement) && sourceElement.ValueKind != JsonValueKind.Null)
        {
            string sourceId = sourceElement.ValueKind == JsonValueKind.String ? sourceElement.GetString() ?? "" : "";
            source = this._runtime.DashLayouts.FirstOrDefault(item => string.Equals(item.Id, sourceId, StringComparison.OrdinalIgnoreCase));
            if (source is null) { error = "source dash not found"; return false; }
        }

        ScreenProfile profile = ScreenProfileCatalog.Resolve(source?.ScreenProfileId);
        if (command.TryGetProperty("profileId", out JsonElement profileElement) && profileElement.ValueKind != JsonValueKind.Null)
        {
            ScreenProfile? requested = profileElement.ValueKind == JsonValueKind.String ? ScreenProfileCatalog.Find(profileElement.GetString()) : null;
            if (requested is null) { error = "unknown screen profile"; return false; }
            profile = requested;
        }

        if (!TryOptionalNullableString(command, "name", out bool hasName, out string? name)) { error = "name must be a string"; return false; }
        if (hasName && name is not null && string.IsNullOrWhiteSpace(name)) { error = "name must not be blank"; return false; }

        if (!this.TryOptionalCategory(command, out bool hasCategory, out string? category, out error)) return false;
        if (!hasCategory) category = source?.Category;

        if (source is null)
        {
            this._runtime.CreateBlankDashLayout(profile, name, category);
        }
        else
        {
            this._runtime.DuplicateDashToProfile(source, profile, name, category);
        }

        return true;
    }

    /// <summary>
    /// Replaces a dash's content with a client-supplied layout. The dash's id and category are
    /// pinned to the existing record rather than trusted from the payload — identity is this
    /// endpoint's boundary, and the category has its own commands, so a save from a stale
    /// editor copy can never undo a category change made elsewhere.
    /// </summary>
    private bool SaveDash(JsonElement command, out string error)
    {
        error = "";
        if (!this.FindDash(command, out DashLayout existing, out error)) return false;
        if (!command.TryGetProperty("layout", out JsonElement layoutElement) || layoutElement.ValueKind != JsonValueKind.Object)
        {
            error = "layout is required";
            return false;
        }

        DashLayout? candidate;
        try
        {
            candidate = JsonSerializer.Deserialize<DashLayout>(layoutElement.GetRawText(), DashLayoutJsonOptions);
        }
        catch (JsonException)
        {
            candidate = null;
        }

        if (candidate is null) { error = "layout is not a valid dash layout"; return false; }

        candidate.Id = existing.Id;
        candidate.Category = existing.Category;
        // A client from before groups may still send widget stacks.
        DashWidgetStackMigration.Apply(candidate);

        if (!DashLayoutValidator.IsValid(candidate)) { error = "layout is invalid"; return false; }

        int index = this._runtime.DashLayouts.IndexOf(existing);
        this._runtime.DashLayouts[index] = candidate;
        this._runtime.SaveDashLayout(candidate);
        return true;
    }

    private bool ResetDash(JsonElement command, out string error)
    {
        if (!this.FindDash(command, out DashLayout layout, out error)) return false;
        this._runtime.ResetDashLayout(layout);
        return true;
    }

    /// <summary>Any dash can be deleted, even the last one; devices fall back to another dash or show nothing.</summary>
    private bool DeleteDash(JsonElement command, out string error)
    {
        if (!this.FindDash(command, out DashLayout layout, out error)) return false;
        this._runtime.DeleteDashLayout(layout);
        return true;
    }

    /// <summary><c>{ dashId, category }</c>: files a dash under a known category, or under "Other" when <c>category</c> is null.</summary>
    private bool SetDashCategory(JsonElement command, out string error)
    {
        if (!this.FindDash(command, out DashLayout layout, out error)) return false;
        if (!this.TryOptionalCategory(command, out bool hasCategory, out string? category, out error)) return false;
        if (!hasCategory) { error = "category is required (null for none)"; return false; }
        this._runtime.SetDashCategory(layout, category);
        return true;
    }

    /// <summary><c>{ name, dashId? }</c>: adds a custom category and, with <c>dashId</c>, moves that dash into it.</summary>
    private bool CreateDashCategory(JsonElement command, out string error)
    {
        error = "";
        DashLayout? layout = null;
        if (command.TryGetProperty("dashId", out JsonElement dashElement) && dashElement.ValueKind != JsonValueKind.Null)
        {
            if (!this.FindDash(command, out DashLayout found, out error)) return false;
            layout = found;
        }

        if (!TryOptionalNullableString(command, "name", out _, out string? name)) { error = "name must be a string"; return false; }
        if (!DashCategories.TryValidateName(name, this._runtime.Settings.CustomDashCategories, renaming: null, out string trimmed, out error)) return false;

        this._runtime.CreateDashCategory(trimmed);
        if (layout is not null) this._runtime.SetDashCategory(layout, trimmed);
        return true;
    }

    /// <summary><c>{ name, newName }</c>: renames a custom category, and with it every dash filed under it.</summary>
    private bool RenameDashCategory(JsonElement command, out string error)
    {
        if (!this.FindCustomCategory(command, out string name, out error)) return false;
        if (!TryOptionalNullableString(command, "newName", out _, out string? newName)) { error = "newName must be a string"; return false; }
        if (!DashCategories.TryValidateName(newName, this._runtime.Settings.CustomDashCategories, renaming: name, out string trimmed, out error)) return false;
        this._runtime.RenameDashCategory(name, trimmed);
        return true;
    }

    /// <summary><c>{ name }</c>: deletes a custom category; its dashes move to "Other".</summary>
    private bool DeleteDashCategory(JsonElement command, out string error)
    {
        if (!this.FindCustomCategory(command, out string name, out error)) return false;
        this._runtime.DeleteDashCategory(name);
        return true;
    }

    /// <summary>Resolves <c>name</c> to an existing custom category (built-ins cannot be renamed or deleted).</summary>
    private bool FindCustomCategory(JsonElement command, out string name, out string error)
    {
        name = "";
        error = "";
        if (!TryString(command, "name", out string requested)) { error = "name is required"; return false; }
        if (DashCategories.IsBuiltIn(requested)) { error = "built-in categories cannot be changed"; return false; }
        string? found = this._runtime.Settings.CustomDashCategories.FirstOrDefault(existing => string.Equals(existing, requested.Trim(), StringComparison.OrdinalIgnoreCase));
        if (found is null) { error = "category not found"; return false; }
        name = found;
        return true;
    }

    /// <summary>
    /// An optional <c>category</c> field: absent leaves <paramref name="present"/> false, JSON null
    /// means "Other", and a string must name a known category (resolved to its known spelling).
    /// </summary>
    private bool TryOptionalCategory(JsonElement command, out bool present, out string? category, out string error)
    {
        category = null;
        error = "";
        if (!TryOptionalNullableString(command, "category", out present, out string? requested)) { error = "category must be a string or null"; return false; }
        if (requested is null) return true;

        category = DashCategories.Find(requested, this._runtime.Settings.CustomDashCategories);
        if (category is null) { error = "unknown category"; return false; }
        return true;
    }

    private bool SetDashScreenProfile(JsonElement command, out string error)
    {
        error = "";
        if (!this.FindDash(command, out DashLayout layout, out error)) return false;
        if (!FindProfile(command, out ScreenProfile profile, out error)) return false;
        this._runtime.SetDashScreenProfile(layout, profile);
        return true;
    }

    /// <summary>
    /// Advances the page a screen shows by <paramref name="offset"/> (matrix 4.7, scoped per
    /// device -- mirrors the deleted Avalonia client's <c>DeviceScreenService.CycleDashPage</c>).
    /// Only meaningful for a device whose purpose resolves to a telemetry-backed layout
    /// (dashboard, flag display, lap timer); a rear-view mirror device has no page concept to
    /// cycle. <see cref="DashPageCycle.Move"/> itself has no HTTP/JSON dependency, so a future
    /// wheel-button dispatcher can call it directly with the same device+layout it would resolve
    /// here, without going through this command surface at all.
    /// </summary>
    private bool CycleDashPage(JsonElement command, int offset, out string error)
    {
        error = "";
        if (!this.FindDevice(command, out SavedDevice device, out error)) return false;

        DashLayout? layout = DevicePurposeLayouts.Resolve(device, this._runtime.DashLayouts);
        if (layout is null)
        {
            error = "device has no telemetry-backed screen layout to page through";
            return false;
        }

        this._pageCycle.Move(device.Id, layout, offset);
        return true;
    }

    private bool FindDash(JsonElement command, out DashLayout layout, out string error)
    {
        layout = null!;
        error = "";
        if (!TryString(command, "dashId", out string id)) { error = "dashId is required"; return false; }
        DashLayout? found = this._runtime.DashLayouts.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (found is null) { error = "dash not found"; return false; }
        layout = found;
        return true;
    }

    private static bool FindProfile(JsonElement command, out ScreenProfile profile, out string error)
    {
        profile = null!;
        error = "";
        if (!TryString(command, "profileId", out string id)) { error = "profileId is required"; return false; }
        ScreenProfile? found = ScreenProfileCatalog.Find(id);
        if (found is null) { error = "unknown screen profile"; return false; }
        profile = found;
        return true;
    }

    // ── Setups ──────────────────────────────────────────────────────────────

    private bool DuplicateSetup(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "setupId", out string id)) { error = "setupId is required"; return false; }
        SetupProgram? source = this._runtime.SetupPrograms.FirstOrDefault(program => string.Equals(program.Id, id, StringComparison.OrdinalIgnoreCase))
            ?? this._runtime.SetupTemplates.FirstOrDefault(program => string.Equals(program.Id, id, StringComparison.OrdinalIgnoreCase));
        if (source is null) { error = "setup not found"; return false; }
        this._runtime.DuplicateSetup(source);
        return true;
    }

    private bool SaveSetup(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "setupId", out string id)) { error = "setupId is required"; return false; }
        SetupProgram? program = this._runtime.SetupPrograms.FirstOrDefault(candidate => string.Equals(candidate.Id, id, StringComparison.OrdinalIgnoreCase));
        if (program is null) { error = "setup not found"; return false; }

        if (!command.TryGetProperty("values", out JsonElement valuesElement) || valuesElement.ValueKind != JsonValueKind.Object)
        {
            error = "values must be an object";
            return false;
        }

        Dictionary<string, double> values = new(StringComparer.OrdinalIgnoreCase);
        foreach (JsonProperty property in valuesElement.EnumerateObject())
        {
            SetupParameter? parameter = DesktopRuntime.SetupParameters.FirstOrDefault(candidate => string.Equals(candidate.Key, property.Name, StringComparison.OrdinalIgnoreCase));
            if (parameter is null || property.Value.ValueKind != JsonValueKind.Number)
            {
                error = $"unknown or invalid setup parameter: {property.Name}";
                return false;
            }

            double value = property.Value.GetDouble();
            if (value < parameter.Min || value > parameter.Max)
            {
                error = $"{property.Name} must be between {parameter.Min} and {parameter.Max}";
                return false;
            }

            values[parameter.Key] = value;
        }

        if (command.TryGetProperty("name", out JsonElement nameElement) && nameElement.ValueKind == JsonValueKind.String)
        {
            string? name = nameElement.GetString();
            if (!string.IsNullOrWhiteSpace(name))
            {
                program.Name = name.Trim();
            }
        }

        foreach (KeyValuePair<string, double> pair in values)
        {
            program.Values[pair.Key] = pair.Value;
        }

        this._runtime.SaveSetupPrograms();
        return true;
    }

    /// <summary>
    /// Deletes a user-created setup program. Templates are never in
    /// <see cref="IDesktopRuntime.SetupPrograms"/> (they live in the separate read-only
    /// <see cref="IDesktopRuntime.SetupTemplates"/>), so this can never delete one.
    /// </summary>
    private bool DeleteSetup(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "setupId", out string id)) { error = "setupId is required"; return false; }
        SetupProgram? program = this._runtime.SetupPrograms.FirstOrDefault(candidate => string.Equals(candidate.Id, id, StringComparison.OrdinalIgnoreCase));
        if (program is null) { error = "setup not found"; return false; }
        this._runtime.DeleteSetupProgram(program);
        return true;
    }

    // ── Session plans ───────────────────────────────────────────────────────

    private bool CreatePlan(JsonElement command, out string error)
    {
        error = "";
        TryStringField(command, "name", out string name);
        TryStringField(command, "game", out string game);
        TryStringField(command, "car", out string car);
        TryStringField(command, "track", out string track);
        TryStringField(command, "notes", out string notes);

        PlanMode mode = PlanMode.Planned;
        if (TryStringField(command, "mode", out string modeText) && !string.IsNullOrWhiteSpace(modeText)
            && !Enum.TryParse(modeText, ignoreCase: true, out mode))
        {
            error = $"unknown plan mode: {modeText}";
            return false;
        }

        bool qualifyingIncluded = true;
        if (command.TryGetProperty("qualifyingIncluded", out _) && !TryBool(command, "qualifyingIncluded", out qualifyingIncluded))
        {
            error = "qualifyingIncluded must be a boolean";
            return false;
        }

        RaceLengthFormat raceLengthFormat = RaceLengthFormat.Unknown;
        if (TryStringField(command, "raceLengthFormat", out string formatText) && !string.IsNullOrWhiteSpace(formatText)
            && !Enum.TryParse(formatText, ignoreCase: true, out raceLengthFormat))
        {
            error = $"unknown race length format: {formatText}";
            return false;
        }

        if (!TryOptionalDouble(command, "raceLengthValue", out double? raceLengthValue, out error)) return false;
        if (!TryOptionalDouble(command, "fuelReserveLaps", out double? fuelReserveLaps, out error)) return false;
        if (!TryOptionalDouble(command, "avgLapTimeSeconds", out double? avgLapTimeSeconds, out error)) return false;
        if (!TryOptionalDouble(command, "fuelPerLapLiters", out double? fuelPerLapLiters, out error)) return false;
        if (!TryStringArray(command, "setupReferences", out List<string> setupReferences, out error)) return false;

        CreatePlanRequest request = new()
        {
            Name = name,
            Game = game,
            Car = car,
            Track = track,
            Mode = mode,
            QualifyingIncluded = qualifyingIncluded,
            RaceLengthFormat = raceLengthFormat,
            RaceLengthValue = raceLengthValue ?? 0,
            FuelReserveLaps = Math.Max(0, (int)(fuelReserveLaps ?? 1)),
            AvgLapTimeSeconds = avgLapTimeSeconds,
            FuelPerLapLiters = fuelPerLapLiters,
            Notes = notes,
            SetupReferences = setupReferences,
        };

        this._planner.CreatePlan(request);
        return true;
    }

    /// <summary>
    /// Patches a plan's editable metadata — the same surface <see cref="CreatePlan"/> accepts,
    /// minus name/game/car/track's create-only meaning. Deliberately cannot touch
    /// <see cref="SessionPlan.Id"/>, <see cref="SessionPlan.Status"/>, or the plan's
    /// segments/targets/warnings: those are owned by <c>plan.arm</c>/<c>plan.start</c>/etc., not a
    /// client-supplied patch, mirroring how <c>dash.save</c> pins identity fields.
    /// </summary>
    private bool UpdatePlan(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        bool applied = false;

        if (TryStringField(command, "name", out string name) && !string.IsNullOrWhiteSpace(name))
        {
            plan.Name = name.Trim();
            applied = true;
        }

        if (TryStringField(command, "notes", out string notes))
        {
            plan.Notes = notes;
            applied = true;
        }

        if (command.TryGetProperty("qualifyingIncluded", out _))
        {
            if (!TryBool(command, "qualifyingIncluded", out bool qualifyingIncluded)) { error = "qualifyingIncluded must be a boolean"; return false; }
            plan.QualifyingIncluded = qualifyingIncluded;
            applied = true;
        }

        if (TryStringField(command, "raceLengthFormat", out string formatText) && !string.IsNullOrWhiteSpace(formatText))
        {
            if (!Enum.TryParse(formatText, ignoreCase: true, out RaceLengthFormat format)) { error = $"unknown race length format: {formatText}"; return false; }
            plan.RaceLengthFormat = format;
            applied = true;
        }

        if (!TryOptionalDouble(command, "raceLengthValue", out double? raceLengthValue, out error)) return false;
        if (raceLengthValue is { } newRaceLengthValue) { plan.RaceLengthValue = newRaceLengthValue; applied = true; }

        if (!TryOptionalDouble(command, "fuelReserveLaps", out double? fuelReserveLaps, out error)) return false;
        if (fuelReserveLaps is { } newFuelReserveLaps) { plan.FuelReserveLaps = Math.Max(0, (int)newFuelReserveLaps); applied = true; }

        if (command.TryGetProperty("avgLapTimeSeconds", out _))
        {
            if (!TryOptionalDouble(command, "avgLapTimeSeconds", out double? avgLapTimeSeconds, out error)) return false;
            plan.AvgLapTimeSeconds = avgLapTimeSeconds;
            applied = true;
        }

        if (command.TryGetProperty("fuelPerLapLiters", out _))
        {
            if (!TryOptionalDouble(command, "fuelPerLapLiters", out double? fuelPerLapLiters, out error)) return false;
            plan.FuelPerLapLiters = fuelPerLapLiters;
            applied = true;
        }

        if (command.TryGetProperty("setupReferences", out _))
        {
            if (!TryStringArray(command, "setupReferences", out List<string> setupReferences, out error)) return false;
            plan.SetupReferences = setupReferences;
            applied = true;
        }

        if (!applied) { error = "no recognized plan fields were provided"; return false; }

        this._planner.UpdatePlan(plan);
        return true;
    }

    private bool DeletePlan(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        this._planner.DeletePlan(plan.Id);
        return true;
    }

    private bool ArmPlan(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        try
        {
            this._planner.Arm(plan.Id);
            return true;
        }
        catch (InvalidOperationException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private bool DisarmPlan(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        this._planner.Disarm(plan.Id);
        return true;
    }

    private bool StartPlanSegment(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        if (!TryString(command, "kind", out string kindText)) { error = "kind is required"; return false; }
        if (!Enum.TryParse(kindText, ignoreCase: true, out SegmentKind kind)) { error = $"unknown segment kind: {kindText}"; return false; }

        try
        {
            this._planner.StartTracking(plan.Id, kind);
            return true;
        }
        catch (InvalidOperationException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private bool StopPlanSegment(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        this._planner.StopTracking(plan.Id);
        return true;
    }

    /// <summary>
    /// Stores a target picked from the plan's choices (<c>GET /api/planner/targets</c>): a scope's
    /// statistic, or with <c>statistic: "Custom"</c> one of its laps (<c>lapSessionId</c>,
    /// <c>lapNumber</c>). The pick is resolved against the corpus again, so only a lap that was
    /// driven can become a target. It latches at the next start/finish line (PlanTargetDelivery).
    /// </summary>
    private bool SetPlanTarget(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        if (!TrySegmentKind(command, out SegmentKind kind, out error)) return false;
        if (!TryString(command, "scope", out string scopeText) || !Enum.TryParse(scopeText, ignoreCase: true, out PlanTargetScope scope)) { error = "scope is required"; return false; }
        if (!TryString(command, "statistic", out string statisticText) || !Enum.TryParse(statisticText, ignoreCase: true, out PlanTargetStatistic statistic)) { error = "statistic is required"; return false; }
        string? programType = TryString(command, "programType", out string program) ? program : null;
        string? lapSessionId = TryString(command, "lapSessionId", out string session) ? session : null;
        int? lapNumber = TryInt(command, "lapNumber", out int lap) ? lap : null;
        if (statistic == PlanTargetStatistic.Custom && (lapSessionId is null || lapNumber is null)) { error = "a specific lap needs lapSessionId and lapNumber"; return false; }

        PlanTargetOption? option = PlanTargetResolver.ForPlan(this._lapHistory, plan).Find(scope, programType, statistic, lapSessionId, lapNumber);
        if (option is null) { error = "no such lap for this car and track"; return false; }

        plan.SetLapTimeTarget(kind, option.ToTarget(DateTimeOffset.UtcNow));
        this._planner.UpdatePlan(plan);
        return true;
    }

    private bool ClearPlanTarget(JsonElement command, out string error)
    {
        if (!this.TryPlan(command, out SessionPlan plan, out error)) return false;
        if (!TrySegmentKind(command, out SegmentKind kind, out error)) return false;
        plan.SetLapTimeTarget(kind, null);
        this._planner.UpdatePlan(plan);
        return true;
    }

    private static bool TrySegmentKind(JsonElement command, out SegmentKind kind, out string error)
    {
        error = "";
        kind = SegmentKind.Race;
        if (TryString(command, "kind", out string text) && Enum.TryParse(text, ignoreCase: true, out kind)) return true;
        error = "kind must be Qualifying or Race";
        return false;
    }

    private bool ReleaseActivePlan(out string error)
    {
        error = "";
        this._planner.ReleaseActiveSlot();
        return true;
    }

    private bool TryPlan(JsonElement command, out SessionPlan plan, out string error)
    {
        plan = null!;
        error = "";
        if (!TryString(command, "planId", out string id)) { error = "planId is required"; return false; }
        SessionPlan? found = this._planner.Find(id);
        if (found is null) { error = "plan not found"; return false; }
        plan = found;
        return true;
    }

    // ── Analysis ────────────────────────────────────────────────────────────

    private bool SelectAnalysisSession(JsonElement command, out string error)
    {
        error = "";
        if (!command.TryGetProperty("sessionId", out JsonElement sessionIdElement)) { error = "sessionId is required"; return false; }

        if (sessionIdElement.ValueKind == JsonValueKind.Null)
        {
            this._analysis.SelectSession(null);
            return true;
        }

        if (sessionIdElement.ValueKind != JsonValueKind.String) { error = "sessionId must be a string or null"; return false; }
        string sessionId = sessionIdElement.GetString() ?? "";
        // Looked up in the whole corpus as it is now: the sessions list shows every session live,
        // including one recorded since the filter was last rebuilt.
        CorpusSession? session = this._analysis.FindSession(sessionId);
        if (session is null) { error = "session not found"; return false; }
        this._analysis.SelectSession(session);
        return true;
    }

    /// <summary>
    /// Applies one or more filter narrowings in the same order the cascade depends on
    /// (track -> class -> car model -> day), so a single request that sets several at once
    /// narrows exactly as if they had been clicked in that order.
    /// </summary>
    private bool FilterAnalysis(JsonElement command, out string error)
    {
        error = "";
        bool applied = false;

        if (!TryOptionalNullableString(command, "track", out bool trackPresent, out string? track)) { error = "track must be a string or null"; return false; }
        if (trackPresent) { this._analysis.SelectTrack(track); applied = true; }

        if (!TryOptionalNullableString(command, "carClass", out bool carClassPresent, out string? carClass)) { error = "carClass must be a string or null"; return false; }
        if (carClassPresent) { this._analysis.SelectClass(carClass); applied = true; }

        if (!TryOptionalNullableString(command, "carModel", out bool carModelPresent, out string? carModel)) { error = "carModel must be a string or null"; return false; }
        if (carModelPresent) { this._analysis.SelectCarModel(carModel); applied = true; }

        if (command.TryGetProperty("day", out JsonElement dayElement))
        {
            if (dayElement.ValueKind == JsonValueKind.Null)
            {
                this._analysis.SelectDay(null);
                applied = true;
            }
            else if (dayElement.ValueKind == JsonValueKind.String && DateOnly.TryParse(dayElement.GetString(), out DateOnly day))
            {
                this._analysis.SelectDay(day);
                applied = true;
            }
            else
            {
                error = "day must be an ISO date string or null";
                return false;
            }
        }

        if (!applied) { error = "no recognized filter fields were provided"; return false; }
        return true;
    }

    /// <summary>
    /// Picks the primary or comparison lap from the laps currently listed for the open session
    /// (<c>analysis.selectSession</c> first). Cross-session comparison (spec: "compare tonight's
    /// lap against my best ever") works by selecting one lap, opening a different session via
    /// <c>analysis.selectSession</c>, then selecting the other — exactly the sequence the picker
    /// UI drives, since only changing track clears a chosen lap.
    /// </summary>
    private bool SelectAnalysisLap(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "role", out string role)) { error = "role is required"; return false; }
        bool primary = string.Equals(role, "primary", StringComparison.OrdinalIgnoreCase);
        bool comparison = !primary && string.Equals(role, "comparison", StringComparison.OrdinalIgnoreCase);
        if (!primary && !comparison) { error = "role must be 'primary' or 'comparison'"; return false; }

        if (!command.TryGetProperty("lapNumber", out JsonElement lapElement)) { error = "lapNumber is required"; return false; }

        CorpusLap? lap = null;
        if (lapElement.ValueKind != JsonValueKind.Null)
        {
            if (lapElement.ValueKind != JsonValueKind.Number || !lapElement.TryGetInt32(out int lapNumber))
            {
                error = "lapNumber must be a number or null";
                return false;
            }

            lap = this._analysis.State().Laps.FirstOrDefault(candidate => candidate.LapNumber == lapNumber);
            if (lap is null) { error = "lap not found in the open session"; return false; }
        }

        if (primary) { this._analysis.SelectPrimary(lap); }
        else { this._analysis.SelectComparison(lap); }
        return true;
    }

    /// <summary>
    /// Puts a setup (a Setups list id, or null to take it off) on one run of the open session.
    /// Only ever the driver's pick: nothing proposes one.
    /// </summary>
    private bool SetAnalysisRunSetup(JsonElement command, out string error)
    {
        error = "";
        if (!TryInt(command, "outing", out int outing)) { error = "outing must be a number"; return false; }
        if (!command.TryGetProperty("setupId", out JsonElement setupElement)) { error = "setupId is required"; return false; }
        if (setupElement.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) { error = "setupId must be a string or null"; return false; }

        string? setupId = setupElement.ValueKind == JsonValueKind.String ? setupElement.GetString() : null;
        if (setupId is { Length: 0 }) { error = "setupId must not be empty"; return false; }
        return this._analysis.SetRunSetup(outing, setupId, out error);
    }

    // ── Analysis: notes on a lap ─────────────────────────────────────────────

    /// <summary>A note at a place on a lap (metres from the line), signed with the driver name in Settings.</summary>
    private bool AddLapNote(JsonElement command, out string error)
    {
        if (!TryLapOf(command, out string sessionId, out int lapNumber, out error)) return false;
        if (!TryDouble(command, "distanceMeters", out double distanceMeters)) { error = "distanceMeters must be a number"; return false; }
        if (!TryStringField(command, "text", out string text)) { error = "text is required"; return false; }

        string author;
        lock (this._runtime.SettingsGate)
        {
            author = this._runtime.Settings.DriverName;
        }

        return this._analysis.AddNote(sessionId, lapNumber, distanceMeters, text, author, out error);
    }

    private bool UpdateLapNote(JsonElement command, out string error)
    {
        if (!TryLapOf(command, out string sessionId, out int lapNumber, out error)) return false;
        if (!TryString(command, "noteId", out string noteId)) { error = "noteId is required"; return false; }
        if (!TryStringField(command, "text", out string text)) { error = "text is required"; return false; }
        return this._analysis.UpdateNote(sessionId, lapNumber, noteId, text, out error);
    }

    private bool DeleteLapNote(JsonElement command, out string error)
    {
        if (!TryLapOf(command, out string sessionId, out int lapNumber, out error)) return false;
        if (!TryString(command, "noteId", out string noteId)) { error = "noteId is required"; return false; }
        return this._analysis.DeleteNote(sessionId, lapNumber, noteId, out error);
    }

    private static bool TryLapOf(JsonElement command, out string sessionId, out int lapNumber, out string error)
    {
        error = "";
        lapNumber = 0;
        if (!TryString(command, "sessionId", out sessionId)) { error = "sessionId is required"; return false; }
        if (!TryInt(command, "lapNumber", out lapNumber)) { error = "lapNumber must be a number"; return false; }
        return true;
    }

    // ── Diagnostics ─────────────────────────────────────────────────────────

    private bool SetLogLevel(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "level", out string levelText)) { error = "level is required"; return false; }
        if (!Enum.TryParse(levelText, ignoreCase: true, out LogLevel level)) { error = $"unknown log level: {levelText}"; return false; }
        this._diagnosticsLog.MinimumLevel = level;
        return true;
    }

    // ── Engineer ────────────────────────────────────────────────────────────

    private bool AcknowledgeEngineer(JsonElement command, out string error)
    {
        error = "";
        if (!TryBool(command, "succeeded", out bool succeeded)) { error = "succeeded is required"; return false; }
        this._runtime.AcknowledgeEngineerChanges(succeeded);
        return true;
    }

    /// <summary>
    /// Stages a value against one engineer control (car push is separate; see
    /// <c>engineer.push</c>). Not part of <see cref="IDesktopRuntime"/> as a named method —
    /// it mutates <see cref="EngineerControl.StagedValue"/> directly, so this is the
    /// command-surface equivalent rather than new runtime behavior.
    /// </summary>
    private bool StageEngineerControl(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "key", out string key)) { error = "key is required"; return false; }
        EngineerControl? control = this._runtime.EngineerControls.FirstOrDefault(candidate => string.Equals(candidate.Key, key, StringComparison.OrdinalIgnoreCase));
        if (control is null) { error = "engineer control not found"; return false; }
        if (!TryDouble(command, "value", out double value)) { error = "value is required"; return false; }
        control.StagedValue = Math.Clamp(value, control.Min, control.Max);
        return true;
    }

    // ── JSON argument helpers ───────────────────────────────────────────────

    /// <summary>A required, non-empty string property.</summary>
    private static bool TryString(JsonElement command, string name, out string value)
    {
        value = "";
        if (!command.TryGetProperty(name, out JsonElement element) || element.ValueKind != JsonValueKind.String) return false;
        value = element.GetString() ?? "";
        return !string.IsNullOrWhiteSpace(value);
    }

    /// <summary>A required string property that may be empty (the runtime treats blank as "no change").</summary>
    private static bool TryStringField(JsonElement command, string name, out string value)
    {
        value = "";
        if (!command.TryGetProperty(name, out JsonElement element) || element.ValueKind != JsonValueKind.String) return false;
        value = element.GetString() ?? "";
        return true;
    }

    private static bool TryInt(JsonElement command, string name, out int value)
    {
        value = 0;
        return command.TryGetProperty(name, out JsonElement element) && element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out value);
    }

    private static bool TryDouble(JsonElement command, string name, out double value)
    {
        value = 0;
        return command.TryGetProperty(name, out JsonElement element) && element.ValueKind == JsonValueKind.Number && element.TryGetDouble(out value);
    }

    private static bool TryBool(JsonElement command, string name, out bool value)
    {
        value = false;
        if (!command.TryGetProperty(name, out JsonElement element)) return false;
        if (element.ValueKind == JsonValueKind.True) { value = true; return true; }
        if (element.ValueKind == JsonValueKind.False) { value = false; return true; }
        return false;
    }

    /// <summary>
    /// An optional numeric field: absent or explicit JSON null both yield <c>null</c> (caller
    /// substitutes its own default), a number yields that value, and anything else is a shape
    /// error rather than a silently-ignored bad value.
    /// </summary>
    private static bool TryOptionalDouble(JsonElement command, string name, out double? value, out string error)
    {
        value = null;
        error = "";
        if (!command.TryGetProperty(name, out JsonElement element) || element.ValueKind == JsonValueKind.Null) return true;
        if (element.ValueKind != JsonValueKind.Number || !element.TryGetDouble(out double parsed))
        {
            error = $"{name} must be a number";
            return false;
        }

        value = parsed;
        return true;
    }

    /// <summary>
    /// An optional nullable string field. <paramref name="present"/> distinguishes "field not
    /// sent" (leave the current value alone) from "field sent as null" (clear it) — both report
    /// success with <paramref name="value"/> null, but only the caller can tell them apart.
    /// </summary>
    private static bool TryOptionalNullableString(JsonElement command, string name, out bool present, out string? value)
    {
        value = null;
        present = command.TryGetProperty(name, out JsonElement element);
        if (!present) return true;
        if (element.ValueKind == JsonValueKind.Null) return true;
        if (element.ValueKind == JsonValueKind.String) { value = element.GetString(); return true; }
        return false;
    }

    /// <summary>An optional array-of-strings field; absent or null yields an empty list.</summary>
    private static bool TryStringArray(JsonElement command, string name, out List<string> values, out string error)
    {
        values = [];
        error = "";
        if (!command.TryGetProperty(name, out JsonElement element) || element.ValueKind == JsonValueKind.Null) return true;
        if (element.ValueKind != JsonValueKind.Array) { error = $"{name} must be an array"; return false; }

        foreach (JsonElement item in element.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) { error = $"{name} must be an array of strings"; return false; }
            values.Add(item.GetString() ?? "");
        }

        return true;
    }
}
