using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Screen refresh rate (issue #75): one persisted rate per device that reaches the
/// hardware publisher. Before this existed the publisher always ran at a hardcoded 30
/// fps and the live preview animated at the shell tick, so the setting could not be
/// observed anywhere.
/// </summary>
public sealed class DeviceRefreshRateTests
{
    [Theory]
    [InlineData(0, 30)]
    [InlineData(-5, 30)]
    [InlineData(30, 30)]
    [InlineData(60, 60)]
    [InlineData(5, 5)]
    [InlineData(45, 30)] // unsupported → nearest supported rate; a tie rounds down
    [InlineData(50, 60)]
    [InlineData(7, 5)]
    [InlineData(1000, 60)]
    public void NormalizeSnapsOntoTheSupportedRates(int stored, int expected) =>
        Assert.Equal(expected, DeviceRefreshRates.Normalize(stored));

    [Fact]
    public void LabelsRoundTripForTheDropdown()
    {
        Assert.Equal(DeviceRefreshRates.All.Count, DeviceRefreshRates.Labels.Count);
        Assert.Equal("30 Hz", DeviceRefreshRates.Label(30));
        Assert.Equal(30, DeviceRefreshRates.ForLabel("30 Hz"));
        Assert.Equal(60, DeviceRefreshRates.ForLabel(" 60 hz "));
        Assert.Null(DeviceRefreshRates.ForLabel("144 Hz"));
        Assert.Null(DeviceRefreshRates.ForLabel(null));
    }

    [Fact]
    public void IntervalMatchesTheRate()
    {
        Assert.Equal(TimeSpan.FromSeconds(1.0 / 30), DeviceRefreshRates.Interval(30));
        Assert.Equal(TimeSpan.FromSeconds(1.0 / 60), DeviceRefreshRates.Interval(60));
        // An unsupported rate is snapped before the interval is derived.
        Assert.Equal(TimeSpan.FromSeconds(1.0 / 30), DeviceRefreshRates.Interval(45));
    }

    [Fact]
    public void PublisherRunsAtTheDeviceRate()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var device = new SavedDevice
            {
                Id = "screen",
                Name = "Screen",
                Type = "screen",
                Driver = "vocore",
                Width = 480,
                Height = 800,
                DashId = "default",
                RefreshHz = 15,
            };
            runtime.Devices.Add(device);

            var driver = new FakeScreenDriver();
            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => driver);
            service.Sync();

            Assert.Equal(15, driver.LastConfig!.TargetFps);

            runtime.UpdateDeviceRefreshHz(device, 60);
            Assert.Equal(60, device.RefreshHz);

            // A reload must keep the rate; unsupported values are normalized on load.
            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            Assert.Equal(60, reloaded.Devices.Single(item => item.Id == "screen").RefreshHz);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void UnsetRateLoadsAsTheDefault()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            // A devices.json written before the setting existed has no rate at all.
            runtime.Devices.Add(new SavedDevice
            {
                Id = "legacy",
                Name = "Legacy",
                Type = "screen",
                Driver = "vocore",
                Width = 480,
                Height = 800,
                RefreshHz = 0,
            });
            runtime.SaveDevices();

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            Assert.Equal(DeviceRefreshRates.Default, reloaded.Devices.Single().RefreshHz);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
