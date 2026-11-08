using System.Diagnostics;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Device purposes (issue #53): task-oriented catalog copy, legacy normalization,
/// built-in focused layouts, dashboard assignment boundaries, output routing, and
/// persistence.
/// </summary>
public sealed class DevicePurposeTests
{
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
        DashLayout assigned = new DashLayout
        {
            Id = "assigned",
            Name = "Assigned dashboard",
            Pages = [new DashPage { Id = "assigned-page", Name = "Driving" }],
        };
        DashLayout[] dashboards = new[] { assigned };

        DashLayout? dashboard = DevicePurposeLayouts.Resolve(ScreenDevice("dash-screen"), dashboards);
        DashLayout? flags = DevicePurposeLayouts.Resolve(
            ScreenDevice("flag-screen", DevicePurposes.Flags),
            dashboards);
        DashLayout? lapTimer = DevicePurposeLayouts.Resolve(
            ScreenDevice("lap-screen", DevicePurposes.LapTimes),
            dashboards);
        DashLayout? mirror = DevicePurposeLayouts.Resolve(
            ScreenDevice("mirror-screen", DevicePurposes.RearViewMirror),
            dashboards);

        Assert.Same(assigned, dashboard);
        Assert.Equal("purpose-flags", flags!.Id);
        Assert.Equal(new[] { "flag" }, flags.Pages.Single().Widgets.Select(widget => widget.Type));
        Assert.True(DashLayoutValidator.IsValid(flags));
        Assert.Equal("purpose-lap-times", lapTimer!.Id);
        Assert.Equal(
            new[] { "racelogic_lap_timer" },
            lapTimer.Pages.Single().Widgets.Select(widget => widget.Type));
        Assert.True(DashLayoutValidator.IsValid(lapTimer));
        Assert.Null(mirror);
    }

    [Fact]
    public void LapTimerBuildsAReferenceThenShowsPredictiveDelta()
    {
        RaceLogicLapTimerPresenter presenter = new RaceLogicLapTimerPresenter();

        RaceLogicLapTimerView rolling = presenter.Present(
            new TelemetryFrame
            {
                Lap = new LapState { CurrentLap = 1, CurrentLapTime = 42.345 },
            },
            timestamp: 100);
        RaceLogicLapTimerView predictive = presenter.Present(
            new TelemetryFrame
            {
                Lap = new LapState
                {
                    CurrentLap = 1,
                    CurrentLapTime = 43,
                    TargetLapTime = 82.5,
                    Delta = -0.08,
                },
            },
            timestamp: 200);

        Assert.Equal(RaceLogicLapTimerMode.Rolling, rolling.Mode);
        Assert.Equal("BUILDING REFERENCE", rolling.Status);
        Assert.Equal(RaceLogicLapTimerMode.Predictive, predictive.Mode);
        Assert.Equal("-0.08", predictive.Primary);
        Assert.True(predictive.ShowDeltaBar);
    }

    [Fact]
    public void LapTimerFreezesTheCompletedLapAtTheLapBoundary()
    {
        RaceLogicLapTimerPresenter presenter = new RaceLogicLapTimerPresenter();
        presenter.Present(
            new TelemetryFrame
            {
                Lap = new LapState { CurrentLap = 3, TargetLapTime = 82.5 },
            },
            timestamp: 100);

        RaceLogicLapTimerView result = presenter.Present(
            new TelemetryFrame
            {
                Lap = new LapState
                {
                    CurrentLap = 4,
                    CurrentLapTime = 0.2,
                    LastLapTime = 82.1,
                    TargetLapTime = 82.5,
                },
            },
            timestamp: 200);

        Assert.Equal(RaceLogicLapTimerMode.LapResult, result.Mode);
        Assert.Equal("1:22.100", result.Primary);
        Assert.Equal("-0.40 TO REFERENCE", result.Status);
    }

    [Fact]
    public void SupportedPurposesDriveScreenOutputButOnlyDashboardCountsAsADashAssignment()
    {
        SavedDevice dashboard = ScreenDevice("dash-screen");
        SavedDevice flags = ScreenDevice("flag-screen", DevicePurposes.Flags);
        SavedDevice lapTimer = ScreenDevice("lap-screen", DevicePurposes.LapTimes);
        SavedDevice mirror = ScreenDevice("mirror", DevicePurposes.RearViewMirror);
        SavedDevice configuredMirror = ScreenDevice("configured-mirror", DevicePurposes.RearViewMirror);
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
        SavedDevice dash = ScreenDevice("dash-screen");
        SavedDevice flags = ScreenDevice("flag-screen", DevicePurposes.Flags);

        IReadOnlyList<SavedDevice> result = DashDeviceAssignments.EnabledScreensFor(new[] { dash, flags }, "dash-1");

        Assert.Equal(new[] { "dash-screen" }, result.Select(device => device.Id));
    }

    [Fact]
    public void PurposeSurvivesAReloadAndLegacyDevicesLoadAsDash()
    {
        string dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            SavedDevice mirror = ScreenDevice("mirror");
            SavedDevice legacy = ScreenDevice("legacy");
            legacy.Purpose = "";
            runtime.Devices.Add(mirror);
            runtime.Devices.Add(legacy);
            runtime.UpdateDevicePurpose(mirror, DevicePurposes.RearViewMirror);

            DesktopRuntime reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

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
