using System.Collections.ObjectModel;
using System.Text.Json;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Engineer;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop;

public sealed class DesktopRuntime
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    private readonly string _settingsPath;
    private readonly string _devicesPath;
    private readonly string _layoutsPath;
    private readonly string _presetRoot;

    public DesktopRuntime(string? dataRoot = null, string? presetRoot = null)
    {
        var resolvedDataRoot = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint");
        Directory.CreateDirectory(resolvedDataRoot);

        _presetRoot = presetRoot ?? Path.Combine(AppContext.BaseDirectory, "presets");
        _settingsPath = Path.Combine(resolvedDataRoot, "settings.json");
        _devicesPath = Path.Combine(resolvedDataRoot, "devices.json");
        _layoutsPath = Path.Combine(resolvedDataRoot, "dash-layouts");
        Directory.CreateDirectory(_layoutsPath);

        Settings = LoadSettings();
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

        foreach (var setup in CreateSetupPrograms())
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
    }

    public AppSettings Settings { get; }
    public ObservableCollection<CatalogDevice> Catalog { get; } = [];
    public ObservableCollection<SavedDevice> Devices { get; } = [];
    public ObservableCollection<DashLayout> DashLayouts { get; } = [];
    public ObservableCollection<SetupProgram> SetupPrograms { get; } = [];
    public ObservableCollection<EngineerControl> EngineerControls { get; } = [];
    public ObservableCollection<RadioLogEntry> RadioLog { get; } = [];

    public void SaveSettings()
    {
        SaveJson(_settingsPath, Settings);
    }

    public SavedDevice AddDevice(CatalogDevice catalog)
    {
        var width = catalog.Width > 0 ? catalog.Width : catalog.Driver.Contains("usbd", StringComparison.OrdinalIgnoreCase) ? 480 : 800;
        var height = catalog.Height > 0 ? catalog.Height : catalog.Driver.Contains("usbd", StringComparison.OrdinalIgnoreCase) ? 272 : 480;
        var serial = catalog.Vid == 0 && catalog.Pid == 0 ? $"SIM-{Devices.Count + 1:000}" : "USB-001";
        var id = $"{catalog.Driver}-{serial}".ToLowerInvariant();

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
            DashId = DashLayouts.FirstOrDefault(d => d.IsDefault)?.Id ?? "default"
        };

        Devices.Add(saved);
        SaveDevices();
        return saved;
    }

    public void RemoveDevice(SavedDevice device)
    {
        Devices.Remove(device);
        SaveDevices();
    }

    public DashLayout CreateDashLayout()
    {
        var source = DashLayouts.FirstOrDefault() ?? CreateFallbackDashLayout();
        var clone = Clone(source);
        clone.Id = $"layout-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
        clone.Name = "New Dash";
        clone.IsDefault = false;
        DashLayouts.Add(clone);
        SaveDashLayout(clone);
        return clone;
    }

    public void DeleteDashLayout(DashLayout layout)
    {
        if (DashLayouts.Count <= 1 || layout.IsDefault)
        {
            return;
        }

        DashLayouts.Remove(layout);
        var path = Path.Combine(_layoutsPath, $"{layout.Id}.json");
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    public void PushEngineerChanges()
    {
        var dirty = EngineerControls
            .Where(control => Math.Abs(control.CarValue - control.StagedValue) > 0.001)
            .ToList();
        if (dirty.Count == 0)
        {
            return;
        }

        var detail = string.Join(" | ", dirty.Select(control =>
            $"{control.Label} {FormatControlValue(control, control.CarValue)} -> {FormatControlValue(control, control.StagedValue)}"));
        foreach (var control in dirty)
        {
            control.CarValue = control.StagedValue;
        }

        PrependRadioLog("Push staged changes", detail, "DASH");
    }

    public void RevertEngineerChanges()
    {
        foreach (var control in EngineerControls)
        {
            control.StagedValue = control.CarValue;
        }

        PrependRadioLog("Revert", "Staged car control changes cleared", "DASH");
    }

    public void SendQuickMessage(string message)
    {
        PrependRadioLog(message, "Quick message staged to the driver radio", "SENT");
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
        new() { Key = "fuelLoad", Label = "Fuel load", Min = 10, Max = 90, Unit = "L", Group = "Brakes" }
    ];

    public static string FormatSetupValue(SetupParameter parameter, double value)
    {
        var decimals = parameter.Step < 1 ? 1 : 0;
        var formatted = value.ToString(decimals == 0 ? "0" : "0.0");
        return string.IsNullOrWhiteSpace(parameter.Unit) ? formatted : $"{formatted} {parameter.Unit}";
    }

    private AppSettings LoadSettings()
    {
        var fallback = LoadJson<AppSettings>(PresetPath("settings", "default.json")) ?? new AppSettings();
        return LoadJson<AppSettings>(_settingsPath) ?? fallback;
    }

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
        return LoadJson<List<SavedDevice>>(_devicesPath) ?? [];
    }

    private IEnumerable<DashLayout> LoadLayouts()
    {
        var layouts = new List<DashLayout>();
        if (Directory.Exists(_layoutsPath))
        {
            foreach (var file in Directory.EnumerateFiles(_layoutsPath, "*.json"))
            {
                var layout = LoadJson<DashLayout>(file);
                if (layout is not null)
                {
                    layouts.Add(layout);
                }
            }
        }

        if (layouts.Count == 0)
        {
            layouts.Add(LoadJson<DashLayout>(PresetPath("dash", "default.json")) ?? CreateFallbackDashLayout());
        }

        return layouts.OrderByDescending(layout => layout.IsDefault).ThenBy(layout => layout.Name);
    }

    private void SaveDevices()
    {
        SaveJson(_devicesPath, Devices.ToList());
    }

    private void SaveDashLayout(DashLayout layout)
    {
        SaveJson(Path.Combine(_layoutsPath, $"{layout.Id}.json"), layout);
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

    private static T Clone<T>(T value)
    {
        var json = JsonSerializer.Serialize(value, JsonOptions);
        return JsonSerializer.Deserialize<T>(json, JsonOptions)!;
    }

    private static T? LoadJson<T>(string path)
    {
        if (!File.Exists(path))
        {
            return default;
        }

        using var stream = File.OpenRead(path);
        return JsonSerializer.Deserialize<T>(stream, JsonOptions);
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

    private static IEnumerable<SetupProgram> CreateSetupPrograms()
    {
        yield return new SetupProgram
        {
            Id = "setup-baseline",
            Name = "Baseline | Race",
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
}
