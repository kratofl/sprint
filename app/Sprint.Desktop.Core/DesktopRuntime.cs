using System.Collections.ObjectModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
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

    public DesktopRuntime(
        string? dataRoot = null,
        string? presetRoot = null,
        string? legacyDataRoot = null,
        ILog? log = null)
    {
        this._log = log ?? NullLog.Instance;

        string resolvedDataRoot = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint");
        Directory.CreateDirectory(resolvedDataRoot);
        this._dataRoot = resolvedDataRoot;

        this._presetRoot = presetRoot ?? Path.Combine(AppContext.BaseDirectory, "presets");
        this._legacyDataRoot = legacyDataRoot ?? Path.Combine(AppContext.BaseDirectory, "data");
        this._settingsPath = Path.Combine(resolvedDataRoot, "settings.json");
        this._devicesPath = Path.Combine(resolvedDataRoot, "devices.json");
        this._controlsPath = Path.Combine(resolvedDataRoot, "controls.json");
        this._setupProgramsPath = Path.Combine(resolvedDataRoot, "setup-programs.json");
        this._layoutsPath = Path.Combine(resolvedDataRoot, "dash-layouts");
        Directory.CreateDirectory(this._layoutsPath);
        this.SetupTemplates = new ReadOnlyObservableCollection<SetupProgram>(this._setupTemplates);

        this.MigrateLegacyDataIfNeeded();

        this.Settings = this.LoadSettings();
        this.Controls = this.LoadControls();
        foreach (CatalogDevice device in this.LoadCatalog())
        {
            this.Catalog.Add(device);
        }

        foreach (SavedDevice device in this.LoadDevices())
        {
            this.Devices.Add(device);
        }

        foreach (DashLayout layout in this.LoadLayouts())
        {
            this.DashLayouts.Add(layout);
        }

        foreach (SetupProgram setup in this.LoadSetupTemplates())
        {
            this._setupTemplates.Add(setup);
            SetupProgram snapshot = Clone(setup);
            this._canonicalSetupTemplates[setup.Id] = snapshot;
            this._canonicalSetupTemplateByObject[setup] = snapshot;
        }

        foreach (SetupProgram setup in this.LoadSetupPrograms())
        {
            this.SetupPrograms.Add(setup);
        }

        this._log.Info(
            $"Desktop runtime ready: devices={this.Devices.Count} dashes={this.DashLayouts.Count} " +
            $"setups={this.SetupPrograms.Count} catalog={this.Catalog.Count}.");
    }

    public AppSettings Settings { get; }
    public string DataRoot => this._dataRoot;
    public ControlsConfig Controls { get; }
    public RenderProfile CurrentRenderProfile => new(this.Settings.DriverName, this.Settings.DriverNumber);
    public ObservableCollection<CatalogDevice> Catalog { get; } = [];
    public ObservableCollection<SavedDevice> Devices { get; } = [];
    public ObservableCollection<DashLayout> DashLayouts { get; } = [];
    public ReadOnlyObservableCollection<SetupProgram> SetupTemplates { get; }
    public ObservableCollection<SetupProgram> SetupPrograms { get; } = [];

    public event EventHandler<RenderProfile>? RenderProfileChanged;

    public void SaveSettings()
    {
        lock (this.SettingsGate)
        {
            SaveJson(this._settingsPath, this.Settings);
        }

        this._log.Debug("Settings saved.");
        RenderProfileChanged?.Invoke(this, this.CurrentRenderProfile);
    }

    public void ResetSettingsToDefaults()
    {
        lock (this.SettingsGate)
        {
            AppSettings defaults = this.LoadDefaultSettings();
            this.Settings.SidebarCollapsed = defaults.SidebarCollapsed;
            this.Settings.UpdateChannel = defaults.UpdateChannel;
            this.Settings.AutoInstallUpdates = defaults.AutoInstallUpdates;
            this.Settings.DriverName = defaults.DriverName;
            this.Settings.DriverNumber = defaults.DriverNumber;
            this.Settings.Units = defaults.Units;
            this.Settings.Colours = defaults.Colours;
            this.Settings.DashEditorUI = defaults.DashEditorUI;
            this.Settings.NewDashDefaults = defaults.NewDashDefaults;
            this.SaveSettings();
        }

        this._log.Info("Settings reset to defaults.");
    }

    public void SaveControls()
    {
        SaveJson(this._controlsPath, this.Controls);
        this._log.Debug("Control bindings saved.");
    }

    public SavedDevice AddDevice(CatalogDevice catalog)
    {
        SavedDevice saved;
        lock (this.DevicesGate)
        {
            // Only a screen transport gets a stand-in resolution (hardware detection then
            // corrects it). A screenless device — e.g. a custom wheel with buttons only —
            // must stay at 0×0, or DeviceCapabilities would treat it as a screen.
            bool isUsbd = catalog.Driver.Contains("usbd", StringComparison.OrdinalIgnoreCase);
            bool hasScreenTransport = isUsbd
                || catalog.Driver.Contains("vocore", StringComparison.OrdinalIgnoreCase)
                || string.Equals(catalog.Type, "screen", StringComparison.OrdinalIgnoreCase);
            // USBD480 NX's documented fallback size lives with its protocol, so the stand-in
            // matches what the driver falls back to when the panel does not answer.
            ScreenNativeSize fallback = isUsbd ? Usbd480Protocol.DefaultNativeSize : new ScreenNativeSize(800, 480);
            int width = catalog.Width > 0 ? catalog.Width : hasScreenTransport ? fallback.Width : 0;
            int height = catalog.Height > 0 ? catalog.Height : hasScreenTransport ? fallback.Height : 0;
            // Find the lowest index whose composite id is not already in use, so ids
            // stay unique even after devices are removed (a plain count+1 can collide
            // with a survivor and then crash reconciliation on a duplicate key).
            string prefix = catalog.Vid == 0 && catalog.Pid == 0 ? "SIM" : "USB";
            string serial, id;
            int nextIndex = 1;
            do
            {
                serial = $"{prefix}-{nextIndex:000}";
                id = $"{catalog.Driver}-{catalog.Vid:x4}-{catalog.Pid:x4}-{serial}".ToLowerInvariant();
                nextIndex++;
            }
            while (this.Devices.Any(device => device.Id.Equals(id, StringComparison.OrdinalIgnoreCase)));

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

            this.Devices.Add(saved);
            this.SaveDevices();
        }

        this._log.Info(
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
        lock (this.DevicesGate)
        {
            device.Name = string.IsNullOrWhiteSpace(name) ? device.Name : name.Trim();
            device.Orientation = orientation;
            device.OffsetX = offsetX;
            device.OffsetY = offsetY;
            device.Margin = margin;
            device.DashId = string.IsNullOrWhiteSpace(dashId) ? device.DashId : dashId.Trim();
            this.SaveDevices();
        }

        this._log.Info(
            $"Device updated: id={device.Id} rotation={device.Rotation} " +
            $"offset={device.OffsetX},{device.OffsetY} margin={device.Margin} dash={device.DashId}.");
    }

    /// <summary>
    /// Sets what a device's screen is used for (issue #53). The caller re-syncs the
    /// screen service so it can switch between assigned, built-in, and capture output.
    /// </summary>
    public void UpdateDevicePurpose(SavedDevice device, string purpose)
    {
        string normalized = DevicePurposes.Normalize(purpose);
        lock (this.DevicesGate)
        {
            if (string.Equals(device.Purpose, normalized, StringComparison.Ordinal))
            {
                return;
            }

            device.Purpose = normalized;
            this.SaveDevices();
        }

        this._log.Info($"Device purpose changed: id={device.Id} purpose={normalized}.");
    }

    public void UpdateDeviceCaptureRegion(SavedDevice device, ScreenCaptureRegion region)
    {
        ArgumentNullException.ThrowIfNull(device);
        ArgumentNullException.ThrowIfNull(region);
        if (!region.IsValid)
        {
            throw new ArgumentOutOfRangeException(nameof(region), "A capture region needs a positive size.");
        }

        lock (this.DevicesGate)
        {
            if (Equals(device.CaptureRegion, region))
            {
                return;
            }

            device.CaptureRegion = region;
            this.SaveDevices();
        }

        this._log.Info(
            $"Device capture region changed: id={device.Id} " +
            $"region={region.X},{region.Y},{region.Width}x{region.Height}.");
    }

    /// <summary>
    /// Binds <paramref name="input"/> to <paramref name="command"/> on the device. A button runs one
    /// function per device, so it leaves any function it ran before, and the function any button it
    /// had before.
    /// </summary>
    public void BindDeviceButton(SavedDevice device, string command, string input)
    {
        lock (this.DevicesGate)
        {
            device.Bindings.RemoveAll(binding =>
                string.Equals(binding.Input, input, StringComparison.OrdinalIgnoreCase)
                || string.Equals(binding.Command, command, StringComparison.Ordinal));
            device.Bindings.Add(new DeviceBinding { Input = input, Command = command });
            this.SaveDevices();
        }

        this._log.Info($"Button bound: device={device.Id} command={command} input={input}.");
    }

    public void UnbindDeviceButton(SavedDevice device, string command)
    {
        lock (this.DevicesGate)
        {
            if (device.Bindings.RemoveAll(binding => string.Equals(binding.Command, command, StringComparison.Ordinal)) > 0)
                this.SaveDevices();
        }
    }

    /// <summary>Replaces the dashes for a game, class or car on every device (<see cref="AppSettings.DashRules"/>).</summary>
    public void UpdateAllDevicesDashRules(IReadOnlyList<DeviceDashRule> rules)
    {
        lock (this.SettingsGate)
        {
            this.Settings.DashRules = [.. rules];
            SaveJson(this._settingsPath, this.Settings);
        }

        this._log.Info($"Dash rules for every device changed: rules={rules.Count}.");
    }

    public void UpdateDeviceDashRules(SavedDevice device, IReadOnlyList<DeviceDashRule> rules)
    {
        lock (this.DevicesGate)
        {
            device.DashRules = [.. rules];
            this.SaveDevices();
        }

        this._log.Info($"Device dash rules changed: id={device.Id} rules={rules.Count}.");
    }

    /// <summary>
    /// Sets the screen refresh rate (issue #75). Applies to the hardware publisher and
    /// the live preview alike, so the caller must re-sync the screen service.
    /// </summary>
    public void UpdateDeviceRefreshHz(SavedDevice device, int refreshHz)
    {
        int normalized = DeviceRefreshRates.Normalize(refreshHz);
        lock (this.DevicesGate)
        {
            if (device.RefreshHz == normalized)
            {
                return;
            }

            device.RefreshHz = normalized;
            this.SaveDevices();
        }

        this._log.Info($"Device refresh rate changed: id={device.Id} hz={normalized}.");
    }

    /// <summary>
    /// A browser display's resolution, already validated (<see cref="BrowserDisplays.SizeError"/>).
    /// The orientation follows it, so the logical size is exactly what was asked for.
    /// </summary>
    public void UpdateBrowserDisplaySize(SavedDevice device, int width, int height)
    {
        lock (this.DevicesGate)
        {
            device.Width = width;
            device.Height = height;
            device.Orientation = BrowserDisplays.OrientationFor(width, height);
            this.SaveDevices();
        }

        this._log.Info($"Browser display resized: id={device.Id} size={width}x{height}.");
    }

    public void UpdateDeviceTransparent(SavedDevice device, bool transparent)
    {
        lock (this.DevicesGate)
        {
            if (device.Transparent == transparent)
            {
                return;
            }

            device.Transparent = transparent;
            this.SaveDevices();
        }

        this._log.Info($"Device background changed: id={device.Id} transparent={transparent}.");
    }

    public void RemoveDevice(SavedDevice device)
    {
        lock (this.DevicesGate)
        {
            this.Devices.Remove(device);
            this.SaveDevices();
        }

        this._log.Info($"Device removed: id={device.Id} driver={device.Driver}.");
    }

    /// <summary>
    /// Creates a blank dash for <paramref name="profile"/>: flat, on the default tracks (<see cref="DashTracks"/>),
    /// one page with nothing but the gear, no idle page. The preset's alerts come along so alerts work out of
    /// the box. A blank <paramref name="name"/> becomes "New dash".
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
            GridCols = DashTracks.Cols,
            GridRows = DashTracks.Rows,
            ColSizes = DashTracks.DefaultCols(),
            RowSizes = DashTracks.DefaultRows(),
            Pages = [new DashPage { Id = "page-1", Name = "Page 1", Widgets = [DashTracks.DefaultGear()] }],
            Alerts = Clone(preset.Alerts),
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
    /// (matched by grid, then aspect), so nothing about their placement changes. A layout with
    /// its own track sizes says nothing about its screen (it fits any), so it takes the default.
    /// </summary>
    private static void NormalizeLayoutProfile(DashLayout layout)
    {
        if (ScreenProfileCatalog.Find(layout.ScreenProfileId) is not null)
        {
            return;
        }

        layout.ScreenProfileId = layout.HasTracks
            ? ScreenProfileCatalog.DefaultId
            : ScreenProfileCatalog.MatchGrid(layout.GridCols, layout.GridRows).Id;
    }

    /// <summary>
    /// Deletes any dash, even the last one. Devices that showed it fall back to
    /// <see cref="DashLayoutOrder.First"/>; their rules for a game, class or car that named it go.
    /// </summary>
    public void DeleteDashLayout(DashLayout layout)
    {
        this.DashLayouts.Remove(layout);
        lock (this.DevicesGate)
        {
            bool changed = false;
            foreach (SavedDevice device in this.Devices)
            {
                if (device.DashRules.Any(rule => string.Equals(rule.DashId, layout.Id, StringComparison.OrdinalIgnoreCase)))
                {
                    device.DashRules = device.DashRules.Where(rule => !string.Equals(rule.DashId, layout.Id, StringComparison.OrdinalIgnoreCase)).ToList();
                    changed = true;
                }
            }

            if (changed)
            {
                this.SaveDevices();
            }
        }

        lock (this.SettingsGate)
        {
            if (this.Settings.DashRules.Any(rule => string.Equals(rule.DashId, layout.Id, StringComparison.OrdinalIgnoreCase)))
            {
                this.Settings.DashRules = this.Settings.DashRules.Where(rule => !string.Equals(rule.DashId, layout.Id, StringComparison.OrdinalIgnoreCase)).ToList();
                SaveJson(this._settingsPath, this.Settings);
            }
        }

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

    // Modes, like categories, are replaced, never changed in place.

    /// <summary>Adds one of the driver's dash modes; its id and name are already validated (<see cref="DashPageModes"/>).</summary>
    public void CreateDashMode(DashMode mode)
    {
        lock (this.SettingsGate)
        {
            this.Settings.DashModes = [.. this.Settings.DashModes, mode];
            SaveJson(this._settingsPath, this.Settings);
        }

        this._log.Info($"Dash mode created: {mode.Name}.");
    }

    /// <summary>Renames a dash mode; <paramref name="name"/> is already validated. Pages and dials refer to it by id, so nothing else moves.</summary>
    public void RenameDashMode(string id, string name)
    {
        lock (this.SettingsGate)
        {
            this.Settings.DashModes = this.Settings.DashModes.Select(mode => mode.Id == id ? mode with { Name = name } : mode).ToList();
            SaveJson(this._settingsPath, this.Settings);
        }

        this._log.Info($"Dash mode renamed: {id} -> {name}.");
    }

    /// <summary>
    /// Deletes a dash mode: pages that showed in it drop it (a page left with nothing picked shows
    /// in every session again), and dial positions that switched it on switch nothing on.
    /// </summary>
    public void DeleteDashMode(string id)
    {
        List<DashMode> modes;
        lock (this.SettingsGate)
        {
            modes = this.Settings.DashModes.Where(mode => mode.Id != id).ToList();
            this.Settings.DashModes = modes;
            SaveJson(this._settingsPath, this.Settings);
        }

        foreach (DashLayout layout in this.DashLayouts.ToList())
        {
            if (DashPageModes.ForgetUnknownPicks(layout, modes))
            {
                this.SaveDashLayout(layout);
            }
        }

        lock (this.DevicesGate)
        {
            bool changed = false;
            foreach (SavedDevice device in this.Devices)
            {
                if (device.MultiDial is { } dial && dial.Modes.Contains(id))
                {
                    device.MultiDial = dial with { Modes = dial.Modes.Select(mode => mode == id ? null : mode).ToList() };
                    changed = true;
                }
            }

            if (changed)
            {
                this.SaveDevices();
            }
        }

        this._log.Info($"Dash mode deleted: {id}.");
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
        SetupProgram sourceSnapshot = this.TemplateSnapshotFor(source) ?? source;
        SetupProgram copy = Clone(sourceSnapshot);
        copy.Id = this.NextSetupId();
        copy.Name = this.NextSetupCopyName(sourceSnapshot.Name);
        copy.IsTemplate = false;
        copy.Values = new Dictionary<string, double>(sourceSnapshot.Values, StringComparer.OrdinalIgnoreCase);

        this.SetupPrograms.Add(copy);
        this.SaveSetupPrograms();
        this._log.Info($"Setup duplicated: source={source.Id} copy={copy.Id}.");
        return copy;
    }

    public void SaveSetupPrograms()
    {
        SaveJson(this._setupProgramsPath, this.SetupPrograms.Where(program => !program.IsTemplate).ToList());
        this._log.Debug($"Setup programs saved: count={this.SetupPrograms.Count}.");
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
        int decimals = parameter.Step < 1 ? 1 : 0;
        string formatted = value.ToString(decimals == 0 ? "0" : "0.0");
        return string.IsNullOrWhiteSpace(parameter.Unit) ? formatted : $"{formatted} {parameter.Unit}";
    }

    private AppSettings LoadSettings()
    {
        AppSettings fallback = this.LoadDefaultSettings();
        AppSettings settings = this.LoadJson<AppSettings>(this._settingsPath, setAsideWhenUnreadable: true) ?? fallback;
        if (settings.Version > AppSettings.CurrentVersion)
        {
            // After a rollback. The settings this build knows still read; the rest is kept as is.
            this._log.Warn(
                $"settings.json was written by a newer Sprint (version {settings.Version}, " +
                $"this build knows {AppSettings.CurrentVersion}); unknown settings are kept untouched.");
        }

        // Saved in this build's shape from now on, so a newer build migrates what this one wrote.
        settings.Version = AppSettings.CurrentVersion;
        // Fold legacy three-channel values (beta/alpha) into the two-channel model.
        settings.UpdateChannel = AppSettings.NormalizeChannel(settings.UpdateChannel);
        settings.CustomDashCategories = NormalizeCustomDashCategories(settings.CustomDashCategories);
        settings.DashRules = DeviceDashRules.Clean(settings.DashRules);
        // Hand-edited limits out of range or order would colour every value wrong; the defaults stand in.
        settings.Colours = (settings.Colours ?? new ColourSettings()).Clean();
        // A hand-edited reserve outside what planner.settings accepts would make every plan seeded
        // from it (Quick plan sends it as is) fail plan.create's check.
        settings.SessionPlanner.FuelReserveLaps = Math.Clamp(settings.SessionPlanner.FuelReserveLaps, 0, SessionPlannerSettings.MaxFuelReserveLaps);
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
        this.LoadJson<AppSettings>(this.PresetPath("settings", "default.json")) ?? new AppSettings();

    private IEnumerable<CatalogDevice> LoadCatalog()
    {
        string dir = this.PresetPath("devices");
        if (Directory.Exists(dir))
        {
            foreach (string? file in Directory.EnumerateFiles(dir, "*.json").OrderBy(Path.GetFileName))
            {
                CatalogDevice? entry = this.LoadJson<CatalogDevice>(file);
                if (entry is not null)
                {
                    yield return entry;
                }
            }
        }

        if (this.Catalog.Count == 0)
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
        List<SavedDevice> devices = this.LoadJson<List<SavedDevice>>(this._devicesPath, setAsideWhenUnreadable: true) ?? [];
        foreach (SavedDevice device in devices)
        {
            // Devices saved before purposes existed (and any unknown value) resolve to
            // dash, so an older devices.json keeps driving its screens.
            device.Purpose = DevicePurposes.Normalize(device.Purpose);
            device.RefreshHz = DeviceRefreshRates.Normalize(device.RefreshHz);
            // A hand-edited file may hold a null list or a rule missing a field; matching assumes neither.
            device.DashRules = DeviceDashRules.Clean(device.DashRules);
        }

        return devices;
    }

    private ControlsConfig LoadControls()
    {
        return this.LoadJson<ControlsConfig>(this._controlsPath, setAsideWhenUnreadable: true) ?? new ControlsConfig();
    }

    private IEnumerable<SetupProgram> LoadSetupTemplates()
    {
        string dir = this.PresetPath("setups");
        if (Directory.Exists(dir))
        {
            foreach (string? file in Directory.EnumerateFiles(dir, "*.json").OrderBy(Path.GetFileName))
            {
                SetupProgram? entry = this.LoadJson<SetupProgram>(file);
                if (NormalizeSetupProgram(entry, isTemplate: true) is { } template)
                {
                    yield return template;
                }
            }
        }

        if (this._setupTemplates.Count == 0)
        {
            foreach (SetupProgram template in CreateSetupTemplates())
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
        List<SetupProgram> programs = this.LoadJson<List<SetupProgram>>(this._setupProgramsPath, setAsideWhenUnreadable: true) ?? [];
        foreach (SetupProgram program in programs)
        {
            if (NormalizeSetupProgram(program, isTemplate: false) is { } normalized)
            {
                yield return normalized;
            }
        }
    }

    private IEnumerable<DashLayout> LoadLayouts()
    {
        List<DashLayout> layouts = new List<DashLayout>();
        if (Directory.Exists(this._layoutsPath))
        {
            foreach (string file in Directory.EnumerateFiles(this._layoutsPath, "*.json"))
            {
                DashLayout? layout = this.LoadJson<DashLayout>(file);
                if (layout is null)
                {
                    continue;
                }

                // Turn old widget stacks into groups, rewrite renamed widget types and move zoned
                // dashes onto track sizes before validation, which would otherwise reject the layout;
                // every dash wears the one flat look. Its variants' pages get the same, or validating
                // them would reject the whole dash.
                bool contentMigrated = DashWidgetStackMigration.Apply(layout) | DashWidgetTypeMigration.Apply(layout) | DashTracks.MigrateZoned(layout) | DashLooks.Flatten(layout);
                contentMigrated |= DashVariants.Update(layout, shown => DashWidgetStackMigration.Apply(shown) | DashWidgetTypeMigration.Apply(shown) | DashLooks.Flatten(shown));
                if (DashLayoutValidator.IsValid(layout))
                {
                    bool migrated = contentMigrated;
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

        // Each shipped preset dash is seeded once (first run, or the first run after the preset
        // ships), its id listed in a file beside the dashes; an empty file is from when "default"
        // was the only preset. After that a deleted preset is the user's choice and stays deleted.
        // The default comes only into an empty list, as it always did; the others whenever their
        // id is free.
        string seededMarker = Path.Combine(this._layoutsPath, ".preset-seeded");
        HashSet<string> seeded = File.Exists(seededMarker)
            ? File.ReadAllLines(seededMarker).Select(line => line.Trim()).Where(line => line.Length > 0).DefaultIfEmpty(DefaultPresetId).ToHashSet(StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);
        bool seededAny = !File.Exists(seededMarker);
        foreach (DashLayout preset in this.LoadPresetDashLayouts())
        {
            if (!seeded.Add(preset.Id))
            {
                continue;
            }

            seededAny = true;
            bool free = preset.Id == DefaultPresetId ? layouts.Count == 0 : layouts.All(layout => layout.Id != preset.Id);
            if (free)
            {
                NormalizeLayoutProfile(preset);
                this.SaveDashLayout(preset);
                layouts.Add(preset);
            }
        }

        if (seededAny)
        {
            Directory.CreateDirectory(this._layoutsPath);
            File.WriteAllLines(seededMarker, seeded.Order(StringComparer.Ordinal));
        }

        // Tag any layout missing a target screen profile (legacy saves) with the
        // best-fit catalog profile so the dash↔screen model is always populated.
        foreach (DashLayout layout in layouts)
        {
            NormalizeLayoutProfile(layout);
        }

        return DashLayoutOrder.Sort(layouts);
    }

    private void MigrateLegacyDataIfNeeded()
    {
        if (string.IsNullOrWhiteSpace(this._legacyDataRoot) || !Directory.Exists(this._legacyDataRoot))
        {
            return;
        }

        this.MigrateLegacySettingsIfNeeded();
        this.MigrateLegacyDevicesIfNeeded();
        this.MigrateLegacyLayoutsIfNeeded();
    }

    private void MigrateLegacySettingsIfNeeded()
    {
        if (File.Exists(this._settingsPath))
        {
            return;
        }

        string legacySettingsPath = Path.Combine(this._legacyDataRoot!, "settings.json");
        AppSettings? settings = this.LoadJson<AppSettings>(legacySettingsPath);
        if (settings is not null)
        {
            SaveJson(this._settingsPath, settings);
        }
    }

    private void MigrateLegacyDevicesIfNeeded()
    {
        if (File.Exists(this._devicesPath))
        {
            return;
        }

        string legacyDevicesDir = Path.Combine(this._legacyDataRoot!, "devices");
        if (!Directory.Exists(legacyDevicesDir))
        {
            return;
        }

        List<SavedDevice> saved = new List<SavedDevice>();
        foreach (string? fileName in new[] { "wheels.json", "screens.json", "buttonboxes.json" })
        {
            string path = Path.Combine(legacyDevicesDir, fileName);
            List<LegacyDevice>? entries = this.LoadJson<List<LegacyDevice>>(path);
            if (entries is null)
            {
                continue;
            }

            foreach (LegacyDevice entry in entries)
            {
                saved.Add(entry.ToSavedDevice(saved.Count + 1));
            }
        }

        if (saved.Count > 0)
        {
            SaveJson(this._devicesPath, saved);
        }
    }

    private void MigrateLegacyLayoutsIfNeeded()
    {
        if (Directory.EnumerateFiles(this._layoutsPath, "*.json").Any())
        {
            return;
        }

        string legacyLayoutsDir = Path.Combine(this._legacyDataRoot!, "layouts");
        if (!Directory.Exists(legacyLayoutsDir))
        {
            return;
        }

        foreach (string layoutDir in Directory.EnumerateDirectories(legacyLayoutsDir))
        {
            string legacyConfig = Path.Combine(layoutDir, "config.json");
            DashLayout? layout = this.LoadJson<DashLayout>(legacyConfig);
            if (layout is null)
            {
                continue;
            }

            DashWidgetStackMigration.Apply(layout);
            DashWidgetTypeMigration.Apply(layout);
            DashTracks.MigrateZoned(layout);
            DashLooks.Flatten(layout);
            if (!DashLayoutValidator.IsValid(layout))
            {
                continue;
            }

            this.SaveDashLayout(layout);
        }
    }

    public void SaveDevices()
    {
        lock (this.DevicesGate)
        {
            SaveJson(this._devicesPath, this.Devices.ToList());
        }

        this._log.Debug($"Devices saved: count={this.Devices.Count}.");
    }

    public void SaveDashLayout(DashLayout layout)
    {
        if (!DashLayoutValidator.IsValid(layout))
        {
            throw new InvalidOperationException($"Dash layout '{layout.Id}' is invalid and cannot be saved.");
        }

        layout.Theme?.NormalizeProtectedColors();
        DashLooks.Flatten(layout);
        SaveJson(Path.Combine(this._layoutsPath, $"{layout.Id}.json"), layout);
        this._log.Debug($"Dash saved: id={layout.Id} pages={layout.Pages.Count}.");
    }

    /// <summary>
    /// Puts the preset's pages, alerts and look back into a dash, dropping its variants. It keeps its
    /// id, name, category and screen size: the preset is refitted to the dash's own screen profile.
    /// </summary>
    public void ResetDashLayout(DashLayout layout)
    {
        // A shipped preset (Hypercar) goes back to itself; every other dash to the default.
        DashLayout preset = this.LoadPresetDashLayouts().FirstOrDefault(candidate => candidate.Id == layout.Id) ?? this.LoadPresetDashLayout();
        string id = layout.Id;
        string name = layout.Name;
        string? category = layout.Category;
        ScreenProfile profile = ScreenProfileCatalog.Resolve(layout.ScreenProfileId);

        layout.GridCols = preset.GridCols;
        layout.GridRows = preset.GridRows;
        layout.ColSizes = preset.ColSizes is null ? null : [.. preset.ColSizes];
        layout.RowSizes = preset.RowSizes is null ? null : [.. preset.RowSizes];
        layout.Mode = preset.Mode;
        layout.IdlePage = Clone(preset.IdlePage);
        layout.Pages = Clone(preset.Pages);
        layout.Alerts = Clone(preset.Alerts);
        layout.Theme = Clone(preset.Theme);
        layout.ExtensionData = preset.ExtensionData is null ? null : Clone(preset.ExtensionData);
        layout.Variants = null;
        layout.Id = id;
        layout.Name = name;
        layout.Category = category;
        DashLayoutEditor.ApplyScreenProfile(layout, profile);

        this.SaveDashLayout(layout);
        this._log.Info($"Dash reset to preset content: id={layout.Id}.");
    }

    private static string NormalizeDashMode(string? mode) =>
        string.Equals(mode, "advanced", StringComparison.OrdinalIgnoreCase) ? "advanced" : "basic";

    private string NextSetupId()
    {
        string stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff");
        int index = 1;
        string id;
        do
        {
            id = $"setup-{stamp}-{index:00}";
            index++;
        }
        while (this.SetupPrograms.Any(program => program.Id.Equals(id, StringComparison.OrdinalIgnoreCase)));

        return id;
    }

    private SetupProgram? TemplateSnapshotFor(SetupProgram source)
    {
        if (this._canonicalSetupTemplateByObject.TryGetValue(source, out SetupProgram? objectTemplate))
        {
            return objectTemplate;
        }

        if (source.IsTemplate && this._canonicalSetupTemplates.TryGetValue(source.Id, out SetupProgram? template))
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
        string baseName = $"{sourceName} copy";
        if (this.SetupPrograms.All(program => !program.Name.Equals(baseName, StringComparison.OrdinalIgnoreCase)))
        {
            return baseName;
        }

        int index = 2;
        string name;
        do
        {
            name = $"{baseName} {index}";
            index++;
        }
        while (this.SetupPrograms.Any(program => program.Name.Equals(name, StringComparison.OrdinalIgnoreCase)));

        return name;
    }

    private static T Clone<T>(T value)
    {
        string json = JsonSerializer.Serialize(value, JsonOptions);
        return JsonSerializer.Deserialize<T>(json, JsonOptions)!;
    }

    /// <summary>
    /// Reads a JSON file, or default when it is missing or unreadable. A store that keeps all its
    /// records in one file passes <paramref name="setAsideWhenUnreadable"/>: it saves over that
    /// file later, which would erase what it could not read (maybe a newer Sprint's file).
    /// </summary>
    private T? LoadJson<T>(string path, bool setAsideWhenUnreadable = false)
    {
        if (!File.Exists(path))
        {
            this._log.Debug(
                $"Configuration file not found; defaults will be used: " +
                $"file={Path.GetFileName(path)} type={typeof(T).Name}.");
            return default;
        }

        try
        {
            T? value;
            using (FileStream stream = File.OpenRead(path))
            {
                value = JsonSerializer.Deserialize<T>(stream, JsonOptions);
            }

            this._log.Debug($"Configuration loaded: file={Path.GetFileName(path)} type={typeof(T).Name}.");
            return value;
        }
        catch (JsonException ex)
        {
            // A corrupt file falls back to defaults rather than crashing, but that
            // silent reset used to be invisible — record it so it can be diagnosed.
            string? keptAt = setAsideWhenUnreadable ? AtomicFile.SetAside(path) : null;
            this._log.Warn(
                $"Ignoring unreadable JSON at {path}; falling back to default" +
                (keptAt is null ? "" : $"; the file is kept at {keptAt}"), ex);
            return default;
        }
    }

    private static void SaveJson<T>(string path, T value)
    {
        AtomicFile.Write(path, stream => JsonSerializer.Serialize(stream, value, JsonOptions));
    }

    private string PresetPath(params string[] segments)
    {
        return Path.Combine([this._presetRoot, .. segments]);
    }

    private const string DefaultPresetId = "default";

    /// <summary>The shipped preset dash (id "default"), or a minimal built-in one when the preset is missing.</summary>
    private DashLayout LoadPresetDashLayout() =>
        this.LoadJson<DashLayout>(this.PresetPath("dash", "default.json")) ?? CreateFallbackDashLayout();

    /// <summary>
    /// Every shipped preset dash (presets/dash/*.json), the default first, then by id; the default
    /// is the built-in one when its file is missing. A file that does not read or validate is skipped.
    /// </summary>
    private List<DashLayout> LoadPresetDashLayouts()
    {
        List<DashLayout> presets = [this.LoadPresetDashLayout()];
        string folder = this.PresetPath("dash");
        if (!Directory.Exists(folder))
        {
            return presets;
        }

        foreach (string file in Directory.EnumerateFiles(folder, "*.json").Order(StringComparer.OrdinalIgnoreCase))
        {
            if (Path.GetFileName(file).Equals("default.json", StringComparison.OrdinalIgnoreCase) || this.LoadJson<DashLayout>(file) is not { } preset)
            {
                continue;
            }

            if (!DashLayoutValidator.IsValid(preset) || presets.Any(known => known.Id == preset.Id))
            {
                this._log.Warn($"Preset dash skipped: file={Path.GetFileName(file)} is not a valid dash or repeats an id.");
                continue;
            }

            presets.Add(preset);
        }

        return presets;
    }

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
                        new DashWidget { Id = "gear", Type = "gear_speed", Col = 1, Row = 1, ColSpan = 7, RowSpan = 5 },
                        new DashWidget { Id = "lap", Type = "current_lap", Col = 9, Row = 1, ColSpan = 11, RowSpan = 3 },
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
            string driver = string.IsNullOrWhiteSpace(this.Driver) ? "unknown" : this.Driver;
            string serial = $"MIGRATED-{index:000}";
            return new SavedDevice
            {
                Id = $"{driver}-{this.Vid:x4}-{this.Pid:x4}-{serial}".ToLowerInvariant(),
                Name = string.IsNullOrWhiteSpace(this.Name) ? $"Migrated {this.Type}" : this.Name,
                Driver = driver,
                Type = string.IsNullOrWhiteSpace(this.Type) ? "screen" : this.Type,
                Vid = this.Vid,
                Pid = this.Pid,
                Serial = serial,
                Width = this.Width,
                Height = this.Height,
                Rotation = this.Rotation,
                OffsetX = this.OffsetX,
                OffsetY = this.OffsetY,
                Margin = this.Margin,
                DashId = "default"
            };
        }
    }
}
