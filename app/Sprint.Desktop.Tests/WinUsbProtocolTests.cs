using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class WinUsbProtocolTests
{
    [Theory]
    [InlineData(800, 480, 0x00, 0xB8, 0x0B)]
    [InlineData(1024, 600, 0x00, 0xC0, 0x12)]
    public void VoCoreDrawCommandContainsRgb565FrameSize(
        int width,
        int height,
        byte sizeLow,
        byte sizeMid,
        byte sizeHigh)
    {
        var command = VoCoreProtocol.BuildDrawCommand(width * height * 2);

        Assert.Equal(
            new byte[] { 0x00, 0x2C, sizeLow, sizeMid, sizeHigh, 0x00 },
            command);
    }

    [Theory]
    [InlineData(0x00000005u, 480, 854)]
    [InlineData(0x00001005u, 720, 1280)]
    [InlineData(0x00000007u, 800, 480)]
    [InlineData(0x00000403u, 800, 800)]
    [InlineData(0x0000000Au, 1024, 600)]
    [InlineData(0xDEADBEEFu, 480, 800)]
    public void VoCoreModelMapsToNativeDimensions(uint model, int width, int height)
    {
        Assert.Equal((width, height), VoCoreProtocol.NativeDimensions(model));
    }

    [Fact]
    public void VoCoreModelResponseReadsLittleEndianIdentifier()
    {
        Assert.Equal(
            0x12345678u,
            VoCoreProtocol.ParseModelResponse([0x00, 0x78, 0x56, 0x34, 0x12]));
    }

    [Fact]
    public void VoCoreModelResponseRejectsShortPacket()
    {
        Assert.Throws<ArgumentException>(() => VoCoreProtocol.ParseModelResponse([0x00, 0x01]));
    }

    [Theory]
    [InlineData(0x1001, 480, 800)]
    [InlineData(0x1005, 480, 854)]
    [InlineData(0x1006, 800, 800)]
    [InlineData(0x100A, 1024, 600)]
    [InlineData(0x1004, 800, 480)]
    public void VoCorePidFallbackAvoidsBlockingModelQuery(
        ushort pid,
        int expectedWidth,
        int expectedHeight)
    {
        Assert.Equal(
            new ScreenNativeSize(expectedWidth, expectedHeight),
            VoCoreProtocol.NativeDimensionsForPid(pid, configuredWidth: 800, configuredHeight: 480));
    }
}
