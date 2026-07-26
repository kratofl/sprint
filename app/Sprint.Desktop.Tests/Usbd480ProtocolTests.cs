using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// USBD480 NX support that does not need the panel plugged in: decoding the
/// GET_DEVICE_DETAILS block, resolving which size to render at, and adopting the
/// detected panel size onto the saved device. The native WinUSB transfers stay
/// hardware-gated; everything that decides what to do with their answer is pinned
/// here (see docs/SCREEN_PROTOCOLS.md).
/// </summary>
public sealed class Usbd480ProtocolTests
{
    private static byte[] DetailsBlock(string name, int width, int height)
    {
        var block = new byte[Usbd480Protocol.DetailsBlockSize];
        var nameBytes = System.Text.Encoding.ASCII.GetBytes(name);
        nameBytes.AsSpan(0, Math.Min(nameBytes.Length, Usbd480Protocol.NameLength)).CopyTo(block);
        block[20] = (byte)(width & 0xFF);
        block[21] = (byte)(width >> 8);
        block[22] = (byte)(height & 0xFF);
        block[23] = (byte)(height >> 8);
        return block;
    }

    [Fact]
    public void RequestConstantsMatchTheProtocolReference()
    {
        Assert.Equal(0x02, Usbd480Protocol.BulkEndpoint);
        Assert.Equal(0x40, Usbd480Protocol.RequestTypeOut);
        Assert.Equal(0xC0, Usbd480Protocol.RequestTypeIn);
        Assert.Equal(0x80, Usbd480Protocol.RequestGetDetails);
        Assert.Equal(0xC0, Usbd480Protocol.RequestSetAddress);
        Assert.Equal(0xC4, Usbd480Protocol.RequestSetFrameStartAddress);
        Assert.Equal(0x81, Usbd480Protocol.RequestSetBrightness);
        Assert.Equal(64, Usbd480Protocol.DetailsBlockSize);
        Assert.Equal(new ScreenNativeSize(800, 480), Usbd480Protocol.DefaultNativeSize);
    }

    [Fact]
    public void DetailsBlockDecodesNameAndLittleEndianSize()
    {
        Assert.True(Usbd480Protocol.TryParseDetails(DetailsBlock("USBD480-NX50", 800, 480), out var parsed));

        Assert.Equal("USBD480-NX50", parsed.Name);
        Assert.Equal(800, parsed.Width);
        Assert.Equal(480, parsed.Height);
    }

    [Fact]
    public void DetailsBlockWithoutATerminatorUsesTheFullNameField()
    {
        var block = DetailsBlock(new string('A', Usbd480Protocol.NameLength), 480, 272);

        Assert.True(Usbd480Protocol.TryParseDetails(block, out var parsed));
        Assert.Equal(new string('A', Usbd480Protocol.NameLength), parsed.Name);
        Assert.Equal(480, parsed.Width);
        Assert.Equal(272, parsed.Height);
    }

    [Theory]
    [InlineData(8)]
    [InlineData(23)]
    public void ShortDetailsBlockIsRejected(int length) =>
        Assert.False(Usbd480Protocol.TryParseDetails(new byte[length], out _));

    [Theory]
    [InlineData(0, 0)]
    [InlineData(800, 0)]
    [InlineData(65535, 65535)]
    public void UnusableSizeIsRejectedButTheNameSurvives(int width, int height)
    {
        Assert.False(Usbd480Protocol.TryParseDetails(DetailsBlock("USBD480-NX43", width, height), out var parsed));

        // The name is kept so a known model can still supply the size.
        Assert.Equal("USBD480-NX43", parsed.Name);
        Assert.Equal(0, parsed.Width);
    }

    [Fact]
    public void NativeSizeResolutionPrefersTheReportedSizeThenTheModelThenTheConfig()
    {
        // 1. What the panel says wins.
        Assert.Equal(
            new ScreenNativeSize(800, 480),
            Usbd480Protocol.ResolveNativeSize(new Usbd480Details("USBD480-NX50", 800, 480), 480, 272));

        // 2. A named model with an unusable size falls back to the known size, not the config.
        Assert.Equal(
            new ScreenNativeSize(480, 272),
            Usbd480Protocol.ResolveNativeSize(new Usbd480Details("USBD480-NX43", 0, 0), 1024, 600));

        // 3. An unknown, size-less answer keeps the configured size.
        Assert.Equal(
            new ScreenNativeSize(1024, 600),
            Usbd480Protocol.ResolveNativeSize(new Usbd480Details("mystery panel", 0, 0), 1024, 600));

        // 4. No answer and no usable config falls back to the documented default.
        Assert.Equal(Usbd480Protocol.DefaultNativeSize, Usbd480Protocol.ResolveNativeSize(null, 0, 0));
    }

    [Theory]
    [InlineData("USBD480-NX43", 480, 272)]
    [InlineData("nx50", 800, 480)]
    public void KnownModelsAreMatchedOnTheModelSuffix(string reported, int width, int height) =>
        Assert.Equal(new ScreenNativeSize(width, height), Usbd480Protocol.ModelSize(reported));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("VoCore")]
    public void UnknownNamesHaveNoModelSize(string? reported) =>
        Assert.Null(Usbd480Protocol.ModelSize(reported));

    [Theory]
    [InlineData(800, 480, true)]
    [InlineData(0, 480, false)]
    [InlineData(-1, 480, false)]
    [InlineData(5000, 480, false)]
    [InlineData(4096, 4096, false)] // RGB565 frame exceeds the 24-bit address space
    public void RenderableSizeGuardsTheFramebufferRange(int width, int height, bool expected) =>
        Assert.Equal(expected, Usbd480Protocol.IsRenderableSize(width, height));

    [Fact]
    public void DetectedPanelSizeIsAdoptedOntoTheSavedDevice()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            // A generic USBD480 entry starts with the documented stand-in size.
            var device = new SavedDevice
            {
                Id = "usbd480",
                Name = "Generic USBD480 NX Screen",
                Type = "screen",
                Driver = "usbd480",
                Width = 800,
                Height = 480,
                DashId = "default",
            };
            runtime.Devices.Add(device);

            // The panel turns out to be an NX43.
            var driver = new FakeScreenDriver { NativeSizeOverride = new ScreenNativeSize(480, 272) };
            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => driver);
            service.Sync();

            Assert.True(service.AdoptDetectedResolutions());
            Assert.Equal(480, device.Width);
            Assert.Equal(272, device.Height);

            // Idempotent: nothing left to adopt on a second pass.
            Assert.False(service.AdoptDetectedResolutions());

            // The adoption is persisted, so the UI shows the real panel after a restart.
            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var saved = reloaded.Devices.Single(item => item.Id == "usbd480");
            Assert.Equal(480, saved.Width);
            Assert.Equal(272, saved.Height);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void AnInvalidDetectedSizeIsIgnored()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var device = new SavedDevice
            {
                Id = "usbd480",
                Name = "Screen",
                Type = "screen",
                Driver = "usbd480",
                Width = 800,
                Height = 480,
                DashId = "default",
            };
            runtime.Devices.Add(device);

            var driver = new FakeScreenDriver { NativeSizeOverride = new ScreenNativeSize(0, 0) };
            using var service = new DeviceScreenService(runtime, () => new TelemetryFrame(), _ => driver);
            service.Sync();

            Assert.False(service.AdoptDetectedResolutions());
            Assert.Equal(800, device.Width);
            Assert.Equal(480, device.Height);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void GenericUsbd480EntryResolvesToItsDocumentedIdentityAndSize()
    {
        var identity = ScreenUsbIdentity.ForDriver("usbd480", 0, 0);
        Assert.Equal(0x16C0, identity.Vid);
        Assert.Equal(0x08A7, identity.Pid);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var catalog = runtime.Catalog.Single(entry =>
                string.Equals(entry.Id, "generic-usbd480", StringComparison.Ordinal));

            var saved = runtime.AddDevice(catalog);

            // The stand-in matches the driver's own fallback rather than a second guess.
            Assert.Equal(Usbd480Protocol.DefaultNativeSize.Width, saved.Width);
            Assert.Equal(Usbd480Protocol.DefaultNativeSize.Height, saved.Height);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
