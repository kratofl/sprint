using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
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
