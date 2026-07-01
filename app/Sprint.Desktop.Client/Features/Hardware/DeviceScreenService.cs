using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Coordinates hardware screen output for the shell (matrix 4.6 US31/US32): keeps
/// a <see cref="ScreenPublisher"/> running for every enabled screen device,
/// reconciled against the saved-device list on <see cref="Sync"/>. Each publisher
/// pairs a driver (from <see cref="ScreenDriverFactory"/>) with a
/// <see cref="DashPainterFrameSource"/> rendering the device's assigned dash. The
/// driver factory is injectable so tests drive the whole path with a
/// <see cref="FakeScreenDriver"/>. Per-device link status feeds the Devices UI.
/// </summary>
public sealed class DeviceScreenService : IDisposable
{
    private readonly IDesktopRuntime _runtime;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly Func<string, IScreenDriver> _driverFactory;
    private readonly Dictionary<string, ScreenPublisher> _publishers = new(StringComparer.OrdinalIgnoreCase);
    private bool _disposed;

    public DeviceScreenService(
        IDesktopRuntime runtime,
        Func<TelemetryFrame> frameProvider,
        Func<string, IScreenDriver>? driverFactory = null)
    {
        _runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        _frameProvider = frameProvider ?? throw new ArgumentNullException(nameof(frameProvider));
        _driverFactory = driverFactory ?? ScreenDriverFactory.Create;
    }

    /// <summary>Device ids with an active publisher (for the UI / tests).</summary>
    public IReadOnlyCollection<string> ActiveDeviceIds => _publishers.Keys.ToArray();

    /// <summary>The current link status for a device, or null when no publisher is running for it.</summary>
    public ScreenStatus? StatusFor(string deviceId) =>
        _publishers.TryGetValue(deviceId, out var publisher) ? publisher.Status : null;

    /// <summary>Reconciles running publishers with the enabled screen devices. Idempotent.</summary>
    public void Sync()
    {
        if (_disposed)
        {
            return;
        }

        var desired = _runtime.Devices
            .Where(device => string.Equals(device.Type, "screen", StringComparison.OrdinalIgnoreCase)
                && !device.Disabled
                && device.Width > 0
                && device.Height > 0)
            .ToDictionary(device => device.Id, StringComparer.OrdinalIgnoreCase);

        foreach (var id in _publishers.Keys.Where(id => !desired.ContainsKey(id)).ToArray())
        {
            _publishers[id].Dispose();
            _publishers.Remove(id);
        }

        foreach (var (id, device) in desired)
        {
            if (!_publishers.ContainsKey(id))
            {
                var publisher = CreatePublisher(device);
                publisher.Start();
                _publishers[id] = publisher;
            }
        }
    }

    private ScreenPublisher CreatePublisher(SavedDevice device)
    {
        var config = new ScreenConfig
        {
            Vid = device.Vid,
            Pid = device.Pid,
            Width = device.Width,
            Height = device.Height,
            Rotation = device.Rotation,
            OffsetX = device.OffsetX,
            OffsetY = device.OffsetY,
            Margin = device.Margin,
            Driver = device.Driver,
        };

        var driver = _driverFactory(device.Driver);
        driver.Configure(config);

        var layout = _runtime.DashLayouts.FirstOrDefault(item => string.Equals(item.Id, device.DashId, StringComparison.OrdinalIgnoreCase))
            ?? _runtime.DashLayouts.FirstOrDefault(item => item.IsDefault)
            ?? _runtime.DashLayouts.First();
        var source = new DashPainterFrameSource(layout, _runtime.Settings, config);

        return new ScreenPublisher(driver, source, _frameProvider, new ScreenPublisherOptions { TargetFps = config.TargetFps });
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var publisher in _publishers.Values)
        {
            publisher.Dispose();
        }

        _publishers.Clear();
    }
}
