using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Input;

namespace Sprint.Desktop.Host;

/// <summary>
/// Real link status and delivery performance for one device's active screen output.
/// <paramref name="Viewers"/> is a browser display's count of pages showing it, null for a USB screen.
/// </summary>
public sealed record ScreenOutputHardware(ScreenStatus Status, ScreenPerformanceSnapshot Performance, int? Viewers = null);

/// <summary>
/// What every dash screen's scene is built from, read by the reconcile loop under the devices gate:
/// the dashes (each device resolves its own, <see cref="DevicePurposeLayouts.Resolve"/>), the
/// driver's name and number, and the active plan's targets.
/// </summary>
public sealed record DashSceneInputs(
    IReadOnlyList<DashLayout> Layouts,
    string DriverName,
    string DriverNumber,
    DashTargets Targets);

/// <summary>
/// Drives the real USB screens. One <see cref="ScreenPublisher"/> runs per enabled screen device
/// whose purpose has an implemented output (<see cref="DeviceCapabilities.DrivesScreenOutput"/>,
/// the same selection <see cref="ScreenOutputs.Describe"/> uses), each on its own thread at the
/// device's refresh rate: a dashboard/flag-display/lap-timer device draws its dash in-process with
/// the Rust renderer (<see cref="NativeDashFrameSource"/>), and a rear-view mirror device captures
/// its stored desktop region (<see cref="DesktopCaptureFrameSource"/>) — either way pushing native
/// RGB565 to its <see cref="IScreenDriver"/>. No browser and no HTTP are on this path.
/// <para>
/// A browser display (<see cref="BrowserDisplays"/>) has no USB link, so it gets no driver and no
/// publisher: it gets the very same scene feed a wheel's renderer reads, handed to the
/// <see cref="BrowserDisplayServer"/>, whose page draws it with the same renderer in WebAssembly.
/// </para>
/// <para>
/// <see cref="Reconcile"/> is idempotent and safe to call repeatedly: it only tears down and
/// rebuilds the outputs whose device configuration actually changed, and hands each dash output its
/// scene, which the output only takes when the scene's bytes changed. The page a wheel button
/// selects, the live/idle switch and a turn of the wheel's multi-dial do not wait for it: each
/// output reads those per frame.
/// </para>
/// </summary>
public sealed class ScreenOutputService : IDisposable
{
    /// <summary>Creates the driver for one device. Overridable so tests can inject <see cref="FakeScreenDriver"/>.</summary>
    public delegate IScreenDriver DriverFactory(string deviceId, string driver, ILog log);

    /// <summary>Creates a dash output's frame source; the default draws with the Rust renderer.
    /// Overridable so tests can inject a source that fails on demand.</summary>
    public delegate IDashFrameSource DashSourceFactory(ScreenConfig config, DashSceneFeed scenes);

    // Desktop capture never reads the telemetry frame; neither does a dash output before the
    // host publishes one (tests without a DesktopState).
    private static readonly TelemetryFrame NoFrame = new();

    /// <summary>The device fields that decide driver identity/output config; a change to any of
    /// these forces a rebuild. Deliberately excludes <see cref="SavedDevice.DashId"/>: a different
    /// dash is a new scene for the running output (<see cref="Reconcile"/>), and rebuilding the
    /// output would needlessly drop the USB link.</summary>
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

    /// <summary><paramref name="Scenes"/> is null for a rear-view mirror output, which has no dash.</summary>
    private sealed record Output(
        OutputConfig Config,
        DashSceneFeed? Scenes,
        ScreenPublisher Publisher);

    private readonly object _sync = new();
    private readonly Dictionary<string, Output> _outputs = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, BrowserDisplay> _browserDisplays = new(StringComparer.OrdinalIgnoreCase);

    // Devices that lost Reconcile's duplicate-physical-screen tie-break: no output was ever
    // created for them, so HardwareFor reports this instead of silently returning null (a
    // caller can't otherwise tell "not yet reconciled" from "another saved device owns this
    // USB screen"). Rebuilt from scratch on every Reconcile call, same as _outputs.
    private readonly Dictionary<string, ScreenOutputHardware> _conflicts = new(StringComparer.OrdinalIgnoreCase);
    private readonly ILog _log;
    private readonly DriverFactory _driverFactory;
    private readonly IDesktopRegionCapturer _desktopCapturer;
    private readonly bool _ownsDesktopCapturer;
    private readonly DesktopState? _telemetry;
    private readonly DashPageCycle? _pageCycle;
    private readonly MultiDialTracker? _multiDials;
    private readonly DashSourceFactory _dashSourceFactory;
    private readonly BrowserDisplayServer? _browserServer;
    private readonly JsonSerializerOptions _json = HostJson.Create();
    private bool _disposed;

    /// <summary>
    /// <paramref name="telemetry"/> is the published telemetry the dash outputs draw (and whose
    /// liveness picks the idle page); <paramref name="pageCycle"/> the page each device's wheel
    /// buttons selected; <paramref name="multiDials"/> where each wheel's multi-dial stands. All are
    /// read on the outputs' own threads and are safe there (an immutable published snapshot, a
    /// concurrent dictionary, a locked tracker). Without them a dash output shows its idle page with
    /// an empty frame and no dial popup. <paramref name="browserServer"/> serves the browser
    /// displays; without it they are left out.
    /// </summary>
    public ScreenOutputService(
        ILog? log = null,
        DriverFactory? driverFactory = null,
        IDesktopRegionCapturer? desktopCapturer = null,
        DesktopState? telemetry = null,
        DashPageCycle? pageCycle = null,
        DashSourceFactory? dashSourceFactory = null,
        BrowserDisplayServer? browserServer = null,
        MultiDialTracker? multiDials = null)
    {
        this._browserServer = browserServer;
        this._log = log ?? NullLog.Instance;
        this._driverFactory = driverFactory ?? ((_, driver, driverLog) => ScreenDriverFactory.Create(driver, driverLog));
        this._ownsDesktopCapturer = desktopCapturer is null;
        this._desktopCapturer = desktopCapturer ?? new WindowsDesktopRegionCapturer();
        this._telemetry = telemetry;
        this._pageCycle = pageCycle;
        this._multiDials = multiDials;
        this._dashSourceFactory = dashSourceFactory ?? ((config, scenes) => new NativeDashFrameSource(config, scenes, this._json));
    }

    /// <summary>Device ids with an active output (for tests/diagnostics).</summary>
    public IReadOnlyCollection<string> ActiveDeviceIds
    {
        get
        {
            lock (this._sync)
            {
                return this._outputs.Keys.ToArray();
            }
        }
    }

    /// <summary>Real link status and delivery performance for a device, or null when it has no
    /// active output and never lost a duplicate-physical-screen tie-break (see
    /// <see cref="Reconcile"/>).</summary>
    public ScreenOutputHardware? HardwareFor(string deviceId)
    {
        if (this._browserServer?.HardwareFor(deviceId) is { } browser)
        {
            return browser;
        }

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
    /// <para>
    /// <paramref name="scenes"/> builds each dash output's scene (its dash, settings and targets),
    /// serialized here on the caller's thread: a new output starts with it, a running one takes it
    /// only when its bytes changed. Without it a new dash output starts with no dash (a dark
    /// screen) and a running one keeps what it has. <paramref name="catalog"/> (the device presets)
    /// gives each wheel output its multi-dial the same way; without it a new output has no dial
    /// popup and a running one keeps what it has.
    /// </para>
    /// </summary>
    public void Reconcile(IEnumerable<SavedDevice> devices, DashSceneInputs? scenes = null, IReadOnlyList<CatalogDevice>? catalog = null)
    {
        ArgumentNullException.ThrowIfNull(devices);
        if (this._disposed)
        {
            return;
        }

        List<SavedDevice> candidates = [];
        List<SavedDevice> browser = [];
        foreach (SavedDevice device in devices)
        {
            if (!device.Disabled && DeviceCapabilities.DrivesScreenOutput(device))
            {
                (BrowserDisplays.Is(device) ? browser : candidates).Add(device);
            }
        }

        if (this._browserServer is null)
        {
            browser.Clear();
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

        Dictionary<string, DashSceneContent?> contents = this.BuildScenes(desired.Values.Concat(browser), scenes);
        List<(string Id, Output Output)> stopping = [];
        List<BrowserDisplay> served;
        lock (this._sync)
        {
            foreach (string id in this._outputs.Keys.ToList())
            {
                Output output = this._outputs[id];
                if (!desired.TryGetValue(id, out SavedDevice? device) || output.Config != OutputConfig.From(device))
                {
                    stopping.Add((id, output));
                    this._outputs.Remove(id);
                }
            }

            foreach ((string id, SavedDevice device) in desired)
            {
                bool known = contents.TryGetValue(id, out DashSceneContent? content);
                DashMultiDial? dial = catalog is null ? null : DashMultiDial.Of(device, catalog);
                if (this._outputs.TryGetValue(id, out Output? running))
                {
                    if (known)
                    {
                        running.Scenes?.Publish(content);
                    }

                    if (catalog is not null)
                    {
                        running.Scenes?.PublishDial(dial);
                    }

                    continue;
                }

                this._outputs[id] = this.CreateOutput(device, content, dial);
            }

            this._conflicts.Clear();
            foreach ((string id, ScreenOutputHardware hardware) in conflicts)
            {
                this._conflicts[id] = hardware;
            }

            served = this.ReconcileBrowserDisplays(browser, contents);
        }

        foreach ((string id, Output output) in stopping)
        {
            this._log.Info($"Screen output stopping: device={id}.");
            output.Publisher.Dispose();
        }

        this._browserServer?.Reconcile(served);
    }

    /// <summary>
    /// Keeps one <see cref="BrowserDisplay"/> per browser display device, with the same scene feed a
    /// wheel's output gets: a new one starts with its scene, a running one takes a changed scene and
    /// its current resolution and background. Called under <see cref="_sync"/>.
    /// </summary>
    private List<BrowserDisplay> ReconcileBrowserDisplays(List<SavedDevice> devices, Dictionary<string, DashSceneContent?> contents)
    {
        HashSet<string> wanted = devices.Select(device => device.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (string id in this._browserDisplays.Keys.Where(id => !wanted.Contains(id)).ToList())
        {
            this._browserDisplays.Remove(id);
        }

        foreach (SavedDevice device in devices)
        {
            DeviceOrientationTransform size = DeviceOrientations.Transform(device.Width, device.Height, device.Orientation);
            BrowserDisplayLook look = new(size.LogicalWidth, size.LogicalHeight, device.Transparent);
            bool known = contents.TryGetValue(device.Id, out DashSceneContent? content);
            if (!this._browserDisplays.TryGetValue(device.Id, out BrowserDisplay? display))
            {
                display = new BrowserDisplay(device.Id, this.NewSceneFeed(device.Id), look);
                this._browserDisplays[device.Id] = display;
                this._log.Info($"Browser display on: device={device.Id} size={look.Width}x{look.Height} at {BrowserDisplays.Address(device.Id)}.");
            }
            else if (display.Look != look)
            {
                display.Look = look;
            }

            if (known)
            {
                display.Scenes.Publish(content);
            }
        }

        return [.. this._browserDisplays.Values];
    }

    /// <summary>
    /// Each dash device's scene content: null when it has no dash at all, absent when it is not
    /// known this time (no inputs given, or the dash could not be serialized — a command can be
    /// editing it in place on another thread — so the screen keeps its scene until the next
    /// call). A dash two devices share is serialized once.
    /// </summary>
    private Dictionary<string, DashSceneContent?> BuildScenes(IEnumerable<SavedDevice> devices, DashSceneInputs? scenes)
    {
        Dictionary<string, DashSceneContent?> contents = new(StringComparer.OrdinalIgnoreCase);
        if (scenes is null)
        {
            return contents;
        }

        Dictionary<DashLayout, DashSceneContent> byLayout = new(ReferenceEqualityComparer.Instance);
        foreach (SavedDevice device in devices)
        {
            if (DevicePurposes.Resolve(device.Purpose).Output is DevicePurposeOutputKind.DesktopCaptureRegion)
            {
                continue;
            }

            if (DevicePurposeLayouts.Resolve(device, scenes.Layouts) is not { } layout)
            {
                contents[device.Id] = null;
                continue;
            }

            if (!byLayout.TryGetValue(layout, out DashSceneContent? content))
            {
                try
                {
                    content = DashSceneContent.Build(layout, scenes.DriverName, scenes.DriverNumber, scenes.Targets, this._json);
                }
                catch (Exception ex)
                {
                    this._log.Warn($"Screen scene not updated this time: device={device.Id} dash={layout.Id}.", ex);
                    continue;
                }

                byLayout[layout] = content;
            }

            contents[device.Id] = content;
        }

        return contents;
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
    /// native size while the saved device (and therefore <c>/api/state</c>'s <c>screens</c> and
    /// any dash sizing) keeps the stale guess. Mutates
    /// matching devices in place (mirrors the deleted Avalonia client's
    /// <c>DeviceScreenService.AdoptDetectedResolutions</c>) and returns true when anything
    /// changed, so the caller knows to persist. Call before <see cref="Reconcile"/> in the same
    /// tick so a just-adopted size rebuilds its output immediately instead of one tick late.
    /// </summary>
    public bool AdoptDetectedResolutions(IEnumerable<SavedDevice> devices)
    {
        ArgumentNullException.ThrowIfNull(devices);

        Dictionary<string, ScreenNativeSize> detected = new(StringComparer.OrdinalIgnoreCase);
        lock (this._sync)
        {
            foreach ((string id, Output output) in this._outputs)
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

            this._log.Info(
                $"Screen resolution adopted from hardware: device={device.Id} " +
                $"saved={device.Width}x{device.Height} detected={size.Width}x{size.Height}.");
            device.Width = size.Width;
            device.Height = size.Height;
            changed = true;
        }

        return changed;
    }

    private Output CreateOutput(SavedDevice device, DashSceneContent? content, DashMultiDial? dial)
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

        IScreenDriver driver = this._driverFactory(device.Id, device.Driver, this._log);
        driver.Configure(config);

        DevicePurpose purpose = DevicePurposes.Resolve(device.Purpose);
        Output output = purpose.Output is DevicePurposeOutputKind.DesktopCaptureRegion
            ? this.CreateCaptureOutput(device, config, driver)
            : this.CreateDashOutput(device, config, driver, content, dial);

        this._log.Info(
            $"Screen output starting: device={device.Id} driver={device.Driver} purpose={purpose.Id} " +
            $"vid=0x{device.Vid:X4} pid=0x{device.Pid:X4} size={device.Width}x{device.Height}.");
        return output;
    }

    /// <summary>
    /// A device's scene feed: the content <see cref="Reconcile"/> publishes, plus the idle page and the
    /// wheel buttons' page read live, so a page change shows within a frame. Every dash output gets
    /// one, a wheel's and a browser display's alike; only a wheel's reads its multi-dial
    /// (<paramref name="dialStatus"/>).
    /// </summary>
    private DashSceneFeed NewSceneFeed(string deviceId, Func<MultiDialStatus>? dialStatus = null)
    {
        DesktopState? telemetry = this._telemetry;
        DashPageCycle? pageCycle = this._pageCycle;
        return new DashSceneFeed(
            idle: () => telemetry is null || !telemetry.Telemetry.Status.IsLive,
            pageId: () => pageCycle?.CurrentPageId(deviceId),
            dialStatus);
    }

    /// <summary>
    /// The dashboard/flag-display/lap-timer path: the publisher's thread draws the device's dash
    /// with the Rust renderer from the published telemetry, at the device's refresh rate. The scene
    /// and the wheel's multi-dial are in place before the first frame.
    /// </summary>
    private Output CreateDashOutput(SavedDevice device, ScreenConfig config, IScreenDriver driver, DashSceneContent? content, DashMultiDial? dial)
    {
        string deviceId = device.Id;
        DesktopState? telemetry = this._telemetry;
        MultiDialTracker? multiDials = this._multiDials;
        DashSceneFeed scenes = this.NewSceneFeed(deviceId, multiDials is null ? null : () => multiDials.StatusOf(deviceId));
        scenes.Publish(content);
        scenes.PublishDial(dial);
        ScreenPublisher publisher = new(
            driver,
            this._dashSourceFactory(config, scenes),
            () => telemetry?.Telemetry.Frame ?? NoFrame,
            new ScreenPublisherOptions { TargetFps = config.TargetFps },
            this._log,
            deviceId);
        publisher.Start();
        return new Output(OutputConfig.From(device), scenes, publisher);
    }

    /// <summary>
    /// The rear-view mirror path: <see cref="DesktopCaptureFrameSource"/> captures the device's
    /// stored desktop region natively on the publisher's own render loop.
    /// <see cref="DeviceCapabilities.DrivesScreenOutput"/> already requires a valid
    /// <see cref="SavedDevice.CaptureRegion"/> for this purpose to be a candidate at all, so the
    /// null-region case below is defensive rather than reachable through <see cref="Reconcile"/>.
    /// </summary>
    private Output CreateCaptureOutput(SavedDevice device, ScreenConfig config, IScreenDriver driver)
    {
        ScreenCaptureRegion region = device.CaptureRegion
            ?? throw new InvalidOperationException("Rear-view mirror capture area is not configured.");
        DesktopCaptureFrameSource source = new(region, config, this._desktopCapturer);
        ScreenPublisher publisher = new(
            driver,
            source,
            () => NoFrame,
            new ScreenPublisherOptions { TargetFps = config.TargetFps },
            this._log,
            device.Id);
        publisher.Start();
        return new Output(OutputConfig.From(device), null, publisher);
    }

    /// <summary>Stops every active output: disconnects and disposes each driver, and joins each publisher's threads.</summary>
    public void Dispose()
    {
        if (this._disposed)
        {
            return;
        }

        this._disposed = true;
        List<Output> outputs;
        lock (this._sync)
        {
            outputs = this._outputs.Values.ToList();
            this._outputs.Clear();
            this._conflicts.Clear();
            this._browserDisplays.Clear();
        }

        // Ends their feeds; the server's own loop closes the port.
        this._browserServer?.Reconcile([]);

        foreach (Output output in outputs)
        {
            output.Publisher.Dispose();
        }

        if (this._ownsDesktopCapturer && this._desktopCapturer is IDisposable disposableCapturer)
        {
            disposableCapturer.Dispose();
        }
    }
}
