using System.Text.Json;
using Sprint.Desktop;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class RuntimePersistenceTests
{
    [Fact]
    public void DesktopRuntimeExposesSmallRuntimeInterface()
    {
        var constructor = typeof(MainWindow).GetConstructors().Single(ctor => ctor.GetParameters().Length == 3);
        Assert.Equal(typeof(IDesktopRuntime), constructor.GetParameters()[0].ParameterType);

        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            IDesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            Assert.NotNull(runtime.Settings);
            Assert.NotEmpty(runtime.Catalog);
            Assert.NotEmpty(runtime.DashLayouts);
            Assert.NotEmpty(runtime.SetupTemplates);
            Assert.Empty(runtime.SetupPrograms);

            var setup = runtime.DuplicateSetup(runtime.SetupTemplates.Single(program => program.Id == "setup-baseline"));
            setup.Values["fuelLoad"] = 54;
            runtime.SaveSetupPrograms();

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            Assert.NotEmpty(reloaded.SetupTemplates);
            Assert.Equal(54, reloaded.SetupPrograms.Single(program => program.Id == setup.Id).Values["fuelLoad"]);
            Assert.DoesNotContain(reloaded.SetupTemplates, program => program.Id == setup.Id);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DashLayoutPresetKeepsIdlePageAlertsAndWidgetConfig()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            var layout = runtime.DashLayouts.Single(layout => layout.Id == "default");
            Assert.NotNull(layout.IdlePage);
            Assert.Equal("idle-default", layout.IdlePage.Id);
            Assert.Equal(3, layout.Alerts.Count);

            var idleName = layout.IdlePage.Widgets.Single(widget => widget.Id == "idle-name");
            Assert.NotNull(idleName.Config);
            Assert.Equal("profile.driverName", idleName.Config["binding"].GetString());

            var clone = runtime.CreateDashLayout();
            Assert.NotNull(clone.IdlePage);
            Assert.Equal(3, clone.Alerts.Count);
            Assert.Equal(
                "profile.driverName",
                clone.IdlePage.Widgets.Single(widget => widget.Id == "idle-name").Config!["binding"].GetString());
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void CreatedDashLayoutWritesThumbnailPng()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            var layout = runtime.CreateDashLayout();
            var thumbnailPath = runtime.GetDashThumbnailPath(layout);

            Assert.True(File.Exists(thumbnailPath), $"Expected thumbnail at {thumbnailPath}.");
            Assert.True(new FileInfo(thumbnailPath).Length > 100, "Thumbnail should not be an empty placeholder.");

            var (width, height) = ReadPngSize(thumbnailPath);
            Assert.Equal(320, width);
            Assert.Equal(192, height);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SaveDashLayoutPersistsEditorChangesAcrossRuntimeReload()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            IDesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layout = runtime.CreateDashLayout();
            var page = DashLayoutEditor.AddPage(layout, "Race");
            DashLayoutEditor.TryRenamePage(layout, page.Id, "Race 1");

            runtime.SaveDashLayout(layout);

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var persisted = reloaded.DashLayouts.Single(item => item.Id == layout.Id);
            var persistedPage = persisted.Pages.Single(item => item.Id == page.Id);
            Assert.Equal("Race 1", persistedPage.Name);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SettingsPresetKeepsDashEditorUiPreferences()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            Assert.True(runtime.Settings.DashEditorUI.Palette.Open);
            Assert.True(runtime.Settings.DashEditorUI.Palette.Pinned);
            Assert.True(runtime.Settings.DashEditorUI.Inspector.Open);
            Assert.True(runtime.Settings.DashEditorUI.Inspector.Pinned);

            runtime.SaveSettings();
            var savedJson = File.ReadAllText(Path.Combine(dataRoot, "settings.json"));
            using var saved = JsonDocument.Parse(savedJson);

            Assert.True(saved.RootElement.GetProperty("dashEditorUI").GetProperty("palette").GetProperty("open").GetBoolean());
            Assert.True(saved.RootElement.GetProperty("dashEditorUI").GetProperty("inspector").GetProperty("pinned").GetBoolean());
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SaveSettingsPublishesRenderProfile()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            IDesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            RenderProfile? published = null;
            runtime.RenderProfileChanged += (_, profile) => published = profile;

            runtime.Settings.DriverName = "Profile Driver";
            runtime.Settings.DriverNumber = "99";
            runtime.SaveSettings();

            Assert.NotNull(published);
            Assert.Equal("Profile Driver", published.DriverName);
            Assert.Equal("99", published.DriverNumber);
            Assert.Equal("Profile Driver", runtime.CurrentRenderProfile.DriverName);
            Assert.Equal("99", runtime.CurrentRenderProfile.DriverNumber);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void CatalogGeometryAndBindingsCarryIntoSavedDevices()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var wheel = runtime.Catalog.Single(device => device.Id == "bavarian-omega-v2-pro");

            Assert.Equal(0, wheel.OffsetX);
            Assert.Equal(0, wheel.OffsetY);
            Assert.Equal(5, wheel.Margin);
            Assert.Empty(wheel.Bindings);

            var saved = runtime.AddDevice(wheel);
            Assert.Equal(0, saved.OffsetX);
            Assert.Equal(0, saved.OffsetY);
            Assert.Equal(5, saved.Margin);
            Assert.Empty(saved.Bindings);

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var persisted = reloaded.Devices.Single();
            Assert.Equal(5, persisted.Margin);
            Assert.Empty(persisted.Bindings);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SavedDevicesUseCompositeIdsAndPersistDeviceUpdates()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var wheel = runtime.Catalog.Single(device => device.Id == "bavarian-omega-v2-pro");

            var first = runtime.AddDevice(wheel);
            var second = runtime.AddDevice(wheel);

            Assert.NotEqual(first.Id, second.Id);
            Assert.Contains("c872-1004", first.Id);
            Assert.Contains("c872-1004", second.Id);

            runtime.UpdateDevice(first, name: "Main Wheel", rotation: 180, offsetX: 12, offsetY: 8, margin: 3, dashId: "legacy-main");

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var persisted = reloaded.Devices.Single(device => device.Id == first.Id);
            Assert.Equal("Main Wheel", persisted.Name);
            Assert.Equal(180, persisted.Rotation);
            Assert.Equal(12, persisted.OffsetX);
            Assert.Equal(8, persisted.OffsetY);
            Assert.Equal(3, persisted.Margin);
            Assert.Equal("legacy-main", persisted.DashId);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SetupTemplatesAreReadOnlyAndUserDuplicatesPersistAcrossRuntimeReload()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var baseline = runtime.SetupTemplates.Single(program => program.Id == "setup-baseline");

            Assert.True(baseline.IsTemplate);
            Assert.Empty(runtime.SetupPrograms);

            var copy = runtime.DuplicateSetup(baseline);
            Assert.False(copy.IsTemplate);
            Assert.NotEqual(baseline.Id, copy.Id);
            Assert.Equal(baseline.Values["fuelLoad"], copy.Values["fuelLoad"]);

            copy.Values["fuelLoad"] = 55;

            runtime.SaveSetupPrograms();

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var persisted = reloaded.SetupPrograms.Single(program => program.Id == copy.Id);
            Assert.Equal(55, persisted.Values["fuelLoad"]);
            Assert.True(reloaded.SetupTemplates.Single(program => program.Id == "setup-baseline").IsTemplate);
            Assert.Equal(baseline.Values["fuelLoad"], reloaded.SetupTemplates.Single(program => program.Id == "setup-baseline").Values["fuelLoad"]);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DuplicateSetupCreatesUniqueNamesForRepeatedTemplateCopies()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var baseline = runtime.SetupTemplates.Single(program => program.Id == "setup-baseline");

            var firstCopy = runtime.DuplicateSetup(baseline);
            var secondCopy = runtime.DuplicateSetup(baseline);

            Assert.NotEqual(firstCopy.Name, secondCopy.Name);
            Assert.Equal(2, runtime.SetupPrograms.Select(program => program.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void MutatingPublicTemplateObjectDoesNotContaminateDuplicateCopies()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var baseline = runtime.SetupTemplates.Single(program => program.Id == "setup-baseline");
            var shippedFuelLoad = baseline.Values["fuelLoad"];

            baseline.Values["fuelLoad"] = 1;
            baseline.Name = "Mutated template";
            baseline.Id = "mutated-template-id";

            var copy = runtime.DuplicateSetup(baseline);

            Assert.Equal(shippedFuelLoad, copy.Values["fuelLoad"]);
            Assert.Equal("Baseline | Race copy", copy.Name);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DuplicateSetupUsesSelectedUserSetupWhenUserIdCollidesWithTemplateId()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            File.WriteAllText(
                Path.Combine(dataRoot, "setup-programs.json"),
                """
                [
                  {
                    "id": "setup-baseline",
                    "name": "User Collision",
                    "values": { "fuelLoad": 12 }
                  }
                ]
                """);

            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var userSetup = runtime.SetupPrograms.Single(program => program.Id == "setup-baseline");

            var copy = runtime.DuplicateSetup(userSetup);

            Assert.Equal("User Collision copy", copy.Name);
            Assert.Equal(12, copy.Values["fuelLoad"]);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void LoadedSetupProgramsSkipBlankIdsAndRepairNullValues()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            File.WriteAllText(
                Path.Combine(dataRoot, "setup-programs.json"),
                """
                [
                  {
                    "id": "",
                    "name": "Blank",
                    "values": { "fuelLoad": 99 }
                  },
                  {
                    "id": "valid-user-setup",
                    "name": "",
                    "values": null
                  }
                ]
                """);

            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var setup = runtime.SetupPrograms.Single();

            Assert.Equal("valid-user-setup", setup.Id);
            Assert.Equal("valid-user-setup", setup.Name);
            Assert.Empty(setup.Values);

            var copy = runtime.DuplicateSetup(setup);

            Assert.Equal("valid-user-setup copy", copy.Name);
            Assert.Empty(copy.Values);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Theory]
    [InlineData("settings.json")]
    [InlineData("devices.json")]
    [InlineData("setup-programs.json")]
    [InlineData("controls.json")]
    public void MalformedRuntimeJsonFallsBackToDefaultsWithoutDeletingFile(string fileName)
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var path = Path.Combine(dataRoot, fileName);
            File.WriteAllText(path, "{ definitely not json");

            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            Assert.NotNull(runtime.Settings);
            Assert.Empty(runtime.Devices);
            Assert.NotEmpty(runtime.SetupTemplates);
            Assert.Empty(runtime.SetupPrograms);
            Assert.Empty(runtime.Controls.Bindings);
            Assert.Equal("{ definitely not json", File.ReadAllText(path));
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void MalformedDashLayoutJsonFallsBackToPresetWithoutDeletingFile()
    {
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            var layoutsPath = Path.Combine(dataRoot, "dash-layouts");
            Directory.CreateDirectory(layoutsPath);
            var path = Path.Combine(layoutsPath, "broken.json");
            File.WriteAllText(path, "{ definitely not json");

            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            Assert.Contains(runtime.DashLayouts, layout => layout.Id == "default");
            Assert.Equal("{ definitely not json", File.ReadAllText(path));
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void LegacyPortableDataMigratesIntoNewRuntimeStoreOnce()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        var legacyRoot = TestEnv.NewTempDataRoot();

        try
        {
            Directory.CreateDirectory(Path.Combine(legacyRoot, "devices"));
            File.WriteAllText(
                Path.Combine(legacyRoot, "devices", "wheels.json"),
                """
                [
                  {
                    "vid": 51314,
                    "pid": 4100,
                    "type": "wheel",
                    "width": 800,
                    "height": 480,
                    "name": "Migrated Omega",
                    "rotation": 90,
                    "margin": 5,
                    "driver": "vocore"
                  }
                ]
                """);
            File.WriteAllText(Path.Combine(legacyRoot, "devices", "screens.json"), "[]");
            File.WriteAllText(Path.Combine(legacyRoot, "devices", "buttonboxes.json"), "[]");

            var legacyLayoutDir = Path.Combine(legacyRoot, "layouts", "legacy-main");
            Directory.CreateDirectory(legacyLayoutDir);
            File.WriteAllText(
                Path.Combine(legacyLayoutDir, "config.json"),
                """
                {
                  "id": "legacy-main",
                  "name": "Legacy Main",
                  "default": true,
                  "gridCols": 20,
                  "gridRows": 12,
                  "pages": [
                    {
                      "id": "main",
                      "name": "Main",
                      "widgets": [
                        {
                          "id": "gear",
                          "type": "gear_speed",
                          "col": 0,
                          "row": 1,
                          "colSpan": 4,
                          "rowSpan": 4,
                          "style": { "border": false },
                          "legacyWidgetField": 7
                        }
                      ]
                    }
                  ],
                  "alerts": [{ "id": "alert-tc", "type": "tc_change" }],
                  "alertConfig": {
                    "displayMode": "full",
                    "enabledTypes": ["tc_change"],
                    "durationSeconds": 2.5,
                    "invertColors": true,
                    "colorToken": "blue"
                  }
                }
                """);

            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot, legacyRoot);

            var device = runtime.Devices.Single();
            Assert.Equal("Migrated Omega", device.Name);
            Assert.Equal("wheel", device.Type);
            Assert.Equal(51314, device.Vid);
            Assert.Equal(4100, device.Pid);
            Assert.Equal(5, device.Margin);

            var layout = runtime.DashLayouts.Single(layout => layout.Id == "legacy-main");
            Assert.Equal("Legacy Main", layout.Name);
            Assert.Single(layout.Alerts);
            Assert.NotNull(layout.AlertConfig);
            Assert.Equal("full", layout.AlertConfig!.DisplayMode);
            Assert.Equal(2.5, layout.AlertConfig.DurationSeconds);
            Assert.True(layout.AlertConfig.InvertColors);
            Assert.Equal("blue", layout.AlertConfig.ColorToken);
            // "style" is now a first-class property: it deserializes into Style (not ExtensionData).
            Assert.NotNull(layout.Pages[0].Widgets[0].Style);
            Assert.False(layout.Pages[0].Widgets[0].Style!.Border);
            // Genuinely-unknown widget fields still round-trip through the extension-data catch-all.
            Assert.NotNull(layout.Pages[0].Widgets[0].ExtensionData);
            Assert.True(layout.Pages[0].Widgets[0].ExtensionData!.ContainsKey("legacyWidgetField"));

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot, legacyRoot);
            Assert.Single(reloaded.Devices);
            Assert.Single(reloaded.DashLayouts);
            Assert.Equal("legacy-main", reloaded.DashLayouts[0].Id);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
            Directory.Delete(legacyRoot, recursive: true);
        }
    }

    [Fact]
    public void InvalidLegacyDashLayoutIsNotMigrated()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        var legacyRoot = TestEnv.NewTempDataRoot();

        try
        {
            var invalidLayoutDir = Path.Combine(legacyRoot, "layouts", "invalid");
            Directory.CreateDirectory(invalidLayoutDir);
            File.WriteAllText(
                Path.Combine(invalidLayoutDir, "config.json"),
                """
                {
                  "id": "invalid",
                  "name": "Invalid",
                  "gridCols": 20,
                  "gridRows": 12,
                  "pages": [
                    {
                      "id": "main",
                      "name": "Main",
                      "widgets": [
                        { "id": "bad", "type": "gear_speed", "col": 19, "row": 11, "colSpan": 2, "rowSpan": 2 }
                      ]
                    }
                  ]
                }
                """);

            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot, legacyRoot);

            Assert.DoesNotContain(runtime.DashLayouts, layout => layout.Id == "invalid");
            Assert.False(File.Exists(Path.Combine(dataRoot, "dash-layouts", "invalid.json")));
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
            Directory.Delete(legacyRoot, recursive: true);
        }
    }

    [Fact]
    public void LegacySettingsMigrateWithNewDashDefaults()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        var legacyRoot = TestEnv.NewTempDataRoot();

        try
        {
            File.WriteAllText(
                Path.Combine(legacyRoot, "settings.json"),
                """
                {
                  "updateChannel": "pre-release",
                  "driverName": "Legacy Driver",
                  "driverNumber": "77",
                  "newDashDefaults": {
                    "mode": "advanced",
                    "display": "vocore",
                    "speedUnit": "mph",
                    "tempUnit": "f"
                  },
                  "dashEditorUI": {
                    "palette": { "open": false, "pinned": true },
                    "inspector": { "open": true, "pinned": false }
                  }
                }
                """);

            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot, legacyRoot);

            Assert.Equal("pre-release", runtime.Settings.UpdateChannel);
            Assert.Equal("Legacy Driver", runtime.Settings.DriverName);
            Assert.Equal("77", runtime.Settings.DriverNumber);
            Assert.Equal("advanced", runtime.Settings.NewDashDefaults.Mode);
            Assert.Equal("vocore", runtime.Settings.NewDashDefaults.Display);
            Assert.Equal("mph", runtime.Settings.NewDashDefaults.SpeedUnit);
            Assert.Equal("f", runtime.Settings.NewDashDefaults.TempUnit);
            Assert.False(runtime.Settings.DashEditorUI.Palette.Open);
            Assert.False(runtime.Settings.DashEditorUI.Inspector.Pinned);

            var savedJson = File.ReadAllText(Path.Combine(dataRoot, "settings.json"));
            using var saved = JsonDocument.Parse(savedJson);
            Assert.Equal("advanced", saved.RootElement.GetProperty("newDashDefaults").GetProperty("mode").GetString());

            File.WriteAllText(
                Path.Combine(legacyRoot, "settings.json"),
                """{"driverName":"Ignored After First Migration"}""");

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot, legacyRoot);
            Assert.Equal("Legacy Driver", reloaded.Settings.DriverName);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
            Directory.Delete(legacyRoot, recursive: true);
        }
    }

    private static (int Width, int Height) ReadPngSize(string path)
    {
        var bytes = File.ReadAllBytes(path);
        Assert.True(bytes.Length >= 24, "PNG should contain a signature and IHDR chunk.");
        Assert.Equal([137, 80, 78, 71, 13, 10, 26, 10], bytes[..8]);
        Assert.Equal("IHDR", System.Text.Encoding.ASCII.GetString(bytes, 12, 4));
        return (ReadBigEndian(bytes, 16), ReadBigEndian(bytes, 20));
    }

    private static int ReadBigEndian(byte[] bytes, int offset)
    {
        return (bytes[offset] << 24) |
            (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            bytes[offset + 3];
    }
}
