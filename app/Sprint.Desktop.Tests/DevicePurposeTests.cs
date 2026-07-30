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

    private sealed class CountingCapturer(byte value) : IDesktopRegionCapturer
    {
        private int _frames;
        public int Frames => Volatile.Read(ref _frames);

        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            Interlocked.Increment(ref _frames);
            Array.Fill(bgra, value);
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
            new[] { "racelogic_lap_timer" },
            lapTimer.Pages.Single().Widgets.Select(widget => widget.Type));
        Assert.True(DashLayoutValidator.IsValid(lapTimer));
        Assert.Null(mirror);
    }

    [Theory]
    [InlineData(800, 480, 800, 200)]
    [InlineData(480, 800, 480, 120)]
    public void LapTimerKeepsACompactFourToOneInformationBandCenteredOnThePanel(
        int width,
        int height,
        int expectedWidth,
        int expectedHeight)
    {
        var area = DashPainter.RaceLogicPanelBounds(width, height);

        Assert.Equal(expectedWidth, area.Width);
        Assert.Equal(expectedHeight, area.Height);
        Assert.Equal((width - expectedWidth) / 2, area.X);
        Assert.Equal((height - expectedHeight) / 2, area.Y);
    }

    [Fact]
    public void LapTimerLeavesEveryPixelOutsideTheInformationBandTrueBlack()
    {
        var device = ScreenDevice("lap-screen", DevicePurposes.LapTimes);
        device.Width = 800;
        device.Height = 480;
        var layout = DevicePurposeLayouts.Resolve(device, [])!;
        using var painter = new DashPainter(800, 480);

        painter.Render(
            layout,
            new TelemetryFrame
            {
                Car = new CarState { SpeedMetersPerSecond = 24 },
                Lap = new LapState
                {
                    CurrentLap = 2,
                    TargetLapTime = 82.5,
                    Delta = -0.08,
                },
            },
            new AppSettings());

        var pixels = painter.PixelSpanBgra;
        var band = DashPainter.RaceLogicPanelBounds(800, 480);
        for (var y = 0; y < 480; y++)
        {
            if (y >= band.Y && y < band.Y + band.Height)
            {
                continue;
            }

            for (var x = 0; x < 800; x++)
            {
                var offset = (y * 800 + x) * 4;
                Assert.Equal(0, pixels[offset]);
                Assert.Equal(0, pixels[offset + 1]);
                Assert.Equal(0, pixels[offset + 2]);
            }
        }
    }

    [Fact]
    public void LapTimerBuildsAReferenceThenShowsPredictiveDelta()
    {
        var presenter = new RaceLogicLapTimerPresenter();

        var rolling = presenter.Present(
            new TelemetryFrame
            {
                Lap = new LapState { CurrentLap = 1, CurrentLapTime = 42.345 },
            },
            timestamp: 100);
        var predictive = presenter.Present(
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
        var presenter = new RaceLogicLapTimerPresenter();
        presenter.Present(
            new TelemetryFrame
            {
                Lap = new LapState { CurrentLap = 3, TargetLapTime = 82.5 },
            },
            timestamp: 100);

        var result = presenter.Present(
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
    public void LapTimerRenderKeepsManagedAllocationBelowOneKilobytePerFrame()
    {
        var device = ScreenDevice("lap-screen", DevicePurposes.LapTimes);
        device.Width = 800;
        device.Height = 480;
        var layout = DevicePurposeLayouts.Resolve(device, [])!;
        var frame = new TelemetryFrame
        {
            Car = new CarState { SpeedMetersPerSecond = 40 },
            Lap = new LapState
            {
                CurrentLap = 4,
                CurrentLapTime = 41.2,
                BestLapTime = 82.1,
                TargetLapTime = 82.5,
                Delta = -0.08,
            },
        };
        using var painter = new DashPainter(800, 480);
        var settings = new AppSettings();
        painter.Render(layout, frame, settings);

        const int frames = 100;
        var before = GC.GetAllocatedBytesForCurrentThread();
        for (var index = 0; index < frames; index++)
        {
            painter.Render(layout, frame, settings);
        }

        var bytesPerFrame = (GC.GetAllocatedBytesForCurrentThread() - before) / frames;
        Assert.True(
            bytesPerFrame < 1024,
            $"Expected the reusable Skia path to allocate <1 KiB/frame; measured {bytesPerFrame} bytes/frame.");
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
            device.Orientation = DeviceOrientation.LandscapeInverted;
            runtime.Devices.Add(device);
            var driversCreated = 0;
            var drivers = new List<FakeScreenDriver>();

            using var service = new DeviceScreenService(
                runtime,
                () => new TelemetryFrame(),
                _ =>
                {
                    driversCreated++;
                    var driver = new FakeScreenDriver();
                    drivers.Add(driver);
                    return driver;
                },
                desktopCapturer: new SolidCapturer());
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);
            Assert.Equal(DeviceOrientation.LandscapeInverted, drivers[^1].LastConfig!.Orientation);

            runtime.UpdateDevicePurpose(device, DevicePurposes.Flags);
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);
            Assert.Equal(DeviceOrientation.LandscapeInverted, drivers[^1].LastConfig!.Orientation);

            runtime.UpdateDevicePurpose(device, DevicePurposes.LapTimes);
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);
            Assert.Equal(DeviceOrientation.LandscapeInverted, drivers[^1].LastConfig!.Orientation);

            runtime.UpdateDevicePurpose(device, DevicePurposes.RearViewMirror);
            service.Sync();
            Assert.DoesNotContain("wheel-screen", service.ActiveDeviceIds);

            runtime.UpdateDeviceCaptureRegion(device, new ScreenCaptureRegion(200, 100, 800, 480));
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);
            Assert.Equal(DeviceOrientation.LandscapeInverted, drivers[^1].LastConfig!.Orientation);
            var capturePublisherCount = driversCreated;

            runtime.UpdateDeviceCaptureRegion(device, new ScreenCaptureRegion(240, 120, 800, 480));
            service.Sync();
            Assert.Equal(capturePublisherCount + 1, driversCreated);

            // Switching back to a supported purpose resumes output.
            runtime.UpdateDevicePurpose(device, DevicePurposes.Dash);
            service.Sync();
            Assert.Contains("wheel-screen", service.ActiveDeviceIds);
            Assert.Equal(DeviceOrientation.LandscapeInverted, drivers[^1].LastConfig!.Orientation);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void ActiveRearViewPublisherFeedsTheDetailPreviewWithoutASecondCapture()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var device = ScreenDevice("mirror", DevicePurposes.RearViewMirror);
            device.Width = 80;
            device.Height = 48;
            device.Orientation = DeviceOrientation.Landscape;
            device.CaptureRegion = new ScreenCaptureRegion(0, 0, 800, 480);
            runtime.Devices.Add(device);
            var hardwareCapturer = new CountingCapturer(0xA5);
            var fallbackCapturer = new CountingCapturer(0x5A);

            using var service = new DeviceScreenService(
                runtime,
                () => new TelemetryFrame(),
                _ => new FakeScreenDriver(),
                desktopCapturer: hardwareCapturer,
                previewCapturerFactory: () => fallbackCapturer);
            service.Sync();
            Assert.True(
                SpinWait.SpinUntil(
                    () => hardwareCapturer.Frames > 0,
                    TimeSpan.FromSeconds(2)));

            var transform = DeviceOrientations.Transform(
                device.Width,
                device.Height,
                device.Orientation);
            using var preview = service.CreateRearViewPreviewSession(
                device.Id,
                device.CaptureRegion,
                transform.LogicalWidth,
                transform.LogicalHeight,
                targetFps: 15);
            preview.Start();

            var destination = new byte[transform.LogicalWidth * transform.LogicalHeight * 4];
            long version = 0;
            Assert.True(
                SpinWait.SpinUntil(
                    () => preview.TryCopyLatest(destination, ref version, out _),
                    TimeSpan.FromSeconds(2)));
            Assert.All(destination, value => Assert.Equal(0xA5, value));
            Assert.Equal(0, fallbackCapturer.Frames);
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
