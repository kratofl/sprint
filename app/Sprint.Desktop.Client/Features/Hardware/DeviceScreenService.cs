using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;

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
    private readonly ILog _log;
    private readonly Dictionary<string, ScreenPublisher> _publishers = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _publisherLayoutIds = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, ScreenStatus> _inactiveStatuses = new(StringComparer.OrdinalIgnoreCase);
    private bool _disposed;

    public DeviceScreenService(
        IDesktopRuntime runtime,
        Func<TelemetryFrame> frameProvider,
        Func<string, IScreenDriver>? driverFactory = null,
        ILog? log = null)
    {
        _runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        _frameProvider = frameProvider ?? throw new ArgumentNullException(nameof(frameProvider));
        _log = log ?? NullLog.Instance;
        _driverFactory = driverFactory ?? (driver => ScreenDriverFactory.Create(driver, _log));
    }

    /// <summary>Device ids with an active publisher (for the UI / tests).</summary>
    public IReadOnlyCollection<string> ActiveDeviceIds => _publishers.Keys.ToArray();

    /// <summary>The current link status for a device, or null when no publisher is running for it.</summary>
    public ScreenStatus? StatusFor(string deviceId) =>
        _publishers.TryGetValue(deviceId, out var publisher)
            ? publisher.Status
            : _inactiveStatuses.GetValueOrDefault(deviceId);

    public ScreenTestPattern? TestPatternFor(string deviceId) =>
        _publishers.TryGetValue(deviceId, out var publisher) ? publisher.TestPattern : null;

    public bool SetTestPattern(string deviceId, ScreenTestPattern pattern)
    {
        if (!_publishers.TryGetValue(deviceId, out var publisher))
        {
            _log.Warn($"Screen test pattern ignored: device={deviceId} is not active.");
            return false;
        }

        publisher.SetTestPattern(pattern);
        _log.Info($"Screen test pattern selected: device={deviceId} pattern={pattern}.");
        return true;
    }

    /// <summary>Reconciles running publishers with the enabled screen devices. Idempotent.</summary>
    public void Sync()
    {
        if (_disposed)
        {
            return;
        }

        // Build with an indexer (last-wins) rather than ToDictionary: two saved
        // devices can transiently share an Id, and ToDictionary would throw and
        // crash the calling UI action. Reconciliation just tracks one publisher
        // per id, which is the correct behaviour for same-id devices.
        var candidates = new Dictionary<string, SavedDevice>(StringComparer.OrdinalIgnoreCase);
        foreach (var device in _runtime.Devices)
        {
            if (DeviceCapabilities.HasScreen(device) && !device.Disabled)
            {
                candidates[device.Id] = device;
            }
        }

        _inactiveStatuses.Clear();
        var desired = new Dictionary<string, SavedDevice>(StringComparer.OrdinalIgnoreCase);
        foreach (var device in candidates.Values
                     .OrderBy(item => ScreenUsbIdentity.ForDriver(item.Driver, item.Vid, item.Pid).Pid == 0 ? 1 : 0))
        {
            var owner = desired.Values.FirstOrDefault(existing => TargetsSamePhysicalScreen(existing, device));
            if (owner is null)
            {
                desired[device.Id] = device;
                continue;
            }

            var detail =
                $"Saved device '{owner.Name}' ({owner.Id}) already targets the same " +
                $"{device.Driver} USB screen.";
            _inactiveStatuses[device.Id] = new ScreenStatus
            {
                State = ScreenConnectionState.DeviceConflict,
                Detail = detail,
            };
            _log.Warn($"Duplicate screen target suppressed: device={device.Id} owner={owner.Id}.");
        }

        foreach (var id in _publishers.Keys.Where(id => !desired.ContainsKey(id)).ToArray())
        {
            _log.Info($"Screen publisher stopping: device={id}.");
            _publishers[id].Dispose();
            _publishers.Remove(id);
            _publisherLayoutIds.Remove(id);
        }

        foreach (var (id, device) in desired)
        {
            // A running publisher keeps rendering the layout captured at start,
            // so a dash reassignment needs a restart to take effect.
            if (_publishers.TryGetValue(id, out var running))
            {
                var assigned = ResolveLayout(device).Id;
                if (_publisherLayoutIds.TryGetValue(id, out var active)
                    && string.Equals(active, assigned, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                _log.Info($"Screen publisher restarting for dash change: device={id} dash={assigned}.");
                running.Dispose();
                _publishers.Remove(id);
                _publisherLayoutIds.Remove(id);
            }

            _log.Info(
                $"Screen publisher starting: device={id} driver={device.Driver} " +
                $"vid=0x{device.Vid:X4} pid=0x{device.Pid:X4} size={device.Width}x{device.Height}.");
            var publisher = CreatePublisher(device);
            publisher.Start();
            _publishers[id] = publisher;
        }
    }

    private DashLayout ResolveLayout(SavedDevice device) =>
        _runtime.DashLayouts.FirstOrDefault(item => string.Equals(item.Id, device.DashId, StringComparison.OrdinalIgnoreCase))
            ?? _runtime.DashLayouts.FirstOrDefault(item => item.IsDefault)
            ?? _runtime.DashLayouts.First();

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

        var layout = ResolveLayout(device);
        _publisherLayoutIds[device.Id] = layout.Id;
        IDashFrameSource CreateSource(int width, int height) =>
            new DashPainterFrameSource(
                layout,
                _runtime.Settings,
                config with { Width = width, Height = height },
                DashPalette.FromLayout(layout));
        var source = CreateSource(config.Width, config.Height);

        return new ScreenPublisher(
            driver,
            source,
            _frameProvider,
            new ScreenPublisherOptions { TargetFps = config.TargetFps },
            _log,
            device.Id,
            CreateSource);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _log.Info($"Screen service stopping: publishers={_publishers.Count}.");
        foreach (var publisher in _publishers.Values)
        {
            publisher.Dispose();
        }

        _publishers.Clear();
        _publisherLayoutIds.Clear();
        _inactiveStatuses.Clear();
    }

    private static bool TargetsSamePhysicalScreen(SavedDevice left, SavedDevice right)
    {
        if (!string.Equals(left.Driver, right.Driver, StringComparison.OrdinalIgnoreCase)
            || (!string.Equals(left.Driver, "vocore", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(left.Driver, "usbd480", StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        var leftIdentity = ScreenUsbIdentity.ForDriver(left.Driver, left.Vid, left.Pid);
        var rightIdentity = ScreenUsbIdentity.ForDriver(right.Driver, right.Vid, right.Pid);
        return leftIdentity.Vid == rightIdentity.Vid
            && (leftIdentity.Pid == 0
                || rightIdentity.Pid == 0
                || leftIdentity.Pid == rightIdentity.Pid);
    }
}
