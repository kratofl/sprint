using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// <see cref="ScreenOutputService"/> drives the real USB screens: these tests run it against a
/// <see cref="FakeScreenDriver"/> (in production, a real USB screen) — a dash device drawn by the
/// real Rust renderer, a failing source made visible and recovering — and pin device
/// add/remove/disable/reconfigure reconciliation and clean shutdown.
/// </summary>
public sealed class ScreenOutputServiceTests
{
    [Fact]
    public async Task ADashDeviceShowsItsDashDrawnByTheNativeRenderer()
    {
        FakeScreenDriver? driver = null;
        using ScreenOutputService service = new(driverFactory: (_, _, _) => driver = new FakeScreenDriver());

        SavedDevice device = Device("d1", width: 80, height: 48, refreshHz: 60);
        device.DashId = "dash";
        service.Reconcile([device], Scenes(TestDash.Layout("dash")));

        await WaitUntilAsync(() => driver?.LastFrame is not null, TimeSpan.FromSeconds(5));
        byte[] sent = driver!.LastFrame!;
        Assert.Equal(80 * 48 * 2, sent.Length);
        // The dash canvas is a near-black colour, never the all-zero black of "nothing drawn".
        Assert.Contains(sent, value => value != 0);
        Assert.Equal(ScreenConnectionState.Connected, service.HardwareFor("d1")!.Status.State);
    }

    [Fact]
    public async Task AFailingSourceShowsTheFailurePatternAndFaultedThenRecoversByItself()
    {
        FakeScreenDriver? driver = null;
        SwitchableSource? source = null;
        using ScreenOutputService service = new(
            driverFactory: (_, _, _) => driver = new FakeScreenDriver(),
            dashSourceFactory: (config, _) => source = new SwitchableSource(config.Width, config.Height));

        service.Reconcile([Device("d1", width: 64, height: 32, refreshHz: 60)]);
        await WaitUntilAsync(
            () => service.HardwareFor("d1")?.Status.State == ScreenConnectionState.Faulted && driver?.LastFrame is not null,
            TimeSpan.FromSeconds(3));

        ScreenStatus status = service.HardwareFor("d1")!.Status;
        Assert.Contains("scene rejected: layout has no pages array", status.Detail, StringComparison.Ordinal);
        byte[] failure = driver!.LastFrame!;
        // Red and black stripes: both colours on the panel and nothing else, unlike any test pattern.
        Assert.True(HasOnly(failure, (0x00, 0xF8), (0x00, 0x00)));
        Assert.Contains((byte)0xF8, failure);
        Assert.Contains((byte)0x00, failure);

        source!.Failing = false;
        await WaitUntilAsync(
            () => service.HardwareFor("d1")?.Status.State == ScreenConnectionState.Connected
                && driver!.LastFrame is { } frame
                && HasOnly(frame, (0x2A, 0x2A)),
            TimeSpan.FromSeconds(3));
    }

    [Fact]
    public async Task Reconcile_StopsTheOutputWhenADeviceIsDisabled()
    {
        FakeScreenDriver? driver = null;
        ScreenOutputService.DriverFactory factory = (_, _, _) => driver = new FakeScreenDriver();
        using ScreenOutputService service = new(driverFactory: factory);

        SavedDevice device = Device("d1");
        service.Reconcile([device]);
        Assert.Contains("d1", service.ActiveDeviceIds);
        await WaitUntilAsync(() => driver!.Status.IsConnected, TimeSpan.FromSeconds(3));

        device.Disabled = true;
        service.Reconcile([device]);

        Assert.DoesNotContain("d1", service.ActiveDeviceIds);
        Assert.False(driver!.Status.IsConnected);
    }

    [Fact]
    public void Reconcile_StopsTheOutputWhenADeviceIsRemoved()
    {
        FakeScreenDriver? driver = null;
        ScreenOutputService.DriverFactory factory = (_, _, _) => driver = new FakeScreenDriver();
        using ScreenOutputService service = new(driverFactory: factory);

        SavedDevice device = Device("d1");
        service.Reconcile([device]);
        Assert.Contains("d1", service.ActiveDeviceIds);

        service.Reconcile([]);

        Assert.Empty(service.ActiveDeviceIds);
        Assert.False(driver!.Status.IsConnected);
    }

    [Fact]
    public async Task Reconcile_RebuildsTheOutputWhenOrientationChanges()
    {
        List<FakeScreenDriver> created = [];
        ScreenOutputService.DriverFactory factory = (_, _, _) =>
        {
            FakeScreenDriver fake = new();
            created.Add(fake);
            return fake;
        };
        using ScreenOutputService service = new(driverFactory: factory);

        SavedDevice device = Device("d1", orientation: DeviceOrientation.Portrait);
        service.Reconcile([device]);
        Assert.Single(created);
        FakeScreenDriver first = created[0];
        await WaitUntilAsync(() => first.Status.IsConnected, TimeSpan.FromSeconds(3));

        device.Orientation = DeviceOrientation.Landscape;
        service.Reconcile([device]);

        Assert.Equal(2, created.Count);
        Assert.False(first.Status.IsConnected, "The stale output should have been disconnected.");
        await WaitUntilAsync(() => created[1].Status.IsConnected, TimeSpan.FromSeconds(3));

        // A second reconcile with nothing changed must not rebuild again.
        service.Reconcile([device]);
        Assert.Equal(2, created.Count);
    }

    [Fact]
    public async Task Reconcile_SuppressesASecondDeviceTargetingTheSamePhysicalScreen()
    {
        List<FakeScreenDriver> created = [];
        ScreenOutputService.DriverFactory factory = (_, _, _) =>
        {
            FakeScreenDriver fake = new();
            created.Add(fake);
            return fake;
        };
        using ScreenOutputService service = new(driverFactory: factory);

        // Same driver and VID/PID: two saved devices pointed at one physical VoCore panel (a
        // duplicated device, or two catalog entries for the same hardware).
        SavedDevice owner = Device("owner", driver: "vocore", vid: 0xC872, pid: 0x0001);
        SavedDevice duplicate = Device("duplicate", driver: "vocore", vid: 0xC872, pid: 0x0001);
        service.Reconcile([owner, duplicate]);

        Assert.Equal(["owner"], service.ActiveDeviceIds);
        Assert.Single(created);
        await WaitUntilAsync(() => created[0].Status.IsConnected, TimeSpan.FromSeconds(3));

        ScreenOutputHardware? loserHardware = service.HardwareFor("duplicate");
        Assert.NotNull(loserHardware);
        Assert.Equal(ScreenConnectionState.DeviceConflict, loserHardware!.Status.State);
        Assert.Contains("owner", loserHardware.Status.Detail);
    }


    [Fact]
    public void Reconcile_ADeviceWithAConcretePidWinsOwnershipOverAGenericAutoDetectEntry()
    {
        List<FakeScreenDriver> created = [];
        ScreenOutputService.DriverFactory factory = (_, _, _) =>
        {
            FakeScreenDriver fake = new();
            created.Add(fake);
            return fake;
        };
        using ScreenOutputService service = new(driverFactory: factory);

        // A generic/auto-detect entry (PID 0) always loses the tie-break to a specific one,
        // regardless of collection order.
        SavedDevice generic = Device("generic", driver: "vocore", vid: 0xC872, pid: 0);
        SavedDevice specific = Device("specific", driver: "vocore", vid: 0xC872, pid: 0x0002);
        service.Reconcile([generic, specific]);

        Assert.Equal(["specific"], service.ActiveDeviceIds);
        Assert.Equal(ScreenConnectionState.DeviceConflict, service.HardwareFor("generic")!.Status.State);
    }

    [Fact]
    public void AdoptDetectedResolutions_UpdatesTheSavedDeviceWhenTheDriverReportsADifferentNativeSize()
    {
        FakeScreenDriver? driver = null;
        ScreenOutputService.DriverFactory factory = (_, _, _) => driver = new FakeScreenDriver();
        using ScreenOutputService service = new(driverFactory: factory);

        // A generic/auto-detect entry saved with a placeholder guess; the connected panel
        // reports its real size once the driver picks it up (e.g. a USBD480 NX).
        SavedDevice device = Device("d1", width: 800, height: 480);
        service.Reconcile([device]);
        driver!.NativeSizeOverride = new ScreenNativeSize(480, 800);

        bool changed = service.AdoptDetectedResolutions([device]);

        Assert.True(changed);
        Assert.Equal(480, device.Width);
        Assert.Equal(800, device.Height);
    }

    [Fact]
    public void AdoptDetectedResolutions_ReturnsFalseWhenTheDetectedSizeAlreadyMatchesTheSavedDevice()
    {
        using ScreenOutputService service = new(driverFactory: (_, _, _) => new FakeScreenDriver());
        SavedDevice device = Device("d1", width: 480, height: 800);
        service.Reconcile([device]);

        bool changed = service.AdoptDetectedResolutions([device]);

        Assert.False(changed);
        Assert.Equal(480, device.Width);
        Assert.Equal(800, device.Height);
    }

    [Fact]
    public void AdoptDetectedResolutions_IgnoresADeviceWithNoActiveOutput()
    {
        using ScreenOutputService service = new();
        SavedDevice device = Device("unreconciled");

        bool changed = service.AdoptDetectedResolutions([device]);

        Assert.False(changed);
    }

    [Fact]
    public async Task Dispose_DisconnectsEveryDriverAndClearsActiveOutputs()
    {
        List<FakeScreenDriver> created = [];
        ScreenOutputService.DriverFactory factory = (_, _, _) =>
        {
            FakeScreenDriver fake = new();
            created.Add(fake);
            return fake;
        };
        ScreenOutputService service = new(driverFactory: factory);
        service.Reconcile([Device("d1"), Device("d2")]);
        Assert.Equal(2, service.ActiveDeviceIds.Count);
        await WaitUntilAsync(() => created.Count == 2 && created.All(fake => fake.Status.IsConnected), TimeSpan.FromSeconds(3));

        service.Dispose();

        Assert.Empty(service.ActiveDeviceIds);
        Assert.All(created, fake => Assert.False(fake.Status.IsConnected));

        // Idempotent, and a reconcile after disposal must not resurrect an output.
        service.Dispose();
        service.Reconcile([Device("d1")]);
        Assert.Empty(service.ActiveDeviceIds);
    }

    private static DashSceneInputs Scenes(params DashLayout[] layouts) =>
        new(layouts, "Driver", "22", DashTargets.None);

    private static async Task WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
    {
        DateTime deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (condition())
            {
                return;
            }

            await Task.Delay(10);
        }

        Assert.True(condition(), "Condition was not met before the timeout.");
    }

    private static bool HasOnly(byte[] rgb565, params (byte Low, byte High)[] colors)
    {
        for (int offset = 0; offset < rgb565.Length; offset += 2)
        {
            (byte, byte) pixel = (rgb565[offset], rgb565[offset + 1]);
            if (!colors.Contains(pixel))
            {
                return false;
            }
        }

        return true;
    }

    private static SavedDevice Device(
        string id,
        int width = 480,
        int height = 800,
        DeviceOrientation orientation = DeviceOrientation.Portrait,
        int refreshHz = 30,
        bool disabled = false,
        string driver = "fake",
        ushort vid = 0,
        ushort pid = 0)
    {
        return new SavedDevice
        {
            Id = id,
            Name = id,
            Driver = driver,
            Type = "screen",
            Vid = vid,
            Pid = pid,
            Width = width,
            Height = height,
            Orientation = orientation,
            RefreshHz = refreshHz,
            Purpose = DevicePurposes.Dash,
            Disabled = disabled,
        };
    }

    /// <summary>Fails with a renderer-shaped message until told not to, then fills a constant colour.</summary>
    private sealed class SwitchableSource(int width, int height) : IDashFrameSource
    {
        private volatile bool _failing = true;

        public int Width => width;

        public int Height => height;

        public bool Failing
        {
            get => this._failing;
            set => this._failing = value;
        }

        public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
        {
            if (this._failing)
            {
                throw new DashRendererException("scene rejected: layout has no pages array");
            }

            rgb565.Fill(0x2A);
            return new ScreenFrameTiming(TimeSpan.Zero, TimeSpan.Zero);
        }

        public void Dispose()
        {
        }
    }
}
