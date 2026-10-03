using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;

namespace Sprint.Desktop.Host;

/// <summary>Real link status and delivery performance for one device's active screen output.</summary>
public sealed record ScreenOutputHardware(ScreenStatus Status, ScreenPerformanceSnapshot Performance);

public enum ScreenFramePublishResult
{
    /// <summary>The frame was copied into the device's exchange for its publisher to pick up.</summary>
    Routed,

    /// <summary>No active output exists for this device (disabled, non-dash, or not yet reconciled).</summary>
    NoActiveOutput,

    /// <summary>The posted frame's size does not match the device's configured logical size.</summary>
    DimensionMismatch,
}

/// <summary>
/// Connects frames POSTed by Electron's offscreen browsers (<c>POST /api/screens/{id}/frame</c>)
/// to real USB screens — the last mile <see cref="FrameStore"/> alone cannot reach — and, for the
/// rear-view mirror purpose, captures the desktop natively (no browser involved at all). One
/// <see cref="ScreenPublisher"/> runs per enabled screen device whose purpose has an implemented
/// output (the same selection <see cref="ScreenOutputs.Describe"/> uses, via
/// <see cref="DeviceCapabilities.DrivesScreenOutput"/>, so the devices Electron is told about are
/// exactly the devices this service drives to hardware): a dashboard/flag-display/lap-timer device
/// pulls its latest received BGRA frame through a <see cref="BrowserFrameSource"/>, and a rear-view
/// mirror device captures its stored desktop region directly through a
/// <see cref="DesktopCaptureFrameSource"/> — either way pushing native RGB565 to its
/// <see cref="IScreenDriver"/>. <see cref="Reconcile"/> is idempotent and safe to call repeatedly:
/// it only tears down and rebuilds the outputs whose device configuration actually changed.
/// </summary>
public sealed class ScreenOutputService : IDisposable
{
    /// <summary>Creates the driver for one device. Overridable so tests can inject <see cref="FakeScreenDriver"/>.</summary>
    public delegate IScreenDriver DriverFactory(string deviceId, string driver, ILog log);

    // ScreenPublisher's frame provider exists for the dash-painting path (matrix WS7); neither the
    // browser render path (BrowserFrameSource.Render only inspects rgb565) nor desktop capture
    // reads it, so one shared placeholder instance is all every output needs.
    private static readonly TelemetryFrame UnusedFrame = new();

    /// <summary>The device fields that decide driver identity/output config; a change to any of
    /// these forces a rebuild. Deliberately excludes <see cref="SavedDevice.DashId"/>: which
    /// layout is rendered is Electron's concern (it reads <see cref="ScreenOutputs.Describe"/>
    /// and posts whatever it rendered), not this service's — rebuilding a hardware output just
    /// because the assigned dash changed would needlessly drop the USB link.</summary>
    private sealed record OutputConfig(
        string Driver,
        ushort Vid,
        ushort Pid,
        int Width,
        int Height,
        DeviceOrientation Orientation,
        int OffsetX,
        int OffsetY,
        int Margin,
        int RefreshHz,
        string Purpose,
        ScreenCaptureRegion? CaptureRegion)
    {
        public static OutputConfig From(SavedDevice device) => new(
            device.Driver,
            device.Vid,
            device.Pid,
            device.Width,
            device.Height,
            device.Orientation,
            device.OffsetX,
            device.OffsetY,
            device.Margin,
            DeviceRefreshRates.Normalize(device.RefreshHz),
            DevicePurposes.Normalize(device.Purpose),
            device.CaptureRegion);
    }

    /// <summary>
    /// <paramref name="Exchange"/>/<paramref name="ProducerGate"/> are null for a rear-view
    /// mirror output: <see cref="DesktopCaptureFrameSource"/> captures the desktop itself and
    /// never receives a POSTed frame, so there is nothing for <see cref="PublishFrameAsync"/> to
    /// route into.
    /// </summary>
    private sealed record Output(
        OutputConfig Config,
        LatestBgraFrameExchange? Exchange,
        SemaphoreSlim? ProducerGate,
        ScreenPublisher Publisher);

    private readonly object _sync = new();
    private readonly Dictionary<string, Output> _outputs = new(StringComparer.OrdinalIgnoreCase);

    // Devices that lost Reconcile's duplicate-physical-screen tie-break: no output was ever
    // created for them, so HardwareFor reports this instead of silently returning null (a
    // caller can't otherwise tell "not yet reconciled" from "another saved device owns this
    // USB screen"). Rebuilt from scratch on every Reconcile call, same as _outputs.
    private readonly Dictionary<string, ScreenOutputHardware> _conflicts = new(StringComparer.OrdinalIgnoreCase);
    private readonly ILog _log;
    private readonly DriverFactory _driverFactory;
    private readonly IDesktopRegionCapturer _desktopCapturer;
    private readonly bool _ownsDesktopCapturer;
    private bool _disposed;

    public ScreenOutputService(
        ILog? log = null,
        DriverFactory? driverFactory = null,
        IDesktopRegionCapturer? desktopCapturer = null)
    {
        _log = log ?? NullLog.Instance;
        _driverFactory = driverFactory ?? ((_, driver, driverLog) => ScreenDriverFactory.Create(driver, driverLog));
        _ownsDesktopCapturer = desktopCapturer is null;
        _desktopCapturer = desktopCapturer ?? new WindowsDesktopRegionCapturer();
    }

    /// <summary>Device ids with an active output (for tests/diagnostics).</summary>
    public IReadOnlyCollection<string> ActiveDeviceIds
    {
        get
        {
            lock (_sync)
            {
                return _outputs.Keys.ToArray();
            }
        }
    }

    /// <summary>Real link status and delivery performance for a device, or null when it has no
    /// active output and never lost a duplicate-physical-screen tie-break (see
    /// <see cref="Reconcile"/>).</summary>
    public ScreenOutputHardware? HardwareFor(string deviceId)
    {
        lock (this._sync)
        {
            if (this._outputs.TryGetValue(deviceId, out Output? output))
            {
                return new ScreenOutputHardware(output.Publisher.Status, output.Publisher.Performance);
            }

            return this._conflicts.TryGetValue(deviceId, out ScreenOutputHardware? conflict) ? conflict : null;
        }
    }

    /// <summary>
    /// Reconciles running outputs against the enabled dashboard devices. Starts outputs for
    /// newly enabled/added devices, stops outputs for removed/disabled/non-dash devices, and
    /// rebuilds any whose driver-relevant configuration changed (orientation, size, refresh
    /// rate, driver, VID/PID, offsets, margin). Safe to call on a timer; a call that changes
    /// nothing does no work.
    /// <para>
    /// Two saved devices can target the very same physical VoCore/USBD480 screen (e.g. a
    /// duplicated device, or two catalog entries for one panel). Only the first one — a
    /// concrete VID/PID wins over a generic/auto-detect (PID 0) entry — gets an output; the
    /// loser never opens a second handle onto hardware that can only serve one owner, and its
    /// honest state is reported through <see cref="HardwareFor"/> as
    /// <see cref="ScreenConnectionState.DeviceConflict"/> instead of it silently going dark
    /// (mirrors the deleted Avalonia client's <c>DeviceScreenService.TargetsSamePhysicalScreen</c>).
    /// </para>
    /// </summary>
    public void Reconcile(IEnumerable<SavedDevice> devices)
    {
        ArgumentNullException.ThrowIfNull(devices);
        if (_disposed)
        {
            return;
        }

        List<SavedDevice> candidates = [];
        foreach (SavedDevice device in devices)
        {
            if (!device.Disabled && DeviceCapabilities.DrivesScreenOutput(device))
            {
                candidates.Add(device);
            }
        }

        Dictionary<string, SavedDevice> desired = new(StringComparer.OrdinalIgnoreCase);
        Dictionary<string, ScreenOutputHardware> conflicts = new(StringComparer.OrdinalIgnoreCase);
        foreach (SavedDevice device in candidates.OrderBy(
            item => ScreenUsbIdentity.ForDriver(item.Driver, item.Vid, item.Pid).Pid == 0 ? 1 : 0))
        {
            SavedDevice? owner = desired.Values.FirstOrDefault(existing => TargetsSamePhysicalScreen(existing, device));
            if (owner is null)
            {
                desired[device.Id] = device;
                continue;
            }

            string detail =
                $"Saved device '{owner.Name}' ({owner.Id}) already targets the same {device.Driver} USB screen.";
            conflicts[device.Id] = new ScreenOutputHardware(
                new ScreenStatus { State = ScreenConnectionState.DeviceConflict, Detail = detail },
                ScreenPerformanceSnapshot.Empty);
            this._log.Warn($"Duplicate screen target suppressed: device={device.Id} owner={owner.Id}.");
        }

        List<(string Id, Output Output)> stopping = [];
        List<SavedDevice> starting = [];
        lock (_sync)
        {
            foreach (string id in _outputs.Keys.ToList())
            {
                Output output = _outputs[id];
                if (!desired.TryGetValue(id, out SavedDevice? device) || output.Config != OutputConfig.From(device))
                {
                    stopping.Add((id, output));
                    _outputs.Remove(id);
                }
            }

            foreach ((string id, SavedDevice device) in desired)
            {
                if (_outputs.ContainsKey(id))
                {
                    continue;
                }

                Output output = CreateOutput(device);
                _outputs[id] = output;
                starting.Add(device);
            }

            this._conflicts.Clear();
            foreach ((string id, ScreenOutputHardware hardware) in conflicts)
            {
                this._conflicts[id] = hardware;
            }
        }

        foreach ((string id, Output output) in stopping)
        {
            _log.Info($"Screen output stopping: device={id}.");
            output.Publisher.Dispose();
            output.ProducerGate?.Dispose();
        }
    }

    /// <summary>Whether <paramref name="left"/> and <paramref name="right"/> would open the same
    /// physical VoCore/USBD480 USB screen — same driver, same VID, and either PID matches or one
    /// side is a generic/auto-detect entry (PID 0). Any other driver (e.g. "fake" in tests) never
    /// conflicts: only these two are ever bound to one physical panel.</summary>
    private static bool TargetsSamePhysicalScreen(SavedDevice left, SavedDevice right)
    {
        if (!string.Equals(left.Driver, right.Driver, StringComparison.OrdinalIgnoreCase)
            || (!string.Equals(left.Driver, "vocore", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(left.Driver, "usbd480", StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        ScreenUsbIdentity leftIdentity = ScreenUsbIdentity.ForDriver(left.Driver, left.Vid, left.Pid);
        ScreenUsbIdentity rightIdentity = ScreenUsbIdentity.ForDriver(right.Driver, right.Vid, right.Pid);
        return leftIdentity.Vid == rightIdentity.Vid
            && (leftIdentity.Pid == 0
                || rightIdentity.Pid == 0
                || leftIdentity.Pid == rightIdentity.Pid);
    }

    /// <summary>
    /// Writes panel sizes learned at connect time back onto <paramref name="devices"/>: a
    /// USBD480 NX reports its real dimensions once connected, and a generic/auto-detect entry
    /// starts with a placeholder guess -- without this the publisher renders at the correct
    /// native size while the saved device (and therefore <c>/api/state</c>'s <c>screens</c>, the
    /// size Electron is told to render at, and any dash sizing) keeps the stale guess. Mutates
    /// matching devices in place (mirrors the deleted Avalonia client's
    /// <c>DeviceScreenService.AdoptDetectedResolutions</c>) and returns true when anything
    /// changed, so the caller knows to persist. Call before <see cref="Reconcile"/> in the same
    /// tick so a just-adopted size rebuilds its output immediately instead of one tick late.
    /// </summary>
    public bool AdoptDetectedResolutions(IEnumerable<SavedDevice> devices)
    {
        ArgumentNullException.ThrowIfNull(devices);

        Dictionary<string, ScreenNativeSize> detected = new(StringComparer.OrdinalIgnoreCase);
        lock (_sync)
        {
            foreach ((string id, Output output) in _outputs)
            {
                if (output.Publisher.DetectedNativeSize is { IsValid: true } size)
                {
                    detected[id] = size;
                }
            }
        }

        bool changed = false;
        foreach (SavedDevice device in devices)
        {
            if (!detected.TryGetValue(device.Id, out ScreenNativeSize size)
                || (device.Width == size.Width && device.Height == size.Height))
            {
                continue;
            }

            _log.Info(
                $"Screen resolution adopted from hardware: device={device.Id} " +
                $"saved={device.Width}x{device.Height} detected={size.Width}x{size.Height}.");
            device.Width = size.Width;
            device.Height = size.Height;
            changed = true;
        }

        return changed;
    }

    /// <summary>
    /// Routes one BGRA frame to its device's active output. Only copies into the shared
    /// exchange and marks it published — the USB write happens later, on the publisher's own
    /// background thread — so this never blocks on hardware and the HTTP request it backs
    /// stays fast regardless of USB latency or a stalled device.
    /// </summary>
    public async Task<ScreenFramePublishResult> PublishFrameAsync(
        string deviceId,
        int width,
        int height,
        ReadOnlyMemory<byte> bgra,
        CancellationToken cancellationToken)
    {
        Output? output;
        lock (_sync)
        {
            _outputs.TryGetValue(deviceId, out output);
        }

        if (output is null || output.Exchange is null || output.ProducerGate is null)
        {
            // Null Exchange/ProducerGate for a rear-view mirror output (captures the desktop
            // itself; Electron never posts a frame for it), same result as no active output.
            return ScreenFramePublishResult.NoActiveOutput;
        }

        if (output.Exchange.Width != width || output.Exchange.Height != height)
        {
            return ScreenFramePublishResult.DimensionMismatch;
        }

        await output.ProducerGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            bgra.Span.CopyTo(output.Exchange.ProducerBuffer);
            output.Exchange.Publish();
        }
        finally
        {
            output.ProducerGate.Release();
        }

        return ScreenFramePublishResult.Routed;
    }

    private Output CreateOutput(SavedDevice device)
    {
        ScreenConfig config = new()
        {
            Vid = device.Vid,
            Pid = device.Pid,
            Width = device.Width,
            Height = device.Height,
            Orientation = device.Orientation,
            OffsetX = device.OffsetX,
            OffsetY = device.OffsetY,
            Margin = device.Margin,
            Driver = device.Driver,
            TargetFps = DeviceRefreshRates.Normalize(device.RefreshHz),
        };

        IScreenDriver driver = _driverFactory(device.Id, device.Driver, _log);
        driver.Configure(config);

        DevicePurpose purpose = DevicePurposes.Resolve(device.Purpose);
        Output output = purpose.Output is DevicePurposeOutputKind.DesktopCaptureRegion
            ? CreateCaptureOutput(device, config, driver)
            : CreateBrowserOutput(device, config, driver);

        _log.Info(
            $"Screen output starting: device={device.Id} driver={device.Driver} purpose={purpose.Id} " +
            $"vid=0x{device.Vid:X4} pid=0x{device.Pid:X4} size={device.Width}x{device.Height}.");
        return output;
    }

    /// <summary>
    /// The dashboard/flag-display/lap-timer path: Electron paints the layout in an offscreen
    /// browser and POSTs the BGRA result, which <see cref="BrowserFrameSource"/> composes onto
    /// the panel.
    /// </summary>
    private Output CreateBrowserOutput(SavedDevice device, ScreenConfig config, IScreenDriver driver)
    {
        DeviceOrientationTransform transform = DeviceOrientations.Transform(device.Width, device.Height, device.Orientation);
        LatestBgraFrameExchange exchange = new(transform.LogicalWidth, transform.LogicalHeight);
        BrowserFrameSource source = new(exchange, config);
        ScreenPublisher publisher = new(
            driver,
            source,
            () => UnusedFrame,
            new ScreenPublisherOptions { TargetFps = config.TargetFps },
            _log,
            device.Id);
        publisher.Start();
        return new Output(OutputConfig.From(device), exchange, new SemaphoreSlim(1, 1), publisher);
    }

    /// <summary>
    /// The rear-view mirror path: no browser involved. <see cref="DesktopCaptureFrameSource"/>
    /// captures the device's stored desktop region natively on the publisher's own render loop.
    /// <see cref="DeviceCapabilities.DrivesScreenOutput"/> already requires a valid
    /// <see cref="SavedDevice.CaptureRegion"/> for this purpose to be a candidate at all, so the
    /// null-region case below is defensive rather than reachable through <see cref="Reconcile"/>.
    /// </summary>
    private Output CreateCaptureOutput(SavedDevice device, ScreenConfig config, IScreenDriver driver)
    {
        ScreenCaptureRegion region = device.CaptureRegion
            ?? throw new InvalidOperationException("Rear-view mirror capture area is not configured.");
        DesktopCaptureFrameSource source = new(region, config, _desktopCapturer);
        ScreenPublisher publisher = new(
            driver,
            source,
            () => UnusedFrame,
            new ScreenPublisherOptions { TargetFps = config.TargetFps },
            _log,
            device.Id);
        publisher.Start();
        return new Output(OutputConfig.From(device), null, null, publisher);
    }

    /// <summary>Stops every active output: disconnects and disposes each driver, and joins each publisher's threads.</summary>
    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        List<Output> outputs;
        lock (_sync)
        {
            outputs = _outputs.Values.ToList();
            _outputs.Clear();
            this._conflicts.Clear();
        }

        foreach (Output output in outputs)
        {
            output.Publisher.Dispose();
            output.ProducerGate?.Dispose();
        }

        if (_ownsDesktopCapturer && _desktopCapturer is IDisposable disposableCapturer)
        {
            disposableCapturer.Dispose();
        }
    }
}
