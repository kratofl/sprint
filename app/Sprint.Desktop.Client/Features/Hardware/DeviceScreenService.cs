using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Coordinates hardware screen output for the shell (matrix 4.6 US31/US32): keeps
/// a <see cref="ScreenPublisher"/> running for every enabled screen device,
/// reconciled against the saved-device list on <see cref="Sync"/>. Each publisher
/// pairs a driver (from <see cref="ScreenDriverFactory"/>) with the frame source
/// selected by the device purpose: a dash painter or a desktop capture. The
/// driver factory is injectable so tests drive the whole path with a
/// <see cref="FakeScreenDriver"/>. Per-device link status feeds the Devices UI.
/// </summary>
public sealed class DeviceScreenService : IDisposable
{
    private readonly IDesktopRuntime _runtime;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly Func<string, IScreenDriver> _driverFactory;
    private readonly IDesktopRegionCapturer _desktopCapturer;
    private readonly bool _ownsDesktopCapturer;
    private readonly ILog _log;
    private readonly Dictionary<string, ScreenPublisher> _publishers = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _publisherOutputKeys = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, ScreenStatus> _inactiveStatuses = new(StringComparer.OrdinalIgnoreCase);
    private bool _disposed;

    public DeviceScreenService(
        IDesktopRuntime runtime,
        Func<TelemetryFrame> frameProvider,
        Func<string, IScreenDriver>? driverFactory = null,
        ILog? log = null,
        IDesktopRegionCapturer? desktopCapturer = null)
    {
        _runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        _frameProvider = frameProvider ?? throw new ArgumentNullException(nameof(frameProvider));
        _log = log ?? NullLog.Instance;
        _driverFactory = driverFactory ?? (driver => ScreenDriverFactory.Create(driver, _log));
        _ownsDesktopCapturer = desktopCapturer is null;
        _desktopCapturer = desktopCapturer ?? new WindowsDesktopRegionCapturer();
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

    /// <summary>
    /// Writes panel sizes learned at connect time back onto the saved devices. A
    /// USBD480 NX reports its real dimensions, and a generic entry is added with a
    /// placeholder resolution — without this the publisher rendered at the correct
    /// native size while the saved device (and therefore the resolution chip, the
    /// detail preview, and any dash sizing) kept the stale guess. Returns true when
    /// something changed, so the caller can refresh the view.
    /// </summary>
    public bool AdoptDetectedResolutions()
    {
        var changed = false;
        foreach (var (deviceId, publisher) in _publishers)
        {
            if (publisher.DetectedNativeSize is not { IsValid: true } detected)
            {
                continue;
            }

            var device = _runtime.Devices.FirstOrDefault(item =>
                string.Equals(item.Id, deviceId, StringComparison.OrdinalIgnoreCase));
            if (device is null || (device.Width == detected.Width && device.Height == detected.Height))
            {
                continue;
            }

            _log.Info(
                $"Screen resolution adopted from hardware: device={deviceId} " +
                $"saved={device.Width}x{device.Height} detected={detected.Width}x{detected.Height}.");
            device.Width = detected.Width;
            device.Height = detected.Height;
            changed = true;
        }

        if (changed)
        {
            _runtime.SaveDevices();
        }

        return changed;
    }

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
            if (DeviceCapabilities.DrivesScreenOutput(device) && !device.Disabled)
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
            _publisherOutputKeys.Remove(id);
        }

        foreach (var (id, device) in desired)
        {
            // A running publisher keeps rendering the layout captured at start, so
            // changing either the dashboard assignment or the screen purpose needs a
            // restart to take effect.
            if (_publishers.TryGetValue(id, out var running))
            {
                var assigned = ResolveOutputKey(device);
                if (_publisherOutputKeys.TryGetValue(id, out var active)
                    && string.Equals(active, assigned, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                _log.Info($"Screen publisher restarting for output change: device={id} output={assigned}.");
                running.Dispose();
                _publishers.Remove(id);
                _publisherOutputKeys.Remove(id);
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
        DevicePurposeLayouts.Resolve(device, _runtime.DashLayouts)
        ?? throw new InvalidOperationException(
            $"Device purpose '{device.Purpose}' does not provide a telemetry-backed screen layout.");

    private string ResolveOutputKey(SavedDevice device)
    {
        var purpose = DevicePurposes.Resolve(device.Purpose);
        var source = purpose.Output switch
        {
            DevicePurposeOutputKind.DesktopCaptureRegion when device.CaptureRegion is { IsValid: true } region =>
                $"capture:{region.X}:{region.Y}:{region.Width}:{region.Height}",
            DevicePurposeOutputKind.DesktopCaptureRegion => "capture:unconfigured",
            _ => $"layout:{ResolveLayout(device).Id}",
        };

        return string.Join(
            ':',
            purpose.Id,
            source,
            device.Width,
            device.Height,
            device.Rotation,
            device.OffsetX,
            device.OffsetY,
            device.Margin,
            DeviceRefreshRates.Normalize(device.RefreshHz));
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
            TargetFps = DeviceRefreshRates.Normalize(device.RefreshHz),
        };

        var driver = _driverFactory(device.Driver);
        driver.Configure(config);

        var purpose = DevicePurposes.Resolve(device.Purpose);
        var layout = purpose.Output is DevicePurposeOutputKind.DesktopCaptureRegion
            ? null
            : ResolveLayout(device);
        _publisherOutputKeys[device.Id] = ResolveOutputKey(device);
        IDashFrameSource CreateSource(int width, int height)
        {
            var sizedConfig = config with { Width = width, Height = height };
            if (purpose.Output is DevicePurposeOutputKind.DesktopCaptureRegion)
            {
                return new DesktopCaptureFrameSource(
                    device.CaptureRegion
                    ?? throw new InvalidOperationException("Rear-view mirror capture area is not configured."),
                    sizedConfig,
                    _desktopCapturer);
            }

            return new DashPainterFrameSource(
                layout!,
                _runtime.Settings,
                sizedConfig,
                DashPalette.FromLayout(layout!));
        }

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
        _publisherOutputKeys.Clear();
        _inactiveStatuses.Clear();
        if (_ownsDesktopCapturer && _desktopCapturer is IDisposable disposableCapturer)
        {
            disposableCapturer.Dispose();
        }
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
