using System.Collections.ObjectModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Engineer;
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
    private readonly string _presetRoot;
    private readonly string? _legacyDataRoot;
    private readonly ILog _log;
    private readonly ObservableCollection<SetupProgram> _setupTemplates = [];
    private readonly Dictionary<string, SetupProgram> _canonicalSetupTemplates = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<SetupProgram, SetupProgram> _canonicalSetupTemplateByObject = new(ReferenceEqualityComparer.Instance);
    private IReadOnlyList<Sprint.Desktop.Api.Engineer.StagedControlChange> _pendingEngineerChanges = [];

    public DesktopRuntime(string? dataRoot = null, string? presetRoot = null, string? legacyDataRoot = null, ILog? log = null)
    {
        _log = log ?? NullLog.Instance;

        var resolvedDataRoot = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint");
        Directory.CreateDirectory(resolvedDataRoot);

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
        SaveJson(_settingsPath, Settings);
        _log.Debug("Settings saved.");
        RenderProfileChanged?.Invoke(this, CurrentRenderProfile);
    }

    public void ResetSettingsToDefaults()
    {
        var defaults = LoadDefaultSettings();
        Settings.SidebarCollapsed = defaults.SidebarCollapsed;
        Settings.UpdateChannel = defaults.UpdateChannel;
        Settings.DriverName = defaults.DriverName;
        Settings.DriverNumber = defaults.DriverNumber;
        Settings.DashEditorUI = defaults.DashEditorUI;
        Settings.NewDashDefaults = defaults.NewDashDefaults;
        SaveSettings();
        _log.Info("Settings reset to defaults.");
    }

    public void SaveControls()
    {
        SaveJson(_controlsPath, Controls);
        _log.Debug("Control bindings saved.");
    }

    public SavedDevice AddDevice(CatalogDevice catalog)
    {
        // Only a screen transport gets a stand-in resolution (hardware detection then
        // corrects it). A screenless device — e.g. a custom wheel with buttons only —
        // must stay at 0×0, or DeviceCapabilities would treat it as a screen.
        var isUsbd = catalog.Driver.Contains("usbd", StringComparison.OrdinalIgnoreCase);
        var hasScreenTransport = isUsbd
            || catalog.Driver.Contains("vocore", StringComparison.OrdinalIgnoreCase)
            || string.Equals(catalog.Type, "screen", StringComparison.OrdinalIgnoreCase);
        var width = catalog.Width > 0 ? catalog.Width : hasScreenTransport ? isUsbd ? 480 : 800 : 0;
        var height = catalog.Height > 0 ? catalog.Height : hasScreenTransport ? isUsbd ? 272 : 480 : 0;
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

        var saved = new SavedDevice
        {
            Id = id,
            Name = catalog.Name,
            Driver = catalog.Driver,
            Type = catalog.Type,
            Vid = catalog.Vid,
            Pid = catalog.Pid,
            Serial = serial,
            Width = width,
            Height = height,
            Rotation = catalog.Rotation,
            OffsetX = catalog.OffsetX,
            OffsetY = catalog.OffsetY,
            Margin = catalog.Margin,
            Bindings = Clone(catalog.Bindings),
            DashId = DashLayouts.FirstOrDefault(d => d.IsDefault)?.Id ?? "default"
        };

        Devices.Add(saved);
        SaveDevices();
        _log.Info(
            $"Device added: id={saved.Id} driver={saved.Driver} type={saved.Type} " +
            $"vid=0x{saved.Vid:X4} pid=0x{saved.Pid:X4}.");
        return saved;
    }

    public void UpdateDevice(SavedDevice device, string name, int rotation, int offsetX, int offsetY, int margin, string dashId)
    {
        device.Name = string.IsNullOrWhiteSpace(name) ? device.Name : name.Trim();
        device.Rotation = rotation;
        device.OffsetX = offsetX;
        device.OffsetY = offsetY;
        device.Margin = margin;
        device.DashId = string.IsNullOrWhiteSpace(dashId) ? device.DashId : dashId.Trim();
        SaveDevices();
        _log.Info(
            $"Device updated: id={device.Id} rotation={device.Rotation} " +
            $"offset={device.OffsetX},{device.OffsetY} margin={device.Margin} dash={device.DashId}.");
    }

    /// <summary>
    /// Sets what a device's screen is used for (issue #53). Only the dash purpose
    /// receives dash frames, so the caller must re-sync the screen service afterwards.
    /// </summary>
    public void UpdateDevicePurpose(SavedDevice device, string purpose)
    {
        var normalized = DevicePurposes.Normalize(purpose);
        if (string.Equals(device.Purpose, normalized, StringComparison.Ordinal))
        {
            return;
        }

        device.Purpose = normalized;
        SaveDevices();
        _log.Info($"Device purpose changed: id={device.Id} purpose={normalized}.");
    }

    /// <summary>
    /// Sets the screen refresh rate (issue #75). Applies to the hardware publisher and
    /// the live preview alike, so the caller must re-sync the screen service.
    /// </summary>
    public void UpdateDeviceRefreshHz(SavedDevice device, int refreshHz)
    {
        var normalized = DeviceRefreshRates.Normalize(refreshHz);
        if (device.RefreshHz == normalized)
        {
            return;
        }

        device.RefreshHz = normalized;
        SaveDevices();
        _log.Info($"Device refresh rate changed: id={device.Id} hz={normalized}.");
    }

    public void RemoveDevice(SavedDevice device)
    {
        Devices.Remove(device);
        SaveDevices();
        _log.Info($"Device removed: id={device.Id} driver={device.Driver}.");
    }

    public DashLayout CreateDashLayout()
    {
        var source = DashLayouts.FirstOrDefault() ?? CreateFallbackDashLayout();
        var clone = Clone(source);
        clone.Id = $"layout-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
        clone.Name = "New Dash";
        clone.IsDefault = false;
        clone.Mode = NormalizeDashMode(Settings.NewDashDefaults.Mode);
        clone.ColorSystem = DashColorSystem.Functional;
        clone.Theme = null;
        NormalizeLayoutProfile(clone);
        DashLayouts.Add(clone);
        SaveDashLayout(clone);
        _log.Info($"Dash created: id={clone.Id} profile={clone.ScreenProfileId}.");
        return clone;
    }

    public DashLayout CreateDashLayout(ScreenProfile profile)
    {
        ArgumentNullException.ThrowIfNull(profile);
        var source = DashLayouts.FirstOrDefault() ?? CreateFallbackDashLayout();
        var clone = Clone(source);
        clone.Id = $"layout-{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}";
        clone.Name = "New Dash";
        clone.IsDefault = false;
        clone.Mode = NormalizeDashMode(Settings.NewDashDefaults.Mode);
        clone.ColorSystem = DashColorSystem.Functional;
        clone.Theme = null;
        DashLayoutEditor.ApplyScreenProfile(clone, profile);
        DashLayouts.Add(clone);
        SaveDashLayout(clone);
        _log.Info($"Dash created: id={clone.Id} profile={profile.Id}.");
        return clone;
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
        SaveDashLayout(layout);
        _log.Info($"Dash screen profile changed: id={layout.Id} profile={profile.Id}.");
    }

    /// <summary>
    /// Duplicate a dash and retarget the copy to another screen size (US18): an
    /// independent, retargeted-and-refit layout with its own id, leaving the source
    /// untouched.
    /// </summary>
    public DashLayout DuplicateDashToProfile(DashLayout source, ScreenProfile profile)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(profile);

        var clone = Clone(source);
        clone.Id = $"layout-{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}";
        clone.Name = $"{source.Name} · {profile.ResolutionLabel}";
        clone.IsDefault = false;
        DashLayoutEditor.ApplyScreenProfile(clone, profile);
        DashLayouts.Add(clone);
        SaveDashLayout(clone);
        _log.Info($"Dash duplicated: source={source.Id} copy={clone.Id} profile={profile.Id}.");
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

    /// <summary>Make <paramref name="layout"/> the sole default, persisting the demoted one too.</summary>
    public void SetDefaultDashLayout(DashLayout layout)
    {
        if (layout.IsDefault)
        {
            return;
        }

        foreach (var other in DashLayouts)
        {
            if (other.IsDefault && !ReferenceEquals(other, layout))
            {
                other.IsDefault = false;
                SaveDashLayout(other);
            }
        }

        layout.IsDefault = true;
        SaveDashLayout(layout);
        _log.Info($"Default dash changed: id={layout.Id}.");
    }

    public void DeleteDashLayout(DashLayout layout)
    {
        if (DashLayouts.Count <= 1 || layout.IsDefault)
        {
            _log.Warn($"Dash delete ignored: id={layout.Id} isDefault={layout.IsDefault} count={DashLayouts.Count}.");
            return;
        }

        DashLayouts.Remove(layout);
        var path = Path.Combine(_layoutsPath, $"{layout.Id}.json");
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        var thumbnailPath = GetDashThumbnailPath(layout);
        if (File.Exists(thumbnailPath))
        {
            File.Delete(thumbnailPath);
        }

        _log.Info($"Dash deleted: id={layout.Id}.");
    }

    public string GetDashThumbnailPath(DashLayout layout)
    {
        return Path.Combine(_layoutsPath, $"{layout.Id}.png");
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
        return settings;
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
                Name = "Generic VoCore Screen",
                Description = "Any VoCore display",
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

                // Rewrite renamed widget types before validation, which would otherwise
                // reject the whole layout for an unknown (legacy) type.
                var typesMigrated = DashWidgetTypeMigration.Apply(layout);
                if (DashLayoutValidator.IsValid(layout))
                {
                    var migrated = typesMigrated;
                    if (layout.ColorSystem is null)
                    {
                        NormalizeLayoutColorSystem(layout);
                        migrated = true;
                    }
                    migrated |= layout.Theme?.NormalizeProtectedColors() == true;
                    if (migrated)
                    {
                        SaveJson(file, layout);
                    }
                    layouts.Add(layout);
                }
            }
        }

        if (layouts.Count == 0)
        {
            layouts.Add(LoadJson<DashLayout>(PresetPath("dash", "default.json")) ?? CreateFallbackDashLayout());
        }

        // Tag any layout missing a target screen profile (legacy saves) with the
        // best-fit catalog profile so the dash↔screen model is always populated.
        foreach (var layout in layouts)
        {
            NormalizeLayoutProfile(layout);
            NormalizeLayoutColorSystem(layout);
        }

        return layouts.OrderByDescending(layout => layout.IsDefault).ThenBy(layout => layout.Name);
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
            var layout = LoadJson<DashLayout>(legacyConfig);
            if (layout is null || !DashLayoutValidator.IsValid(layout))
            {
                continue;
            }

            SaveDashLayout(layout);
        }
    }

    public void SaveDevices()
    {
        SaveJson(_devicesPath, Devices.ToList());
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
        GenerateDashThumbnail(layout);
        _log.Debug($"Dash saved: id={layout.Id} pages={layout.Pages.Count}.");
    }

    public void ResetDashLayout(DashLayout layout)
    {
        var preset = LoadJson<DashLayout>(PresetPath("dash", "default.json")) ?? CreateFallbackDashLayout();
        var id = layout.Id;
        var name = layout.Name;
        var isDefault = layout.IsDefault;

        layout.GridCols = preset.GridCols;
        layout.GridRows = preset.GridRows;
        layout.Mode = preset.Mode;
        layout.ColorSystem = preset.EffectiveColorSystem;
        layout.IdlePage = Clone(preset.IdlePage);
        layout.Pages = Clone(preset.Pages);
        layout.Alerts = Clone(preset.Alerts);
        layout.AlertConfig = Clone(preset.AlertConfig);
        layout.Theme = Clone(preset.Theme);
        layout.ExtensionData = preset.ExtensionData is null ? null : Clone(preset.ExtensionData);
        layout.Id = id;
        layout.Name = name;
        layout.IsDefault = isDefault;

        SaveDashLayout(layout);
        _log.Info($"Dash reset to preset content: id={layout.Id}.");
    }

    private static void NormalizeLayoutColorSystem(DashLayout layout) =>
        layout.ColorSystem ??= layout.EffectiveColorSystem;

    private static string NormalizeDashMode(string? mode) =>
        string.Equals(mode, "advanced", StringComparison.OrdinalIgnoreCase) ? "advanced" : "basic";

    private void GenerateDashThumbnail(DashLayout layout)
    {
        const int width = 320;
        const int height = 192;

        try
        {
            // Render the real dash (empty frame → deterministic placeholder values)
            // so the thumbnail matches what the wheel display shows, not a box mock.
            using var painter = new DashPainter(width, height, DashPalette.FromLayout(layout));
            var png = painter.RenderPng(layout, new TelemetryFrame(), Settings);
            var path = GetDashThumbnailPath(layout);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllBytes(path, png);
        }
        catch (Exception ex)
        {
            // Thumbnail generation is a best-effort side artifact; never fail a
            // layout save because a preview image could not be produced.
            _log.Warn($"Dash thumbnail generation failed for layout '{layout.Id}'", ex);
        }
    }

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
        var json = JsonSerializer.Serialize(value, JsonOptions);
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
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var stream = File.Create(path);
        JsonSerializer.Serialize(stream, value, JsonOptions);
    }

    private string PresetPath(params string[] segments)
    {
        return Path.Combine([_presetRoot, .. segments]);
    }

    private static DashLayout CreateFallbackDashLayout()
    {
        return new DashLayout
        {
            Id = "default",
            Name = "Default",
            IsDefault = true,
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
