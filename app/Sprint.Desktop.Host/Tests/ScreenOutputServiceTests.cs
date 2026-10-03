using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// <see cref="ScreenOutputService"/> is the last mile of the dash pipeline: it takes the BGRA
/// bytes an offscreen browser POSTs and gets real RGB565 pixels onto a <see cref="FakeScreenDriver"/>
/// (in production, a real USB screen). These tests drive the whole path — HTTP-shaped
/// <c>PublishFrameAsync</c> call, through the shared exchange, through the real
/// <see cref="Rgb565"/> composition, onto the driver — and pin device
/// add/remove/disable/reconfigure reconciliation and clean shutdown.
/// </summary>
public sealed class ScreenOutputServiceTests
{
    [Fact]
    public async Task PublishFrameAsync_RoutesABgraFrameToTheDriverAtNativeSizeAndColor()
    {
        FakeScreenDriver? driver = null;
        ScreenOutputService.DriverFactory factory = (_, _, _) => driver = new FakeScreenDriver();
        using ScreenOutputService service = new(driverFactory: factory);

        // No rotation: native == logical (2x4), so this only proves size and color survive the pipe.
        SavedDevice device = Device("d1", width: 2, height: 4, refreshHz: 60);
        service.Reconcile([device]);
        await WaitUntilAsync(() => driver!.Status.IsConnected, TimeSpan.FromSeconds(3));

        // The publisher may already have sent one all-black frame before this post lands, so
        // compare against the count at post time rather than "> 0".
        int beforeFramesSent = driver!.FramesSent;
        byte[] red = SolidBgra(2, 4, b: 0x00, g: 0x00, r: 0xF8);
        ScreenFramePublishResult result = await service.PublishFrameAsync("d1", 2, 4, red, CancellationToken.None);

        Assert.Equal(ScreenFramePublishResult.Routed, result);
        await WaitUntilAsync(() => driver!.FramesSent > beforeFramesSent, TimeSpan.FromSeconds(3));

        byte[] sent = driver!.LastFrame!;
        Assert.Equal(2 * 4 * 2, sent.Length);
        Assert.Equal(
            Enumerable.Repeat(new byte[] { 0x00, 0xF8 }, 2 * 4).SelectMany(pair => pair),
            sent);
    }

    [Fact]
    public async Task PublishFrameAsync_AppliesTheDeviceOrientationBeforeReachingTheDriver()
    {
        FakeScreenDriver? driver = null;
        ScreenOutputService.DriverFactory factory = (_, _, _) => driver = new FakeScreenDriver();
        using ScreenOutputService service = new(driverFactory: factory);

        // Native panel is 2 wide x 4 tall; Landscape rotates the browser's 4x2 logical frame
        // 90 degrees clockwise onto it (DeviceOrientations.Transform).
        SavedDevice device = Device("d1", width: 2, height: 4, orientation: DeviceOrientation.Landscape, refreshHz: 60);
        service.Reconcile([device]);
        await WaitUntilAsync(() => driver!.Status.IsConnected, TimeSpan.FromSeconds(3));

        int beforeFramesSent = driver!.FramesSent;
        byte[] logical = new byte[4 * 2 * 4];
        SetBgraPixel(logical, logicalWidth: 4, x: 0, y: 1, b: 0x00, g: 0x00, r: 0xF8); // bottom-left logical pixel

        ScreenFramePublishResult result = await service.PublishFrameAsync("d1", 4, 2, logical, CancellationToken.None);
        Assert.Equal(ScreenFramePublishResult.Routed, result);
        await WaitUntilAsync(() => driver!.FramesSent > beforeFramesSent, TimeSpan.FromSeconds(3));

        byte[] native = driver!.LastFrame!;
        Assert.Equal(2 * 4 * 2, native.Length);
        // The marked pixel lands at native (0,0) under a 90-degree clockwise rotation.
        Assert.Equal(0x00, native[0]);
        Assert.Equal(0xF8, native[1]);
        for (int offset = 2; offset < native.Length; offset += 2)
        {
            Assert.Equal(0x00, native[offset]);
            Assert.Equal(0x00, native[offset + 1]);
        }
    }

    [Fact]
    public async Task ASlowConsumerNeverSeesIntermediateFramesQueued()
    {
        // A driver that records every frame it was ever sent, so we can prove the ones in
        // between never arrived at all (dropped), rather than merely checking the last one.
        FrameHistoryDriver driver = new();
        using ScreenOutputService service = new(driverFactory: (_, _, _) => driver);

        // 5 Hz (200ms) gives ample room for three rapid posts to land between two renders.
        SavedDevice device = Device("d1", width: 2, height: 2, refreshHz: 5);
        service.Reconcile([device]);
        await WaitUntilAsync(() => driver.Sent.Count >= 1, TimeSpan.FromSeconds(3));

        byte[] red = SolidBgra(2, 2, 0x00, 0x00, 0xF8);
        byte[] green = SolidBgra(2, 2, 0x00, 0xFC, 0x00);
        byte[] blue = SolidBgra(2, 2, 0xF8, 0x00, 0x00);
        await service.PublishFrameAsync("d1", 2, 2, red, CancellationToken.None);
        await service.PublishFrameAsync("d1", 2, 2, green, CancellationToken.None);
        await service.PublishFrameAsync("d1", 2, 2, blue, CancellationToken.None);

        int beforeCount = driver.Sent.Count;
        await WaitUntilAsync(() => driver.Sent.Count > beforeCount, TimeSpan.FromSeconds(3));

        Assert.True(IsSolid(driver.Sent[^1], 0x1F, 0x00), "The most recent send should be the latest posted frame (blue).");
        Assert.DoesNotContain(driver.Sent, frame => IsSolid(frame, 0x00, 0xF8)); // red never reached the driver
        Assert.DoesNotContain(driver.Sent, frame => IsSolid(frame, 0xE0, 0x07)); // green never reached the driver
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

        ScreenFramePublishResult result = await service.PublishFrameAsync(
            "duplicate", duplicate.Width, duplicate.Height, new byte[duplicate.Width * duplicate.Height * 4], CancellationToken.None);
        Assert.Equal(ScreenFramePublishResult.NoActiveOutput, result);
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

    [Fact]
    public async Task PublishFrameAsync_ReturnsNoActiveOutputForAnUnreconciledDevice()
    {
        using ScreenOutputService service = new();

        ScreenFramePublishResult result = await service.PublishFrameAsync(
            "unknown", 2, 2, new byte[2 * 2 * 4], CancellationToken.None);

        Assert.Equal(ScreenFramePublishResult.NoActiveOutput, result);
    }

    [Fact]
    public async Task PublishFrameAsync_ReturnsDimensionMismatchForTheWrongFrameSize()
    {
        using ScreenOutputService service = new(driverFactory: (_, _, _) => new FakeScreenDriver());
        SavedDevice device = Device("d1", width: 2, height: 4);
        service.Reconcile([device]);

        ScreenFramePublishResult result = await service.PublishFrameAsync(
            "d1", width: 4, height: 2, new byte[4 * 2 * 4], CancellationToken.None);

        Assert.Equal(ScreenFramePublishResult.DimensionMismatch, result);
    }

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

    private static byte[] SolidBgra(int width, int height, byte b, byte g, byte r, byte a = 0xFF)
    {
        byte[] buffer = new byte[width * height * 4];
        for (int index = 0; index < buffer.Length; index += 4)
        {
            buffer[index] = b;
            buffer[index + 1] = g;
            buffer[index + 2] = r;
            buffer[index + 3] = a;
        }

        return buffer;
    }

    private static void SetBgraPixel(byte[] bgra, int logicalWidth, int x, int y, byte b, byte g, byte r, byte a = 0xFF)
    {
        int index = (y * logicalWidth + x) * 4;
        bgra[index] = b;
        bgra[index + 1] = g;
        bgra[index + 2] = r;
        bgra[index + 3] = a;
    }

    private static bool IsSolid(byte[] rgb565, byte lowByte, byte highByte)
    {
        for (int offset = 0; offset < rgb565.Length; offset += 2)
        {
            if (rgb565[offset] != lowByte || rgb565[offset + 1] != highByte)
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

    /// <summary>Records every frame it is sent, so a test can assert an intermediate frame never arrived at all.</summary>
    private sealed class FrameHistoryDriver : IScreenDriver
    {
        private readonly List<byte[]> _sent = [];
        private readonly object _gate = new();

        public string Name => "History";

        public ScreenStatus Status { get; private set; } = ScreenStatus.Disconnected();

        public IReadOnlyList<byte[]> Sent
        {
            get { lock (_gate) { return _sent.ToArray(); } }
        }

        public void Configure(ScreenConfig config)
        {
        }

        public bool Connect()
        {
            Status = new ScreenStatus { State = ScreenConnectionState.Connected };
            return true;
        }

        public bool TrySendFrame(byte[] rgb565)
        {
            lock (_gate)
            {
                _sent.Add((byte[])rgb565.Clone());
            }

            return true;
        }

        public void Disconnect() => Status = ScreenStatus.Disconnected();

        public void Dispose() => Disconnect();
    }
}
