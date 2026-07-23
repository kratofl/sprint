using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DeviceScreenServiceTests
{
    private static SavedDevice ScreenDevice(string id, bool disabled = false) => new()
    {
        Id = id,
        Name = id,
        Type = "screen",
        Driver = "vocore",
        Width = 480,
        Height = 480,
        DashId = "default",
        Disabled = disabled,
    };

    [Fact]
    public void FactoryReturnsFakeForUnknownDriver()
    {
        // On any host, an unknown/"fake" id yields the in-memory fake driver.
        Assert.IsType<FakeScreenDriver>(ScreenDriverFactory.Create("totally-unknown"));
    }

    [Fact]
    public void EnabledScreensForReturnsOnlyEnabledAssignedScreens()
    {
        var assigned = ScreenDevice("assigned");
        assigned.DashId = "dash-1";
        var disabled = ScreenDevice("disabled", disabled: true);
        disabled.DashId = "dash-1";
        var otherDash = ScreenDevice("other-dash");
        otherDash.DashId = "dash-2";
        var wheel = ScreenDevice("wheel");
        wheel.Type = "wheel";
        wheel.DashId = "dash-1";

        var devices = new[] { assigned, disabled, otherDash, wheel };

        var result = DashDeviceAssignments.EnabledScreensFor(devices, "dash-1");

        Assert.Equal(new[] { "assigned", "wheel" }, result.Select(device => device.Id));
    }

    [Fact]
    public void EnabledScreensForIsEmptyWhenDashIdIsBlank()
    {
        var device = ScreenDevice("screen");
        device.DashId = "dash-1";

        Assert.Empty(DashDeviceAssignments.EnabledScreensFor(new[] { device }, null));
        Assert.Empty(DashDeviceAssignments.EnabledScreensFor(new[] { device }, ""));
    }

    [Fact]
    public void SyncStartsPublishersOnlyForEnabledScreenDevices()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            runtime.Devices.Add(ScreenDevice("screen-a"));
            runtime.Devices.Add(ScreenDevice("screen-b", disabled: true));

            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => new FakeScreenDriver());
            service.Sync();

            Assert.Contains("screen-a", service.ActiveDeviceIds);
            Assert.DoesNotContain("screen-b", service.ActiveDeviceIds);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SyncStartsPublisherForWheelWithIntegratedVoCoreScreen()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var wheel = ScreenDevice("integrated-wheel");
            wheel.Type = "wheel";
            runtime.Devices.Add(wheel);

            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => new FakeScreenDriver());
            service.Sync();

            Assert.Contains("integrated-wheel", service.ActiveDeviceIds);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SyncDoesNotLetTwoSavedEntriesCompeteForTheSamePhysicalUsbScreen()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var integrated = ScreenDevice("integrated-wheel");
            integrated.Type = "wheel";
            integrated.Vid = 0xC872;
            integrated.Pid = 0x1004;
            var generic = ScreenDevice("generic-vocore");
            generic.Vid = 0;
            generic.Pid = 0;
            runtime.Devices.Add(generic);
            runtime.Devices.Add(integrated);

            using var service = new DeviceScreenService(
                runtime,
                () => new TelemetryFrame(),
                _ => new FakeScreenDriver());
            service.Sync();

            Assert.Contains("integrated-wheel", service.ActiveDeviceIds);
            Assert.DoesNotContain("generic-vocore", service.ActiveDeviceIds);
            Assert.Equal(
                ScreenConnectionState.DeviceConflict,
                service.StatusFor("generic-vocore")?.State);
            Assert.Contains(
                "integrated-wheel",
                service.StatusFor("generic-vocore")?.Detail,
                StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void DiagnosticsCanSelectATestPatternForAnActiveScreen()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            runtime.Devices.Add(ScreenDevice("screen-a"));

            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => new FakeScreenDriver());
            service.Sync();

            Assert.True(service.SetTestPattern("screen-a", ScreenTestPattern.ColorBars));
            Assert.Equal(ScreenTestPattern.ColorBars, service.TestPatternFor("screen-a"));
            Assert.False(service.SetTestPattern("missing", ScreenTestPattern.Red));
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void ScreenLifecycleAndTestActionsAreWrittenToDiagnostics()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            runtime.Devices.Add(ScreenDevice("screen-a"));
            var log = new LiveLogStore();

            using var service = new DeviceScreenService(
                runtime,
                () => new TelemetryFrame(),
                _ => new FakeScreenDriver(),
                log);
            service.Sync();
            service.SetTestPattern("screen-a", ScreenTestPattern.Blue);

            Assert.Contains(log.Entries, entry =>
                entry.Message.Contains("screen-a", StringComparison.Ordinal)
                && entry.Message.Contains("publisher", StringComparison.OrdinalIgnoreCase));
            Assert.Contains(log.Entries, entry =>
                entry.Message.Contains("screen-a", StringComparison.Ordinal)
                && entry.Message.Contains("Blue", StringComparison.Ordinal));
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void AddDeviceGeneratesUniqueIdsEvenAfterRemoval()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var generic = runtime.Catalog.First(entry => entry.Vid == 0 && entry.Pid == 0); // SIM serial path

            var a = runtime.AddDevice(generic);
            var b = runtime.AddDevice(generic);
            Assert.NotEqual(a.Id, b.Id);

            runtime.RemoveDevice(a);
            var c = runtime.AddDevice(generic);

            // The re-added device must not collide with the surviving one.
            Assert.NotEqual(b.Id, c.Id);
            Assert.Equal(runtime.Devices.Count, runtime.Devices.Select(device => device.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SyncToleratesDuplicateDeviceIdsWithoutThrowing()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            runtime.Devices.Add(ScreenDevice("dup"));
            runtime.Devices.Add(ScreenDevice("dup")); // defensively identical id

            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => new FakeScreenDriver());
            service.Sync(); // must not throw on the duplicate key
            Assert.Contains("dup", service.ActiveDeviceIds);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void SyncStopsPublisherWhenDeviceDisabled()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var device = ScreenDevice("screen-a");
            runtime.Devices.Add(device);

            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => new FakeScreenDriver());
            service.Sync();
            Assert.Contains("screen-a", service.ActiveDeviceIds);

            device.Disabled = true;
            service.Sync();
            Assert.DoesNotContain("screen-a", service.ActiveDeviceIds);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
