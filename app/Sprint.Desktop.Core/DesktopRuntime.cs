using System.Collections.ObjectModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Engineer;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop;

public sealed class DesktopRuntime : IDesktopRuntime
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    private readonly string _settingsPath;
    private readonly string _devicesPath;
    private readonly string _controlsPath;
    private readonly string _setupProgramsPath;
    private readonly string _layoutsPath;
    private readonly string _dataRoot;
    private readonly string _presetRoot;
    private readonly string? _legacyDataRoot;
    private readonly ILog _log;

    /// <summary>
    /// Guards every mutate-then-save sequence touching <see cref="Settings"/>/<see cref="Devices"/>
    /// respectively, so a save on one thread never serializes an object another thread is mid-way
    /// through mutating (the host saves from background loops -- plan-context capture, detected
    /// screen resolutions -- concurrently with HTTP command handlers). Two separate gates so a
    /// settings save and a devices save never block each other. Callers outside this class that
    /// mutate before saving (e.g. <c>RuntimeCoordinator</c>, <c>Program.cs</c>'s screen-reconcile
    /// loop) take the same lock around their own mutate-then-save block.
    /// </summary>
    public object SettingsGate { get; } = new();

    public object DevicesGate { get; } = new();

    private readonly ObservableCollection<SetupProgram> _setupTemplates = [];
    private readonly Dictionary<string, SetupProgram> _canonicalSetupTemplates = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<SetupProgram, SetupProgram> _canonicalSetupTemplateByObject = new(ReferenceEqualityComparer.Instance);
    private IReadOnlyList<Sprint.Desktop.Api.Engineer.StagedControlChange> _pendingEngineerChanges = [];

    public DesktopRuntime(
        string? dataRoot = null,
        string? presetRoot = null,
        string? legacyDataRoot = null,
        ILog? log = null)
    {
        _log = log ?? NullLog.Instance;

        var resolvedDataRoot = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint");
        Directory.CreateDirectory(resolvedDataRoot);
        _dataRoot = resolvedDataRoot;

        _presetRoot = presetRoot ?? Path.Combine(AppContext.BaseDirectory, "presets");
        _legacyDataRoot = legacyDataRoot ?? Path.Combine(AppContext.BaseDirectory, "data");
        _settingsPath = Path.Combine(resolvedDataRoot, "settings.json");
        _devicesPath = Path.Combine(resolvedDataRoot, "devices.json");
        _controlsPath = Path.Combine(resolvedDataRoot, "controls.json");
        _setupProgramsPath = Path.Combine(resolvedDataRoot, "setup-programs.json");
        _layoutsPath = Path.Combine(resolvedDataRoot, "dash-layouts");
        Directory.CreateDirectory(_layoutsPath);
        SetupTemplates = new ReadOnlyObservableCollection<SetupProgram>(_setupTemplates);

        MigrateLegacyDataIfNeeded();

        Settings = LoadSettings();
        Controls = LoadControls();
        foreach (var device in LoadCatalog())
        {
            Catalog.Add(device);
        }

        foreach (var device in LoadDevices())
        {
            Devices.Add(device);
        }

        foreach (var layout in LoadLayouts())
        {
            DashLayouts.Add(layout);
        }

        foreach (var setup in LoadSetupTemplates())
        {
            _setupTemplates.Add(setup);
            var snapshot = Clone(setup);
            _canonicalSetupTemplates[setup.Id] = snapshot;
            _canonicalSetupTemplateByObject[setup] = snapshot;
        }

        foreach (var setup in LoadSetupPrograms())
        {
            SetupPrograms.Add(setup);
        }

        foreach (var control in CreateEngineerControls())
        {
            EngineerControls.Add(control);
        }

        RadioLog.Add(new RadioLogEntry
        {
            Message = "RADIO CHECK",
            Detail = "Crew channel confirmed",
            Lap = 18,
            Status = "ACK"
        });
        RadioLog.Add(new RadioLogEntry
        {
            Message = "Dash sync",
            Detail = "Setup baseline and wheel page are aligned",
            Lap = 17,
            Status = "DASH"
        });

        _log.Info(
            $"Desktop runtime ready: devices={Devices.Count} dashes={DashLayouts.Count} " +
            $"setups={SetupPrograms.Count} catalog={Catalog.Count}.");
    }

    public AppSettings Settings { get; }
    public string DataRoot => _dataRoot;
    public ControlsConfig Controls { get; }
    public RenderProfile CurrentRenderProfile => new(Settings.DriverName, Settings.DriverNumber);
    public ObservableCollection<CatalogDevice> Catalog { get; } = [];
    public ObservableCollection<SavedDevice> Devices { get; } = [];
    public ObservableCollection<DashLayout> DashLayouts { get; } = [];
    public ReadOnlyObservableCollection<SetupProgram> SetupTemplates { get; }
    public ObservableCollection<SetupProgram> SetupPrograms { get; } = [];
    public ObservableCollection<EngineerControl> EngineerControls { get; } = [];
    public ObservableCollection<RadioLogEntry> RadioLog { get; } = [];
    public ExternalOperationState EngineerPushState { get; private set; } = ExternalOperationState.Idle;

    public event EventHandler<RenderProfile>? RenderProfileChanged;

    public void SaveSettings()
    {
        lock (SettingsGate)
        {
            SaveJson(_settingsPath, Settings);
        }

        _log.Debug("Settings saved.");
        RenderProfileChanged?.Invoke(this, CurrentRenderProfile);
    }

    public void ResetSettingsToDefaults()
    {
        lock (SettingsGate)
        {
            AppSettings defaults = LoadDefaultSettings();
            Settings.SidebarCollapsed = defaults.SidebarCollapsed;
            Settings.UpdateChannel = defaults.UpdateChannel;
            Settings.DriverName = defaults.DriverName;
            Settings.DriverNumber = defaults.DriverNumber;
            Settings.DashEditorUI = defaults.DashEditorUI;
            Settings.NewDashDefaults = defaults.NewDashDefaults;
            SaveSettings();
        }

        _log.Info("Settings reset to defaults.");
    }

    public void SaveControls()
    {
        SaveJson(_controlsPath, Controls);
        _log.Debug("Control bindings saved.");
    }

    public SavedDevice AddDevice(CatalogDevice catalog)
    {
        SavedDevice saved;
        lock (DevicesGate)
        {
            // Only a screen transport gets a stand-in resolution (hardware detection then
            // corrects it). A screenless device — e.g. a custom wheel with buttons only —
            // must stay at 0×0, or DeviceCapabilities would treat it as a screen.
            var isUsbd = catalog.Driver.Contains("usbd", StringComparison.OrdinalIgnoreCase);
            var hasScreenTransport = isUsbd
                || catalog.Driver.Contains("vocore", StringComparison.OrdinalIgnoreCase)
                || string.Equals(catalog.Type, "screen", StringComparison.OrdinalIgnoreCase);
            // USBD480 NX's documented fallback size lives with its protocol, so the stand-in
            // matches what the driver falls back to when the panel does not answer.
            var fallback = isUsbd ? Usbd480Protocol.DefaultNativeSize : new ScreenNativeSize(800, 480);
            var width = catalog.Width > 0 ? catalog.Width : hasScreenTransport ? fallback.Width : 0;
            var height = catalog.Height > 0 ? catalog.Height : hasScreenTransport ? fallback.Height : 0;
            // Find the lowest index whose composite id is not already in use, so ids
            // stay unique even after devices are removed (a plain count+1 can collide
            // with a survivor and then crash reconciliation on a duplicate key).
            var prefix = catalog.Vid == 0 && catalog.Pid == 0 ? "SIM" : "USB";
            string serial, id;
            var nextIndex = 1;
            do
            {
                serial = $"{prefix}-{nextIndex:000}";
                id = $"{catalog.Driver}-{catalog.Vid:x4}-{catalog.Pid:x4}-{serial}".ToLowerInvariant();
                nextIndex++;
            }
            while (Devices.Any(device => device.Id.Equals(id, StringComparison.OrdinalIgnoreCase)));

            saved = new SavedDevice
            {
                Id = id,
                Name = catalog.Name,
                PresetId = catalog.Id,
                Driver = catalog.Driver,
                Type = catalog.Type,
                Vid = catalog.Vid,
                Pid = catalog.Pid,
                Serial = serial,
                Width = width,
                Height = height,
                Orientation = catalog.Orientation,
                OffsetX = catalog.OffsetX,
                OffsetY = catalog.OffsetY,
                Margin = catalog.Margin,
                Bindings = Clone(catalog.Bindings),
                // A new device shows the fallback dash until one is picked; with no dash at all it
                // keeps an empty id and shows nothing until a dash exists.
                DashId = DashLayoutOrder.First(this.DashLayouts)?.Id ?? ""
            };

            Devices.Add(saved);
            SaveDevices();
        }

        _log.Info(
            $"Device added: id={saved.Id} driver={saved.Driver} type={saved.Type} " +
            $"vid=0x{saved.Vid:X4} pid=0x{saved.Pid:X4}.");
        return saved;
    }

    public void UpdateDevice(
        SavedDevice device,
        string name,
        DeviceOrientation orientation,
        int offsetX,
        int offsetY,
        int margin,
        string dashId)
    {
        lock (DevicesGate)
        {
            device.Name = string.IsNullOrWhiteSpace(name) ? device.Name : name.Trim();
            device.Orientation = orientation;
            device.OffsetX = offsetX;
            device.OffsetY = offsetY;
            device.Margin = margin;
            device.DashId = string.IsNullOrWhiteSpace(dashId) ? device.DashId : dashId.Trim();
            SaveDevices();
        }

        _log.Info(
            $"Device updated: id={device.Id} rotation={device.Rotation} " +
            $"offset={device.OffsetX},{device.OffsetY} margin={device.Margin} dash={device.DashId}.");
    }

    /// <summary>
    /// Sets what a device's screen is used for (issue #53). The caller re-syncs the
    /// screen service so it can switch between assigned, built-in, and capture output.
    /// </summary>
    public void UpdateDevicePurpose(SavedDevice device, string purpose)
    {
        var normalized = DevicePurposes.Normalize(purpose);
        lock (DevicesGate)
        {
            if (string.Equals(device.Purpose, normalized, StringComparison.Ordinal))
            {
                return;
            }

            device.Purpose = normalized;
            SaveDevices();
        }

        _log.Info($"Device purpose changed: id={device.Id} purpose={normalized}.");
    }

    public void UpdateDeviceCaptureRegion(SavedDevice device, ScreenCaptureRegion region)
    {
        ArgumentNullException.ThrowIfNull(device);
        ArgumentNullException.ThrowIfNull(region);
        if (!region.IsValid)
        {
            throw new ArgumentOutOfRangeException(nameof(region), "A capture region needs a positive size.");
        }

        lock (DevicesGate)
        {
            if (Equals(device.CaptureRegion, region))
            {
                return;
            }

            device.CaptureRegion = region;
            SaveDevices();
        }

        _log.Info(
            $"Device capture region changed: id={device.Id} " +
            $"region={region.X},{region.Y},{region.Width}x{region.Height}.");
    }

    /// <summary>
    /// Sets the screen refresh rate (issue #75). Applies to the hardware publisher and
    /// the live preview alike, so the caller must re-sync the screen service.
    /// </summary>
    public void UpdateDeviceRefreshHz(SavedDevice device, int refreshHz)
    {
        var normalized = DeviceRefreshRates.Normalize(refreshHz);
        lock (DevicesGate)
        {
            if (device.RefreshHz == normalized)
            {
                return;
            }

            device.RefreshHz = normalized;
            SaveDevices();
        }

        _log.Info($"Device refresh rate changed: id={device.Id} hz={normalized}.");
    }

    public void RemoveDevice(SavedDevice device)
    {
        lock (DevicesGate)
        {
            Devices.Remove(device);
            SaveDevices();
        }

        _log.Info($"Device removed: id={device.Id} driver={device.Driver}.");
    }

    /// <summary>
    /// Creates a blank dash for <paramref name="profile"/>: one empty page, the functional colour
    /// system and panel style, no idle page. The preset's alerts and alert settings come along so
    /// alerts work out of the box. A blank <paramref name="name"/> becomes "New dash".
    /// </summary>
    public DashLayout CreateBlankDashLayout(ScreenProfile profile, string? name, string? category)
    {
        ArgumentNullException.ThrowIfNull(profile);
        DashLayout preset = this.LoadPresetDashLayout();
        DashLayout layout = new()
        {
            Id = this.NextDashId(),
            Name = string.IsNullOrWhiteSpace(name) ? "New dash" : name.Trim(),
            Category = category,
            Mode = NormalizeDashMode(this.Settings.NewDashDefaults.Mode),
            ColorSystem = DashColorSystem.Functional,
            DashStyle = DashStyle.Panels,
            Pages = [new DashPage { Id = "page-1", Name = "Page 1" }],
            Alerts = Clone(preset.Alerts),
            AlertConfig = Clone(preset.AlertConfig),
        };
        DashLayoutEditor.ApplyScreenProfile(layout, profile);
        this.DashLayouts.Add(layout);
        this.SaveDashLayout(layout);
        this._log.Info($"Dash created: id={layout.Id} profile={profile.Id}.");
        return layout;
    }

    /// <summary>Retarget an existing dash to a different screen size in place (US17), refitting its grid and persisting.</summary>
    public void SetDashScreenProfile(DashLayout layout, ScreenProfile profile)
    {
        ArgumentNullException.ThrowIfNull(layout);
        ArgumentNullException.ThrowIfNull(profile);
        if (DashLayoutEditor.TargetsProfile(layout, profile))
        {
            return;
        }

        DashLayoutEditor.ApplyScreenProfile(layout, profile);
        this.SaveDashLayout(layout);
        this._log.Info($"Dash screen profile changed: id={layout.Id} profile={profile.Id}.");
    }

    /// <summary>
    /// Duplicate a dash and retarget the copy to a screen size (US18): an independent,
    /// refit layout with its own id, leaving the source untouched: the Dashes page's Duplicate
    /// dialog and the designer's Duplicate. A blank <paramref name="name"/> becomes
    /// "&lt;source&gt; copy"; <paramref name="category"/> is the copy's, already resolved.
    /// </summary>
    public DashLayout DuplicateDashToProfile(DashLayout source, ScreenProfile profile, string? name, string? category)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(profile);

        DashLayout clone = Clone(source);
        clone.Id = this.NextDashId();
        clone.Name = string.IsNullOrWhiteSpace(name) ? $"{source.Name} copy" : name.Trim();
        clone.Category = category;
        DashLayoutEditor.ApplyScreenProfile(clone, profile);
        this.DashLayouts.Add(clone);
        this.SaveDashLayout(clone);
        this._log.Info($"Dash duplicated: source={source.Id} copy={clone.Id} profile={profile.Id}.");
        return clone;
    }

    /// <summary>
    /// Ensures a layout has a valid target screen profile. Legacy layouts without a
    /// stored profile keep their grid and are tagged with the best-fit catalog profile
    /// (matched by grid, then aspect), so nothing about their placement changes.
    /// </summary>
    private static void NormalizeLayoutProfile(DashLayout layout)
    {
        if (ScreenProfileCatalog.Find(layout.ScreenProfileId) is not null)
        {
            return;
        }

        layout.ScreenProfileId = ScreenProfileCatalog.MatchGrid(layout.GridCols, layout.GridRows).Id;
    }

    /// <summary>Deletes any dash, even the last one. Devices that showed it fall back to <see cref="DashLayoutOrder.First"/>.</summary>
    public void DeleteDashLayout(DashLayout layout)
    {
        this.DashLayouts.Remove(layout);
        string path = Path.Combine(this._layoutsPath, $"{layout.Id}.json");
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        this._log.Info($"Dash deleted: id={layout.Id}.");
    }

    /// <summary>Files a dash under <paramref name="category"/> (a known spelling, see <see cref="DashCategories.Find"/>), or under "Other" when null.</summary>
    public void SetDashCategory(DashLayout layout, string? category)
    {
        if (string.Equals(layout.Category, category, StringComparison.Ordinal))
        {
            return;
        }

        layout.Category = category;
        this.SaveDashLayout(layout);
        this._log.Info($"Dash category changed: id={layout.Id} category={category ?? "(none)"}.");
    }

    // The category list is replaced, never changed in place, so a state snapshot being
    // serialized on another thread never sees it mid-change.

    /// <summary>Adds a custom category; <paramref name="name"/> is already validated (<see cref="DashCategories.TryValidateName"/>).</summary>
    public void CreateDashCategory(string name)
    {
        lock (this.SettingsGate)
        {
            this.Settings.CustomDashCategories = [.. this.Settings.CustomDashCategories, name];
            SaveJson(this._settingsPath, this.Settings);
        }

        this._log.Info($"Dash category created: {name}.");
    }

    /// <summary>Renames a custom category and moves every dash in it along; <paramref name="newName"/> is already validated.</summary>
    public void RenameDashCategory(string name, string newName)
    {
        lock (this.SettingsGate)
        {
            List<string> custom = [.. this.Settings.CustomDashCategories];
            int index = custom.FindIndex(existing => string.Equals(existing, name, StringComparison.OrdinalIgnoreCase));
            if (index < 0)
            {
                return;
            }

            custom[index] = newName;
            this.Settings.CustomDashCategories = custom;
            SaveJson(this._settingsPath, this.Settings);
        }

        foreach (DashLayout layout in this.DashLayouts.Where(layout => string.Equals(layout.Category, name, StringComparison.OrdinalIgnoreCase)).ToList())
        {
            layout.Category = newName;
            this.SaveDashLayout(layout);
        }

        this._log.Info($"Dash category renamed: {name} -> {newName}.");
    }

    /// <summary>Removes a custom category; its dashes move to "Other".</summary>
    public void DeleteDashCategory(string name)
    {
        lock (this.SettingsGate)
        {
            this.Settings.CustomDashCategories = this.Settings.CustomDashCategories
                .Where(existing => !string.Equals(existing, name, StringComparison.OrdinalIgnoreCase))
                .ToList();
            SaveJson(this._settingsPath, this.Settings);
        }

        foreach (DashLayout layout in this.DashLayouts.Where(layout => string.Equals(layout.Category, name, StringComparison.OrdinalIgnoreCase)).ToList())
        {
            layout.Category = null;
            this.SaveDashLayout(layout);
        }

        this._log.Info($"Dash category deleted: {name}.");
    }

    /// <summary>
    /// Makes a dash's category one this runtime knows: trims it, stores the known spelling, drops a
    /// blank or reserved one, and adopts an unknown name as a custom category (a dash synced from
    /// another PC, or hand-edited JSON). Returns whether the dash's category changed; the caller saves it.
    /// </summary>
    public bool AdoptDashCategory(DashLayout layout)
    {
        string? before = layout.Category;
        string trimmed = before?.Trim() ?? "";
        if (trimmed.Length == 0 || DashCategories.IsReserved(trimmed))
        {
            layout.Category = null;
            return before is not null;
        }

        lock (this.SettingsGate)
        {
            string? known = DashCategories.Find(trimmed, this.Settings.CustomDashCategories);
            if (known is null)
            {
                this.Settings.CustomDashCategories = [.. this.Settings.CustomDashCategories, trimmed];
                SaveJson(this._settingsPath, this.Settings);
                this._log.Info($"Dash category adopted from dash {layout.Id}: {trimmed}.");
                known = trimmed;
            }

            layout.Category = known;
        }

        return !string.Equals(before, layout.Category, StringComparison.Ordinal);
    }

    /// <summary>A fresh, unused dash id.</summary>
    private string NextDashId()
    {
        string stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff");
        string id = $"layout-{stamp}";
        int index = 2;
        while (this.DashLayouts.Any(layout => string.Equals(layout.Id, id, StringComparison.OrdinalIgnoreCase)))
        {
            id = $"layout-{stamp}-{index}";
            index++;
        }

        return id;
    }

    public SetupProgram DuplicateSetup(SetupProgram source)
    {
        var sourceSnapshot = TemplateSnapshotFor(source) ?? source;
        var copy = Clone(sourceSnapshot);
        copy.Id = NextSetupId();
        copy.Name = NextSetupCopyName(sourceSnapshot.Name);
        copy.IsTemplate = false;
        copy.Values = new Dictionary<string, double>(sourceSnapshot.Values, StringComparer.OrdinalIgnoreCase);

        SetupPrograms.Add(copy);
        SaveSetupPrograms();
        _log.Info($"Setup duplicated: source={source.Id} copy={copy.Id}.");
        return copy;
    }

    public void SaveSetupPrograms()
    {
        SaveJson(_setupProgramsPath, SetupPrograms.Where(program => !program.IsTemplate).ToList());
        _log.Debug($"Setup programs saved: count={SetupPrograms.Count}.");
    }

    /// <summary>
    /// Deletes a user-created setup program. <see cref="SetupPrograms"/> never holds a template
    /// (see <see cref="SetupTemplates"/>), so this can never delete one.
    /// </summary>
    public void DeleteSetupProgram(SetupProgram program)
    {
        this.SetupPrograms.Remove(program);
        this.SaveSetupPrograms();
        this._log.Info($"Setup deleted: id={program.Id}.");
    }

    public void PushEngineerChanges()
    {
        var dirty = EngineerStageService.DirtyChanges(EngineerControls);
        if (dirty.Count == 0)
        {
            return;
        }

        // Build the human-readable radio detail before applying (push mutates CarValue).
        var dirtyKeys = dirty.Select(change => change.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var detail = string.Join(" | ", EngineerControls
            .Where(control => dirtyKeys.Contains(control.Key))
            .Select(control => $"{control.Label} {FormatControlValue(control, control.CarValue)} -> {FormatControlValue(control, control.StagedValue)}"));

        _pendingEngineerChanges = dirty;
        EngineerPushState = ExternalOperationState.Pending;
        PrependRadioLog("Push staged changes", detail, "PENDING");
        _log.Info($"Engineer changes staged for push: count={dirty.Count}.");
    }

    public void AcknowledgeEngineerChanges(bool succeeded)
    {
        if (EngineerPushState != ExternalOperationState.Pending)
        {
            return;
        }

        if (succeeded)
        {
            foreach (var change in _pendingEngineerChanges)
            {
                var control = EngineerControls.FirstOrDefault(candidate =>
                    string.Equals(candidate.Key, change.Key, StringComparison.OrdinalIgnoreCase));
                if (control is not null)
                {
                    control.CarValue = change.StagedValue;
                }
            }

            EngineerPushState = ExternalOperationState.Confirmed;
            PrependRadioLog("Push confirmed", "The external target acknowledged the staged changes", "CONFIRMED");
            _log.Info("Engineer changes acknowledged by target.");
        }
        else
        {
            EngineerPushState = ExternalOperationState.Failed;
            PrependRadioLog("Push failed", "Staged changes were retained for retry", "FAILED");
            _log.Warn("Engineer changes rejected or not acknowledged by target.");
        }

        _pendingEngineerChanges = [];
    }

    public void RevertEngineerChanges()
    {
        EngineerStageService.Revert(EngineerControls);
        PrependRadioLog("Revert", "Staged car control changes cleared", "DASH");
        _log.Info("Engineer staged changes reverted.");
    }

    public void SendQuickMessage(string message)
    {
        PrependRadioLog(message, "Quick message staged to the driver radio", "SENT");
        _log.Info("Quick radio message staged.");
    }

    public static string FormatControlValue(EngineerControl control, double value)
    {
        var decimals = control.Step < 1 ? 1 : 0;
        var formatted = value.ToString(decimals == 0 ? "0" : "0.0");
        return string.IsNullOrWhiteSpace(control.Unit) ? formatted : $"{formatted}{control.Unit}";
    }

    public static IReadOnlyList<SetupParameter> SetupParameters { get; } =
    [
        new() { Key = "splitter", Label = "Front splitter", Min = 1, Max = 5, Group = "Aero" },
        new() { Key = "rearWing", Label = "Rear wing", Min = 1, Max = 12, Group = "Aero" },
        new() { Key = "springF", Label = "Spring F", Min = 80, Max = 180, Step = 5, Unit = "N/mm", Group = "Suspension" },
        new() { Key = "springR", Label = "Spring R", Min = 90, Max = 200, Step = 5, Unit = "N/mm", Group = "Suspension" },
        new() { Key = "arbF", Label = "Anti-roll F", Min = 1, Max = 6, Group = "Suspension" },
        new() { Key = "arbR", Label = "Anti-roll R", Min = 1, Max = 6, Group = "Suspension" },
        new() { Key = "rideF", Label = "Ride height F", Min = 50, Max = 80, Unit = "mm", Group = "Suspension" },
        new() { Key = "rideR", Label = "Ride height R", Min = 55, Max = 90, Unit = "mm", Group = "Suspension" },
        new() { Key = "pressF", Label = "Pressure F", Min = 24, Max = 30, Step = 0.1, Unit = "psi", Group = "Tires" },
        new() { Key = "pressR", Label = "Pressure R", Min = 24, Max = 30, Step = 0.1, Unit = "psi", Group = "Tires" },
        new() { Key = "bias", Label = "Brake bias", Min = 48, Max = 64, Step = 0.5, Unit = "%", Group = "Brakes" },
        new() { Key = "ducts", Label = "Brake ducts", Min = 1, Max = 6, Group = "Brakes" },
        new() { Key = "diff", Label = "Diff preload", Min = 20, Max = 120, Step = 5, Unit = "Nm", Group = "Brakes" },
        new() { Key = "fuelLoad", Label = "Fuel load", Min = 10, Max = 90, Unit = "L", Group = "Fuel" }
    ];

    public static string FormatSetupValue(SetupParameter parameter, double value)
    {
        var decimals = parameter.Step < 1 ? 1 : 0;
        var formatted = value.ToString(decimals == 0 ? "0" : "0.0");
        return string.IsNullOrWhiteSpace(parameter.Unit) ? formatted : $"{formatted} {parameter.Unit}";
    }

    private AppSettings LoadSettings()
    {
        var fallback = LoadDefaultSettings();
        var settings = LoadJson<AppSettings>(_settingsPath) ?? fallback;
        // Fold legacy three-channel values (beta/alpha) into the two-channel model.
        settings.UpdateChannel = AppSettings.NormalizeChannel(settings.UpdateChannel);
        settings.CustomDashCategories = NormalizeCustomDashCategories(settings.CustomDashCategories);
        return settings;
    }

    /// <summary>Trimmed, unique (case-insensitive) custom category names; blanks, built-ins and reserved names dropped.</summary>
    private static List<string> NormalizeCustomDashCategories(IEnumerable<string?>? names)
    {
        List<string> normalized = [];
        foreach (string? name in names ?? [])
        {
            string trimmed = name?.Trim() ?? "";
            if (trimmed.Length == 0 || DashCategories.IsBuiltIn(trimmed) || DashCategories.IsReserved(trimmed) ||
                normalized.Contains(trimmed, StringComparer.OrdinalIgnoreCase))
            {
                continue;
            }

            normalized.Add(trimmed);
        }

        return normalized;
    }

    private AppSettings LoadDefaultSettings() =>
        LoadJson<AppSettings>(PresetPath("settings", "default.json")) ?? new AppSettings();

    private IEnumerable<CatalogDevice> LoadCatalog()
    {
        var dir = PresetPath("devices");
        if (Directory.Exists(dir))
        {
            foreach (var file in Directory.EnumerateFiles(dir, "*.json").OrderBy(Path.GetFileName))
            {
                var entry = LoadJson<CatalogDevice>(file);
                if (entry is not null)
                {
                    yield return entry;
                }
            }
        }

        if (Catalog.Count == 0)
        {
            yield return new CatalogDevice
            {
                Id = "generic-vocore",
                Name = "VoCore screen",
                Description = "Any VoCore display",
                Brand = "VoCore",
                Detect = [new UsbIdPattern { Vid = 0xC872 }],
                Driver = "vocore"
            };
        }
    }

    private IEnumerable<SavedDevice> LoadDevices()
    {
        var devices = LoadJson<List<SavedDevice>>(_devicesPath) ?? [];
        foreach (var device in devices)
        {
            // Devices saved before purposes existed (and any unknown value) resolve to
            // dash, so an older devices.json keeps driving its screens.
            device.Purpose = DevicePurposes.Normalize(device.Purpose);
            device.RefreshHz = DeviceRefreshRates.Normalize(device.RefreshHz);
        }

        return devices;
    }

    private ControlsConfig LoadControls()
    {
        return LoadJson<ControlsConfig>(_controlsPath) ?? new ControlsConfig();
    }

    private IEnumerable<SetupProgram> LoadSetupTemplates()
    {
        var dir = PresetPath("setups");
        if (Directory.Exists(dir))
        {
            foreach (var file in Directory.EnumerateFiles(dir, "*.json").OrderBy(Path.GetFileName))
            {
                var entry = LoadJson<SetupProgram>(file);
                if (NormalizeSetupProgram(entry, isTemplate: true) is { } template)
                {
                    yield return template;
                }
            }
        }

        if (_setupTemplates.Count == 0)
        {
            foreach (var template in CreateSetupTemplates())
            {
                if (NormalizeSetupProgram(template, isTemplate: true) is { } normalized)
                {
                    yield return normalized;
                }
            }
        }
    }

    private IEnumerable<SetupProgram> LoadSetupPrograms()
    {
        var programs = LoadJson<List<SetupProgram>>(_setupProgramsPath) ?? [];
        foreach (var program in programs)
        {
            if (NormalizeSetupProgram(program, isTemplate: false) is { } normalized)
            {
                yield return normalized;
            }
        }
    }

    private IEnumerable<DashLayout> LoadLayouts()
    {
        var layouts = new List<DashLayout>();
        if (Directory.Exists(_layoutsPath))
        {
            foreach (var file in Directory.EnumerateFiles(_layoutsPath, "*.json"))
            {
                var layout = LoadJson<DashLayout>(file);
                if (layout is null)
                {
                    continue;
                }

                // Turn old widget stacks into groups and rewrite renamed widget types before
                // validation, which would otherwise reject the whole layout.
                bool contentMigrated = DashWidgetStackMigration.Apply(layout) | DashWidgetTypeMigration.Apply(layout);
                if (DashLayoutValidator.IsValid(layout))
                {
                    var migrated = contentMigrated;
                    if (layout.ColorSystem is null)
                    {
                        NormalizeLayoutColorSystem(layout);
                        migrated = true;
                    }
                    migrated |= layout.Theme?.NormalizeProtectedColors() == true;
                    // Dashes saved before categories had a per-PC "default" flag; it is gone.
                    migrated |= layout.ExtensionData?.Remove("default") == true;
                    migrated |= this.AdoptDashCategory(layout);
                    if (migrated)
                    {
                        SaveJson(file, layout);
                    }
                    layouts.Add(layout);
                }
            }
        }

        // The preset dash is seeded once (first run, or the first run after an upgrade), marked by
        // a file beside the dashes. After that an empty list is the user's choice (every dash can
        // be deleted) and stays empty across restarts.
        string seededMarker = Path.Combine(this._layoutsPath, ".preset-seeded");
        if (!File.Exists(seededMarker))
        {
            if (layouts.Count == 0)
            {
                DashLayout preset = this.LoadPresetDashLayout();
                NormalizeLayoutProfile(preset);
                this.SaveDashLayout(preset);
                layouts.Add(preset);
            }

            File.WriteAllText(seededMarker, "");
        }

        // Tag any layout missing a target screen profile (legacy saves) with the
        // best-fit catalog profile so the dash↔screen model is always populated.
        foreach (var layout in layouts)
        {
            NormalizeLayoutProfile(layout);
            NormalizeLayoutColorSystem(layout);
        }

        return DashLayoutOrder.Sort(layouts);
    }

    private void MigrateLegacyDataIfNeeded()
    {
        if (string.IsNullOrWhiteSpace(_legacyDataRoot) || !Directory.Exists(_legacyDataRoot))
        {
            return;
        }

        MigrateLegacySettingsIfNeeded();
        MigrateLegacyDevicesIfNeeded();
        MigrateLegacyLayoutsIfNeeded();
    }

    private void MigrateLegacySettingsIfNeeded()
    {
        if (File.Exists(_settingsPath))
        {
            return;
        }

        var legacySettingsPath = Path.Combine(_legacyDataRoot!, "settings.json");
        var settings = LoadJson<AppSettings>(legacySettingsPath);
        if (settings is not null)
        {
            SaveJson(_settingsPath, settings);
        }
    }

    private void MigrateLegacyDevicesIfNeeded()
    {
        if (File.Exists(_devicesPath))
        {
            return;
        }

        var legacyDevicesDir = Path.Combine(_legacyDataRoot!, "devices");
        if (!Directory.Exists(legacyDevicesDir))
        {
            return;
        }

        var saved = new List<SavedDevice>();
        foreach (var fileName in new[] { "wheels.json", "screens.json", "buttonboxes.json" })
        {
            var path = Path.Combine(legacyDevicesDir, fileName);
            var entries = LoadJson<List<LegacyDevice>>(path);
            if (entries is null)
            {
                continue;
            }

            foreach (var entry in entries)
            {
                saved.Add(entry.ToSavedDevice(saved.Count + 1));
            }
        }

        if (saved.Count > 0)
        {
            SaveJson(_devicesPath, saved);
        }
    }

    private void MigrateLegacyLayoutsIfNeeded()
    {
        if (Directory.EnumerateFiles(_layoutsPath, "*.json").Any())
        {
            return;
        }

        var legacyLayoutsDir = Path.Combine(_legacyDataRoot!, "layouts");
        if (!Directory.Exists(legacyLayoutsDir))
        {
            return;
        }

        foreach (var layoutDir in Directory.EnumerateDirectories(legacyLayoutsDir))
        {
            var legacyConfig = Path.Combine(layoutDir, "config.json");
            DashLayout? layout = LoadJson<DashLayout>(legacyConfig);
            if (layout is null)
            {
                continue;
            }

            DashWidgetStackMigration.Apply(layout);
            if (!DashLayoutValidator.IsValid(layout))
            {
                continue;
            }

            SaveDashLayout(layout);
        }
    }

    public void SaveDevices()
    {
        lock (DevicesGate)
        {
            SaveJson(_devicesPath, Devices.ToList());
        }

        _log.Debug($"Devices saved: count={Devices.Count}.");
    }

    public void SaveDashLayout(DashLayout layout)
    {
        if (!DashLayoutValidator.IsValid(layout))
        {
            throw new InvalidOperationException($"Dash layout '{layout.Id}' is invalid and cannot be saved.");
        }

        NormalizeLayoutColorSystem(layout);
        layout.Theme?.NormalizeProtectedColors();
        SaveJson(Path.Combine(_layoutsPath, $"{layout.Id}.json"), layout);
        _log.Debug($"Dash saved: id={layout.Id} pages={layout.Pages.Count}.");
    }

    /// <summary>
    /// Puts the preset's pages, alerts and look back into a dash. It keeps its id, name, category
    /// and screen size: the preset is refitted to the dash's own screen profile.
    /// </summary>
    public void ResetDashLayout(DashLayout layout)
    {
        DashLayout preset = this.LoadPresetDashLayout();
        string id = layout.Id;
        string name = layout.Name;
        string? category = layout.Category;
        ScreenProfile profile = ScreenProfileCatalog.Resolve(layout.ScreenProfileId);

        layout.GridCols = preset.GridCols;
        layout.GridRows = preset.GridRows;
        layout.Mode = preset.Mode;
        layout.ColorSystem = preset.EffectiveColorSystem;
        layout.DashStyle = preset.DashStyle;
        layout.IdlePage = Clone(preset.IdlePage);
        layout.Pages = Clone(preset.Pages);
        layout.Alerts = Clone(preset.Alerts);
        layout.AlertConfig = Clone(preset.AlertConfig);
        layout.Theme = Clone(preset.Theme);
        layout.ExtensionData = preset.ExtensionData is null ? null : Clone(preset.ExtensionData);
        layout.Id = id;
        layout.Name = name;
        layout.Category = category;
        DashLayoutEditor.ApplyScreenProfile(layout, profile);

        this.SaveDashLayout(layout);
        this._log.Info($"Dash reset to preset content: id={layout.Id}.");
    }

    private static void NormalizeLayoutColorSystem(DashLayout layout) =>
        layout.ColorSystem ??= layout.EffectiveColorSystem;

    private static string NormalizeDashMode(string? mode) =>
        string.Equals(mode, "advanced", StringComparison.OrdinalIgnoreCase) ? "advanced" : "basic";

    private void PrependRadioLog(string message, string detail, string status)
    {
        RadioLog.Insert(0, new RadioLogEntry
        {
            Message = message,
            Detail = detail,
            Lap = 18,
            Status = status
        });

        while (RadioLog.Count > 8)
        {
            RadioLog.RemoveAt(RadioLog.Count - 1);
        }
    }

    private string NextSetupId()
    {
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff");
        var index = 1;
        string id;
        do
        {
            id = $"setup-{stamp}-{index:00}";
            index++;
        }
        while (SetupPrograms.Any(program => program.Id.Equals(id, StringComparison.OrdinalIgnoreCase)));

        return id;
    }

    private SetupProgram? TemplateSnapshotFor(SetupProgram source)
    {
        if (_canonicalSetupTemplateByObject.TryGetValue(source, out var objectTemplate))
        {
            return objectTemplate;
        }

        if (source.IsTemplate && _canonicalSetupTemplates.TryGetValue(source.Id, out var template))
        {
            return template;
        }

        return null;
    }

    private static SetupProgram? NormalizeSetupProgram(SetupProgram? program, bool isTemplate)
    {
        if (program is null || string.IsNullOrWhiteSpace(program.Id))
        {
            return null;
        }

        program.Id = program.Id.Trim();
        program.Name = string.IsNullOrWhiteSpace(program.Name) ? program.Id : program.Name.Trim();
        program.IsTemplate = isTemplate;
        program.Values = program.Values is null
            ? new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, double>(program.Values, StringComparer.OrdinalIgnoreCase);

        return program;
    }

    private string NextSetupCopyName(string sourceName)
    {
        var baseName = $"{sourceName} copy";
        if (SetupPrograms.All(program => !program.Name.Equals(baseName, StringComparison.OrdinalIgnoreCase)))
        {
            return baseName;
        }

        var index = 2;
        string name;
        do
        {
            name = $"{baseName} {index}";
            index++;
        }
        while (SetupPrograms.Any(program => program.Name.Equals(name, StringComparison.OrdinalIgnoreCase)));

        return name;
    }

    private static T Clone<T>(T value)
    {
        string json = JsonSerializer.Serialize(value, JsonOptions);
        return JsonSerializer.Deserialize<T>(json, JsonOptions)!;
    }

    private T? LoadJson<T>(string path)
    {
        if (!File.Exists(path))
        {
            _log.Debug(
                $"Configuration file not found; defaults will be used: " +
                $"file={Path.GetFileName(path)} type={typeof(T).Name}.");
            return default;
        }

        using var stream = File.OpenRead(path);
        try
        {
            var value = JsonSerializer.Deserialize<T>(stream, JsonOptions);
            _log.Debug($"Configuration loaded: file={Path.GetFileName(path)} type={typeof(T).Name}.");
            return value;
        }
        catch (JsonException ex)
        {
            // A corrupt file falls back to defaults rather than crashing, but that
            // silent reset used to be invisible — record it so it can be diagnosed.
            _log.Warn($"Ignoring corrupt JSON at {path}; falling back to default", ex);
            return default;
        }
    }

    private static void SaveJson<T>(string path, T value)
    {
        AtomicFile.Write(path, stream => JsonSerializer.Serialize(stream, value, JsonOptions));
    }

    private string PresetPath(params string[] segments)
    {
        return Path.Combine([_presetRoot, .. segments]);
    }

    /// <summary>The shipped preset dash (id "default"), or a minimal built-in one when the preset is missing.</summary>
    private DashLayout LoadPresetDashLayout() =>
        this.LoadJson<DashLayout>(this.PresetPath("dash", "default.json")) ?? CreateFallbackDashLayout();

    private static DashLayout CreateFallbackDashLayout()
    {
        return new DashLayout
        {
            Id = "default",
            Name = "Default",
            Pages =
            [
                new DashPage
                {
                    Id = "main-default",
                    Name = "Main",
                    Widgets =
                    [
                        new DashWidget { Id = "header", Type = "header", ColSpan = 20 },
                        new DashWidget { Id = "gear", Type = "gear_speed", Col = 1, Row = 1, ColSpan = 7, RowSpan = 5 },
                        new DashWidget { Id = "lap", Type = "lap_time", Col = 9, Row = 1, ColSpan = 11, RowSpan = 3 },
                        new DashWidget { Id = "fuel", Type = "fuel", Col = 9, Row = 6, ColSpan = 11, RowSpan = 3 }
                    ]
                }
            ]
        };
    }

    private static IEnumerable<SetupProgram> CreateSetupTemplates()
    {
        yield return new SetupProgram
        {
            Id = "setup-baseline",
            Name = "Baseline | Race",
            IsTemplate = true,
            Values = new Dictionary<string, double>
            {
                ["splitter"] = 3,
                ["rearWing"] = 7,
                ["springF"] = 130,
                ["springR"] = 145,
                ["arbF"] = 3,
                ["arbR"] = 4,
                ["rideF"] = 60,
                ["rideR"] = 68,
                ["pressF"] = 27.4,
                ["pressR"] = 27.1,
                ["bias"] = 56.5,
                ["ducts"] = 3,
                ["diff"] = 60,
                ["fuelLoad"] = 62
            }
        };
        yield return new SetupProgram
        {
            Id = "setup-quali-low-df",
            Name = "Quali | Low DF",
            IsTemplate = true,
            Values = new Dictionary<string, double>
            {
                ["splitter"] = 2,
                ["rearWing"] = 4,
                ["springF"] = 140,
                ["springR"] = 155,
                ["arbF"] = 4,
                ["arbR"] = 4,
                ["rideF"] = 56,
                ["rideR"] = 64,
                ["pressF"] = 27.8,
                ["pressR"] = 27.5,
                ["bias"] = 57.5,
                ["ducts"] = 2,
                ["diff"] = 70,
                ["fuelLoad"] = 18
            }
        };
        yield return new SetupProgram
        {
            Id = "setup-race-high-df",
            Name = "Race | High DF",
            IsTemplate = true,
            Values = new Dictionary<string, double>
            {
                ["splitter"] = 4,
                ["rearWing"] = 10,
                ["springF"] = 125,
                ["springR"] = 140,
                ["arbF"] = 3,
                ["arbR"] = 3,
                ["rideF"] = 62,
                ["rideR"] = 72,
                ["pressF"] = 27.0,
                ["pressR"] = 26.8,
                ["bias"] = 55.5,
                ["ducts"] = 4,
                ["diff"] = 55,
                ["fuelLoad"] = 88
            }
        };
    }

    private static IEnumerable<EngineerControl> CreateEngineerControls()
    {
        yield return CreateControl("tcCut", "TC cut", 0, 12, 1, "", 4);
        yield return CreateControl("tcSlip", "TC slip", 0, 12, 1, "", 6);
        yield return CreateControl("abs", "ABS", 0, 12, 1, "", 7);
        yield return CreateControl("brakeBias", "Brake bias", 48, 64, 0.5, "%", 56.5);
        yield return CreateControl("engineMap", "Engine map", 1, 8, 1, "", 3);
        yield return CreateControl("fuelTarget", "Fuel target", 1, 6, 0.1, "L", 2.6);
    }

    private static EngineerControl CreateControl(
        string key,
        string label,
        double min,
        double max,
        double step,
        string unit,
        double value)
    {
        return new EngineerControl
        {
            Key = key,
            Label = label,
            Min = min,
            Max = max,
            Step = step,
            Unit = unit,
            CarValue = value,
            StagedValue = value
        };
    }

    private sealed class LegacyDevice
    {
        public string Name { get; set; } = "";
        public string Driver { get; set; } = "";
        public string Type { get; set; } = "screen";
        public ushort Vid { get; set; }
        public ushort Pid { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int Rotation { get; set; }
        [JsonPropertyName("offset_x")]
        public int OffsetX { get; set; }

        [JsonPropertyName("offset_y")]
        public int OffsetY { get; set; }
        public int Margin { get; set; }

        public SavedDevice ToSavedDevice(int index)
        {
            var driver = string.IsNullOrWhiteSpace(Driver) ? "unknown" : Driver;
            var serial = $"MIGRATED-{index:000}";
            return new SavedDevice
            {
                Id = $"{driver}-{Vid:x4}-{Pid:x4}-{serial}".ToLowerInvariant(),
                Name = string.IsNullOrWhiteSpace(Name) ? $"Migrated {Type}" : Name,
                Driver = driver,
                Type = string.IsNullOrWhiteSpace(Type) ? "screen" : Type,
                Vid = Vid,
                Pid = Pid,
                Serial = serial,
                Width = Width,
                Height = Height,
                Rotation = Rotation,
                OffsetX = OffsetX,
                OffsetY = OffsetY,
                Margin = Margin,
                DashId = "default"
            };
        }
    }
}
