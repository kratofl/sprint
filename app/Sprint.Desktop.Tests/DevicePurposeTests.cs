using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Device purposes (issue #53): task-oriented catalog copy, legacy normalization,
/// built-in focused layouts, dashboard assignment boundaries, output routing, and
/// persistence.
/// </summary>
public sealed class DevicePurposeTests
{
    private sealed class SolidCapturer : IDesktopRegionCapturer
    {
        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            Array.Fill(bgra, (byte)0xff);
            return true;
        }
    }

    private static SavedDevice ScreenDevice(string id, string purpose = DevicePurposes.Dash) => new()
    {
        Id = id,
        Name = id,
        Type = "screen",
        Driver = "vocore",
        Width = 480,
        Height = 800,
        DashId = "dash-1",
        Purpose = purpose,
    };

    [Fact]
    public void CatalogCoversTheRequestedPurposesAndNamesThemAsScreenTasks()
    {
        Assert.Equal(
            new[] { "dash", "rear-view-mirror", "flags", "lap-times" },
            DevicePurposes.All.Select(purpose => purpose.Id));

        Assert.Equal(
            new[] { "Dashboard", "Rear-view mirror", "Flag display", "Lap timer" },
            DevicePurposes.All.Where(p => p.Available).Select(p => p.Label));
        Assert.Equal(
            new[] { "Dashboard", "Rear-view mirror", "Flag display", "Lap timer" },
            DevicePurposes.Labels);
        Assert.Equal(DevicePurposes.All.Select(p => p.Label), DevicePurposes.Labels);
        Assert.All(DevicePurposes.All, purpose => Assert.False(string.IsNullOrWhiteSpace(purpose.Description)));
    }

    [Theory]
    [InlineData(null, "dash")]
    [InlineData("", "dash")]
    [InlineData("   ", "dash")]
    [InlineData("nonsense", "dash")]
    [InlineData("DASH", "dash")]
    [InlineData(" Flags ", "flags")]
    [InlineData("rear-view-mirror", "rear-view-mirror")]
    public void NormalizeFallsBackToDashForBlankOrUnknownValues(string? stored, string expected) =>
        Assert.Equal(expected, DevicePurposes.Normalize(stored));

    [Fact]
    public void LookupByLabelBacksTheDropdownSelection()
    {
        Assert.Equal("lap-times", DevicePurposes.FindByLabel("Lap timer")!.Id);
        Assert.Equal("dash", DevicePurposes.FindByLabel("dashboard")!.Id);
        Assert.Null(DevicePurposes.FindByLabel("Telemetry graph"));
        Assert.Null(DevicePurposes.FindByLabel(null));
    }

    [Fact]
    public void PurposeLayoutsUseTheAssignedDashboardAndProvideValidZeroConfigurationDisplays()
    {
        var assigned = new DashLayout
        {
            Id = "assigned",
            Name = "Assigned dashboard",
            IsDefault = true,
            Pages = [new DashPage { Id = "assigned-page", Name = "Driving" }],
        };
        var dashboards = new[] { assigned };

        var dashboard = DevicePurposeLayouts.Resolve(ScreenDevice("dash-screen"), dashboards);
        var flags = DevicePurposeLayouts.Resolve(
            ScreenDevice("flag-screen", DevicePurposes.Flags),
            dashboards);
        var lapTimer = DevicePurposeLayouts.Resolve(
            ScreenDevice("lap-screen", DevicePurposes.LapTimes),
            dashboards);
        var mirror = DevicePurposeLayouts.Resolve(
            ScreenDevice("mirror-screen", DevicePurposes.RearViewMirror),
            dashboards);

        Assert.Same(assigned, dashboard);
        Assert.Equal("purpose-flags", flags!.Id);
        Assert.Equal(new[] { "flag" }, flags.Pages.Single().Widgets.Select(widget => widget.Type));
        Assert.True(DashLayoutValidator.IsValid(flags));
        Assert.Equal("purpose-lap-times", lapTimer!.Id);
        Assert.Equal(
            new[] { "delta", "lap_time", "sector" },
            lapTimer.Pages.Single().Widgets.Select(widget => widget.Type));
        Assert.True(DashLayoutValidator.IsValid(lapTimer));
        Assert.Null(mirror);
    }

    [Fact]
    public void SupportedPurposesDriveScreenOutputButOnlyDashboardCountsAsADashAssignment()
    {
        var dashboard = ScreenDevice("dash-screen");
        var flags = ScreenDevice("flag-screen", DevicePurposes.Flags);
        var lapTimer = ScreenDevice("lap-screen", DevicePurposes.LapTimes);
        var mirror = ScreenDevice("mirror", DevicePurposes.RearViewMirror);
        var configuredMirror = ScreenDevice("configured-mirror", DevicePurposes.RearViewMirror);
        configuredMirror.CaptureRegion = new ScreenCaptureRegion(-1600, 0, 1600, 960);

        Assert.True(DeviceCapabilities.DrivesScreenOutput(dashboard));
        Assert.True(DeviceCapabilities.DrivesScreenOutput(flags));
        Assert.True(DeviceCapabilities.DrivesScreenOutput(lapTimer));
        Assert.False(DeviceCapabilities.DrivesScreenOutput(mirror));
        Assert.True(DeviceCapabilities.DrivesScreenOutput(configuredMirror));

        Assert.True(DeviceCapabilities.DrivesDash(dashboard));
        Assert.False(DeviceCapabilities.DrivesDash(flags));
        Assert.False(DeviceCapabilities.DrivesDash(lapTimer));
        Assert.False(DeviceCapabilities.DrivesDash(mirror));

        // An unsupported purpose does not stop the device from being a screen; the
        // detail page remains available to change its purpose or alignment.
        Assert.True(DeviceCapabilities.HasScreen(mirror));
    }

    [Fact]
    public void AssignedScreenQueryIgnoresNonDashPurposes()
    {
        var dash = ScreenDevice("dash-screen");
        var flags = ScreenDevice("flag-screen", DevicePurposes.Flags);

        var result = DashDeviceAssignments.EnabledScreensFor(new[] { dash, flags }, "dash-1");

        Assert.Equal(new[] { "dash-screen" }, result.Select(device => device.Id));
    }

    [Fact]
    public void SyncStartsRearViewOnlyAfterItsCaptureAreaIsConfigured()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var device = ScreenDevice("wheel-screen");
            runtime.Devices.Add(device);
            var driversCreated = 0;

            using var service = new DeviceScreenService(
                runtime,
                () => new TelemetryFrame(),
                _ =>
                {
                    driversCreated++;
                    return new FakeScreenDriver();
                },
                desktopCapturer: new SolidCapturer());
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);

            runtime.UpdateDevicePurpose(device, DevicePurposes.Flags);
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);

            runtime.UpdateDevicePurpose(device, DevicePurposes.LapTimes);
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);

            runtime.UpdateDevicePurpose(device, DevicePurposes.RearViewMirror);
            service.Sync();
            Assert.DoesNotContain("wheel-screen", service.ActiveDeviceIds);

            runtime.UpdateDeviceCaptureRegion(device, new ScreenCaptureRegion(200, 100, 800, 480));
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);
            var capturePublisherCount = driversCreated;

            runtime.UpdateDeviceCaptureRegion(device, new ScreenCaptureRegion(240, 120, 800, 480));
            service.Sync();
            Assert.Equal(capturePublisherCount + 1, driversCreated);

            // Switching back to a supported purpose resumes output.
            runtime.UpdateDevicePurpose(device, DevicePurposes.Dash);
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void PurposeSurvivesAReloadAndLegacyDevicesLoadAsDash()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var mirror = ScreenDevice("mirror");
            var legacy = ScreenDevice("legacy");
            legacy.Purpose = "";
            runtime.Devices.Add(mirror);
            runtime.Devices.Add(legacy);
            runtime.UpdateDevicePurpose(mirror, DevicePurposes.RearViewMirror);

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            Assert.Equal(
                DevicePurposes.RearViewMirror,
                reloaded.Devices.Single(device => device.Id == "mirror").Purpose);
            Assert.Equal(
                DevicePurposes.Dash,
                reloaded.Devices.Single(device => device.Id == "legacy").Purpose);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
