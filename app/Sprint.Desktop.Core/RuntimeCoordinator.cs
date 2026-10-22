using System.Text.Json;
using Sprint.Desktop;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Engineer;
using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Runtime;

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

    /// <summary>
    /// <paramref name="planner"/>/<paramref name="analysis"/>/<paramref name="diagnosticsLog"/> default
    /// to a runtime-rooted store each when omitted, so existing callers that only care about the
    /// runtime-backed commands (most tests) do not have to wire up the session-planning, analysis,
    /// and diagnostics stacks just to construct a coordinator. The host wires the real, shared
    /// instances explicitly so command writes and <c>/api/state</c> reads agree -- <paramref
    /// name="pageCycle"/> in particular has to be the very instance <c>ScreenOutputs.Describe</c>
    /// reads, or a <c>dash.page.next</c> command would never be visible in <c>screens[]</c>.
    /// </summary>
    public RuntimeCoordinator(
        IDesktopRuntime runtime,
        SessionPlannerService? planner = null,
        AnalysisController? analysis = null,
        LiveLogStore? diagnosticsLog = null,
        DashPageCycle? pageCycle = null)
    {
        this._runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        this._planner = planner ?? new SessionPlannerService(new LocalSessionPlanStore(Path.Combine(runtime.DataRoot, "session-plans")));
        this._analysis = analysis ?? new AnalysisController(new LapCorpusBrowser(
            new LocalLapHistoryStore(Path.Combine(runtime.DataRoot, "lap-history")),
            new LocalLapTraceStore(Path.Combine(runtime.DataRoot, "lap-traces"))));
        this._diagnosticsLog = diagnosticsLog ?? new LiveLogStore();
        this._pageCycle = pageCycle ?? new DashPageCycle();
    }

    public bool Execute(JsonElement command, out string error)
    {
        error = "";
        if (!command.TryGetProperty("type", out JsonElement typeElement) || typeElement.ValueKind != JsonValueKind.String) { error = "command type is required"; return false; }
        string type = typeElement.GetString() ?? "";
        switch (type)
        {
            case "settings.save": _runtime.SaveSettings(); return true;
            case "settings.reset": _runtime.ResetSettingsToDefaults(); return true;
            case "settings.update": return UpdateSettings(command, out error);
            case "cloud.configure": return ConfigureCloud(command, out error);
            case "controls.save": _runtime.SaveControls(); return true;
            case "controls.update": return UpdateControls(command, out error);
            case "engineer.revert": _runtime.RevertEngineerChanges(); return true;
            case "engineer.push": _runtime.PushEngineerChanges(); return true;
            case "engineer.acknowledge": return AcknowledgeEngineer(command, out error);
            case "engineer.stage": return StageEngineerControl(command, out error);
            case "engineer.message": if (!TryString(command, "message", out string message)) { error = "message is required"; return false; } _runtime.SendQuickMessage(message); return true;
            case "devices.remove": return RemoveDevice(command, out error);
            case "devices.add": return AddDevice(command, out error);
            case "devices.addCustom": return AddCustomDevice(command, out error);
            case "devices.update": return UpdateDevice(command, out error);
            case "devices.purpose": return UpdateDevicePurpose(command, out error);
            case "devices.captureRegion": return UpdateDeviceCaptureRegion(command, out error);
            case "devices.refreshHz": return UpdateDeviceRefreshHz(command, out error);
            case "devices.save": return SaveDevice(command, out error);
            case "dash.create": return CreateDash(command, out error);
            case "dash.duplicate": return DuplicateDash(command, out error);
            case "dash.save": return SaveDash(command, out error);
            case "dash.reset": return ResetDash(command, out error);
            case "dash.setDefault": return SetDefaultDash(command, out error);
            case "dash.delete": return DeleteDash(command, out error);
            case "dash.setScreenProfile": return SetDashScreenProfile(command, out error);
            case SprintCommands.DashPageNext: return CycleDashPage(command, offset: 1, out error);
            case SprintCommands.DashPagePrev: return CycleDashPage(command, offset: -1, out error);
            case "setup.duplicate": return DuplicateSetup(command, out error);
            case "setup.save": return SaveSetup(command, out error);
            case "setup.delete": return DeleteSetup(command, out error);
            case "plan.create": return CreatePlan(command, out error);
            case "plan.update": return UpdatePlan(command, out error);
            case "plan.delete": return DeletePlan(command, out error);
            case "plan.arm": return ArmPlan(command, out error);
            case "plan.disarm": return DisarmPlan(command, out error);
            case "plan.start": return StartPlanSegment(command, out error);
            case "plan.stop": return StopPlanSegment(command, out error);
            case "plan.releaseActive": return ReleaseActivePlan(out error);
            case "analysis.refresh": this._analysis.Load(); return true;
            case "analysis.selectSession": return SelectAnalysisSession(command, out error);
            case "analysis.filter": return FilterAnalysis(command, out error);
            case "analysis.selectLap": return SelectAnalysisLap(command, out error);
            case "diagnostics.setLogLevel": return SetLogLevel(command, out error);
            default: error = $"unknown command type: {type}"; return false;
        }
    }

    // ── Settings / controls (validated patch, never a whole-object overwrite) ──

    private bool UpdateSettings(JsonElement command, out string error)
    {
        error = "";
        bool applied = false;

        // Mutation and save happen under the same lock the background telemetry-ingest loop's
        // last-seen-context capture also takes (DesktopRuntime.SettingsGate), so a Kestrel
        // request thread here can never race that loop's own Settings mutate-then-save.
        lock (_runtime.SettingsGate)
        {
            if (TryBool(command, "sidebarCollapsed", out bool sidebarCollapsed))
            {
                _runtime.Settings.SidebarCollapsed = sidebarCollapsed;
                applied = true;
            }

            if (TryStringField(command, "updateChannel", out string updateChannel))
            {
                _runtime.Settings.UpdateChannel = AppSettings.NormalizeChannel(updateChannel);
                applied = true;
            }

            if (TryStringField(command, "driverName", out string driverName) && !string.IsNullOrWhiteSpace(driverName))
            {
                _runtime.Settings.DriverName = driverName.Trim();
                applied = true;
            }

            if (TryStringField(command, "driverNumber", out string driverNumber) && !string.IsNullOrWhiteSpace(driverNumber))
            {
                _runtime.Settings.DriverNumber = driverNumber.Trim();
                applied = true;
            }

            if (TryStringField(command, "devicesUiViewMode", out string devicesUiViewMode) && !string.IsNullOrWhiteSpace(devicesUiViewMode))
            {
                if (!DevicesUiViewModes.Contains(devicesUiViewMode.Trim(), StringComparer.OrdinalIgnoreCase))
                {
                    error = $"unknown devices UI view mode: {devicesUiViewMode}";
                    return false;
                }

                _runtime.Settings.DevicesUI.ViewMode = devicesUiViewMode.Trim();
                applied = true;
            }

            if (!applied) { error = "no recognized settings fields were provided"; return false; }

            _runtime.SaveSettings();
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

    /// <summary>The Devices overview's two list modes (<see cref="DevicesUiSettings.ViewMode"/>).</summary>
    private static readonly string[] DevicesUiViewModes = ["gallery", "list"];

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

        _runtime.Controls.Bindings = bindings;
        _runtime.SaveControls();
        return true;
    }

    // ── Devices ─────────────────────────────────────────────────────────────

    private bool RemoveDevice(JsonElement command, out string error)
    {
        if (!FindDevice(command, out SavedDevice device, out error)) return false;
        _runtime.RemoveDevice(device);
        return true;
    }

    private bool AddDevice(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "catalogId", out string catalogId)) { error = "catalogId is required"; return false; }
        CatalogDevice? catalog = _runtime.Catalog.FirstOrDefault(item => string.Equals(item.Id, catalogId, StringComparison.OrdinalIgnoreCase));
        if (catalog is null) { error = "catalog device not found"; return false; }
        _runtime.AddDevice(catalog);
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
        if (!FindDevice(command, out SavedDevice device, out error)) return false;
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
        if (!FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryString(command, "purpose", out string purpose)) { error = "purpose is required"; return false; }
        _runtime.UpdateDevicePurpose(device, purpose);
        return true;
    }

    private bool UpdateDeviceCaptureRegion(JsonElement command, out string error)
    {
        error = "";
        if (!FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryInt(command, "x", out int x) || !TryInt(command, "y", out int y) ||
            !TryInt(command, "width", out int width) || !TryInt(command, "height", out int height))
        {
            error = "x, y, width, and height are required";
            return false;
        }

        if (width <= 0 || height <= 0) { error = "a capture region needs a positive size"; return false; }

        _runtime.UpdateDeviceCaptureRegion(device, new ScreenCaptureRegion(x, y, width, height));
        return true;
    }

    private bool UpdateDeviceRefreshHz(JsonElement command, out string error)
    {
        error = "";
        if (!FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryInt(command, "refreshHz", out int refreshHz)) { error = "refreshHz is required"; return false; }
        _runtime.UpdateDeviceRefreshHz(device, refreshHz);
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
        if (!FindDevice(command, out SavedDevice device, out error)) return false;
        if (!TryBool(command, "disabled", out bool disabled)) { error = "disabled is required"; return false; }

        // Same gate DesktopRuntime's own device-mutating methods hold around their
        // mutate-then-save sequence (see DesktopRuntime.DevicesGate) -- this command mutates the
        // device directly rather than through one of those methods.
        lock (_runtime.DevicesGate)
        {
            device.Disabled = disabled;
            _runtime.SaveDevices();
        }

        return true;
    }

    private bool FindDevice(JsonElement command, out SavedDevice device, out string error)
    {
        device = null!;
        error = "";
        if (!TryString(command, "deviceId", out string id)) { error = "deviceId is required"; return false; }
        SavedDevice? found = _runtime.Devices.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (found is null) { error = "device not found"; return false; }
        device = found;
        return true;
    }

    // ── Dashes ──────────────────────────────────────────────────────────────

    private bool CreateDash(JsonElement command, out string error)
    {
        error = "";
        if (command.TryGetProperty("profileId", out JsonElement profileElement) && profileElement.ValueKind == JsonValueKind.String)
        {
            ScreenProfile? profile = ScreenProfileCatalog.Find(profileElement.GetString());
            if (profile is null) { error = "unknown screen profile"; return false; }
            _runtime.CreateDashLayout(profile);
            return true;
        }

        _runtime.CreateDashLayout();
        return true;
    }

    private bool DuplicateDash(JsonElement command, out string error)
    {
        error = "";
        if (!FindDash(command, out DashLayout source, out error)) return false;
        if (!FindProfile(command, out ScreenProfile profile, out error)) return false;
        _runtime.DuplicateDashToProfile(source, profile);
        return true;
    }

    /// <summary>
    /// Replaces a dash's content with a client-supplied layout. The dash's id and default
    /// status are pinned to the existing record rather than trusted from the payload — id
    /// identity and default assignment are this endpoint's boundary, not something a save
    /// should be able to smuggle a change into.
    /// </summary>
    private bool SaveDash(JsonElement command, out string error)
    {
        error = "";
        if (!FindDash(command, out DashLayout existing, out error)) return false;
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
        candidate.IsDefault = existing.IsDefault;

        if (!DashLayoutValidator.IsValid(candidate)) { error = "layout is invalid"; return false; }

        int index = _runtime.DashLayouts.IndexOf(existing);
        _runtime.DashLayouts[index] = candidate;
        _runtime.SaveDashLayout(candidate);
        return true;
    }

    private bool ResetDash(JsonElement command, out string error)
    {
        if (!FindDash(command, out DashLayout layout, out error)) return false;
        _runtime.ResetDashLayout(layout);
        return true;
    }

    private bool SetDefaultDash(JsonElement command, out string error)
    {
        if (!FindDash(command, out DashLayout layout, out error)) return false;
        _runtime.SetDefaultDashLayout(layout);
        return true;
    }

    private bool DeleteDash(JsonElement command, out string error)
    {
        if (!FindDash(command, out DashLayout layout, out error)) return false;
        if (layout.IsDefault) { error = "cannot delete the default dash"; return false; }
        if (_runtime.DashLayouts.Count <= 1) { error = "cannot delete the only dash"; return false; }
        _runtime.DeleteDashLayout(layout);
        return true;
    }

    private bool SetDashScreenProfile(JsonElement command, out string error)
    {
        error = "";
        if (!FindDash(command, out DashLayout layout, out error)) return false;
        if (!FindProfile(command, out ScreenProfile profile, out error)) return false;
        _runtime.SetDashScreenProfile(layout, profile);
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
        if (!FindDevice(command, out SavedDevice device, out error)) return false;

        DashLayout? layout = DevicePurposeLayouts.Resolve(device, _runtime.DashLayouts);
        if (layout is null)
        {
            error = "device has no telemetry-backed screen layout to page through";
            return false;
        }

        _pageCycle.Move(device.Id, layout, offset);
        return true;
    }

    private bool FindDash(JsonElement command, out DashLayout layout, out string error)
    {
        layout = null!;
        error = "";
        if (!TryString(command, "dashId", out string id)) { error = "dashId is required"; return false; }
        DashLayout? found = _runtime.DashLayouts.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
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
        SetupProgram? source = _runtime.SetupPrograms.FirstOrDefault(program => string.Equals(program.Id, id, StringComparison.OrdinalIgnoreCase))
            ?? _runtime.SetupTemplates.FirstOrDefault(program => string.Equals(program.Id, id, StringComparison.OrdinalIgnoreCase));
        if (source is null) { error = "setup not found"; return false; }
        _runtime.DuplicateSetup(source);
        return true;
    }

    private bool SaveSetup(JsonElement command, out string error)
    {
        error = "";
        if (!TryString(command, "setupId", out string id)) { error = "setupId is required"; return false; }
        SetupProgram? program = _runtime.SetupPrograms.FirstOrDefault(candidate => string.Equals(candidate.Id, id, StringComparison.OrdinalIgnoreCase));
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

        _runtime.SaveSetupPrograms();
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
        if (!TryPlan(command, out SessionPlan plan, out error)) return false;
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
        if (!TryPlan(command, out SessionPlan plan, out error)) return false;
        this._planner.DeletePlan(plan.Id);
        return true;
    }

    private bool ArmPlan(JsonElement command, out string error)
    {
        if (!TryPlan(command, out SessionPlan plan, out error)) return false;
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
        if (!TryPlan(command, out SessionPlan plan, out error)) return false;
        this._planner.Disarm(plan.Id);
        return true;
    }

    private bool StartPlanSegment(JsonElement command, out string error)
    {
        if (!TryPlan(command, out SessionPlan plan, out error)) return false;
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
        if (!TryPlan(command, out SessionPlan plan, out error)) return false;
        this._planner.StopTracking(plan.Id);
        return true;
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
        // Looked up against the currently narrowed list (not the whole corpus): selecting a
        // session is the last step of the same narrowing cascade the filter commands drive, so a
        // session the current filter has excluded is correctly "not found" rather than reachable
        // by id alone.
        CorpusSession? session = this._analysis.Filter.Sessions.FirstOrDefault(candidate => string.Equals(candidate.Id, sessionId, StringComparison.Ordinal));
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
        _runtime.AcknowledgeEngineerChanges(succeeded);
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
        EngineerControl? control = _runtime.EngineerControls.FirstOrDefault(candidate => string.Equals(candidate.Key, key, StringComparison.OrdinalIgnoreCase));
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
