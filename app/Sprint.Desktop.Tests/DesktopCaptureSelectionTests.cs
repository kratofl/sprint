using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Api.Telemetry;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DesktopCaptureSelectionTests
{
    private sealed class RecordingCapturer : IDesktopRegionCapturer
    {
        public ScreenCaptureRegion? Region { get; private set; }
        public int Width { get; private set; }
        public int Height { get; private set; }

        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            Region = region;
            Width = destinationWidth;
            Height = destinationHeight;
            for (var pixel = 0; pixel < destinationWidth * destinationHeight; pixel++)
            {
                var offset = pixel * 4;
                bgra[offset] = 0x00;
                bgra[offset + 1] = 0x00;
                bgra[offset + 2] = 0xff;
                bgra[offset + 3] = 0xff;
            }

            return true;
        }
    }

    private sealed class RecordingSurfaceFactory : IDesktopCaptureSurfaceFactory
    {
        public List<RecordingSurface> Surfaces { get; } = [];
        public bool IsSupported => true;

        public IDesktopCaptureSurface? Create(int width, int height)
        {
            var surface = new RecordingSurface(width, height);
            Surfaces.Add(surface);
            return surface;
        }
    }

    private sealed class RecordingSurface(int width, int height) : IDesktopCaptureSurface
    {
        public int Width => width;
        public int Height => height;
        public int Captures { get; private set; }
        public bool Disposed { get; private set; }

        public bool TryCapture(ScreenCaptureRegion region, byte[] bgra)
        {
            Captures++;
            Array.Fill(bgra, (byte)0x7f);
            return true;
        }

        public void Dispose() => Disposed = true;
    }

    private sealed class PatternCapturer : IDesktopRegionCapturer
    {
        public int Width { get; private set; }
        public int Height { get; private set; }
        public byte[] LastFrame { get; private set; } = [];

        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            Width = destinationWidth;
            Height = destinationHeight;
            for (var y = 0; y < destinationHeight; y++)
            {
                for (var x = 0; x < destinationWidth; x++)
                {
                    var offset = (y * destinationWidth + x) * 4;
                    bgra[offset] = (byte)(x * 7);
                    bgra[offset + 1] = (byte)(y * 11);
                    bgra[offset + 2] = (byte)(x + y);
                    bgra[offset + 3] = 0xff;
                }
            }

            LastFrame = bgra.ToArray();
            return true;
        }
    }

    private sealed class ChangingCapturer : IDesktopRegionCapturer
    {
        private byte _red = 0x20;

        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            _red += 0x20;
            for (var pixel = 0; pixel < destinationWidth * destinationHeight; pixel++)
            {
                var offset = pixel * 4;
                bgra[offset] = 0;
                bgra[offset + 1] = 0;
                bgra[offset + 2] = _red;
                bgra[offset + 3] = 0xff;
            }

            return true;
        }
    }

    [Theory]
    [InlineData(DeviceOrientation.Portrait, 0, "Portrait", false)]
    [InlineData(DeviceOrientation.Landscape, 90, "Landscape", true)]
    [InlineData(DeviceOrientation.PortraitInverted, 180, "Portrait inverted", false)]
    [InlineData(DeviceOrientation.LandscapeInverted, 270, "Landscape inverted", true)]
    public void DeviceOrientationEnumIsTheSingleDegreeAndShapeContract(
        DeviceOrientation orientation,
        int rotation,
        string label,
        bool isLandscape)
    {
        Assert.Equal(rotation, (int)orientation);
        Assert.Equal(label, DeviceOrientations.Label(orientation));
        Assert.Equal(isLandscape, DeviceOrientations.IsLandscape(orientation));
        Assert.Equal(orientation, DeviceOrientations.Resolve(rotation));
    }

    [Theory]
    [InlineData(0, "Portrait")]
    [InlineData(90, "Landscape")]
    [InlineData(180, "Portrait inverted")]
    [InlineData(270, "Landscape inverted")]
    public void DeviceOrientationUsesNamesInsteadOfRawDegreeLabels(int rotation, string expectedLabel)
    {
        Assert.Equal(expectedLabel, DeviceOrientations.Label(rotation));
        Assert.Equal(rotation, (int)DeviceOrientations.OrientationForLabel(expectedLabel)!.Value);
    }

    [Theory]
    [InlineData(0, 480, 800, 0.6)]
    [InlineData(90, 800, 480, 1.6666666667)]
    [InlineData(180, 480, 800, 0.6)]
    [InlineData(270, 800, 480, 1.6666666667)]
    public void EffectiveSizeAndAspectFollowTheDeviceOrientation(
        int rotation,
        int expectedWidth,
        int expectedHeight,
        double expectedAspect)
    {
        var device = ScreenDevice(rotation);

        var size = CaptureSelectionGeometry.EffectiveSize(device);

        Assert.Equal(expectedWidth, size.Width);
        Assert.Equal(expectedHeight, size.Height);
        Assert.Equal(expectedAspect, CaptureSelectionGeometry.AspectRatio(device), precision: 8);
    }

    [Theory]
    [InlineData(800, 480, 0, 480, 800)]
    [InlineData(800, 480, 90, 800, 480)]
    [InlineData(480, 800, 180, 480, 800)]
    [InlineData(480, 800, 270, 800, 480)]
    public void SelectorOrientationDoesNotDependOnTheDriversDimensionOrder(
        int driverWidth,
        int driverHeight,
        int rotation,
        int expectedWidth,
        int expectedHeight)
    {
        var device = ScreenDevice(rotation);
        device.Width = driverWidth;
        device.Height = driverHeight;

        Assert.Equal(
            new CaptureSelectionSize(expectedWidth, expectedHeight),
            CaptureSelectionGeometry.EffectiveSize(device));
    }

    [Fact]
    public void ExistingPortraitSelectionIsNormalizedWhenOrientationBecomesLandscape()
    {
        var portrait = new ScreenCaptureRegion(100, 200, 480, 800);

        var landscape = CaptureSelectionGeometry.NormalizeRegionAspect(
            portrait,
            800d / 480d);

        Assert.Equal(800d / 480d, landscape.Width / (double)landscape.Height, precision: 8);
        Assert.Equal(portrait.X + portrait.Width / 2, landscape.X + landscape.Width / 2);
        Assert.Equal(portrait.Y + portrait.Height / 2, landscape.Y + landscape.Height / 2);
    }

    [Fact]
    public void ResizeUsesTheDominantPointerAxisAndKeepsTheExactAspectRatio()
    {
        const double aspect = 16d / 9d;
        var previous = new CaptureSelectionSize(640, 360);

        var widthDriven = CaptureSelectionGeometry.ConstrainResize(
            previous,
            new CaptureSelectionSize(800, 390),
            aspect);
        var heightDriven = CaptureSelectionGeometry.ConstrainResize(
            previous,
            new CaptureSelectionSize(660, 450),
            aspect);

        Assert.Equal(new CaptureSelectionSize(800, 450), widthDriven);
        Assert.Equal(new CaptureSelectionSize(800, 450), heightDriven);
    }

    [Theory]
    [InlineData(0, 90, 480, 800)]
    [InlineData(90, 270, 800, 480)]
    [InlineData(270, 0, 480, 800)]
    public void RotationChangeKeepsAConfiguredRegionAlignedWithTheDevice(
        int previousRotation,
        int nextRotation,
        int expectedWidth,
        int expectedHeight)
    {
        var region = new ScreenCaptureRegion(25, 50, 800, 480);

        var reoriented = CaptureSelectionGeometry.ReorientRegion(
            region,
            DeviceOrientations.Resolve(previousRotation),
            DeviceOrientations.Resolve(nextRotation));

        Assert.Equal(new ScreenCaptureRegion(25, 50, expectedWidth, expectedHeight), reoriented);
    }

    [Fact]
    public void DisconnectedMonitorSelectionRecoversInsideTheVisibleScreen()
    {
        var stale = new ScreenCaptureRegion(-1920, 100, 1600, 900);
        var primaryWorkingArea = new ScreenCaptureRegion(0, 0, 1920, 1040);

        var recovered = CaptureSelectionGeometry.RecoverToVisibleBounds(
            stale,
            primaryWorkingArea,
            16d / 9d);

        Assert.True(recovered.X >= primaryWorkingArea.X);
        Assert.True(recovered.Y >= primaryWorkingArea.Y);
        Assert.True(recovered.X + recovered.Width <= primaryWorkingArea.X + primaryWorkingArea.Width);
        Assert.True(recovered.Y + recovered.Height <= primaryWorkingArea.Y + primaryWorkingArea.Height);
        Assert.Equal(16d / 9d, recovered.Width / (double)recovered.Height, precision: 2);
    }

    [Fact]
    public void CaptureRegionPersistsNegativeMultiMonitorCoordinates()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var device = ScreenDevice(rotation: 90);
            runtime.Devices.Add(device);

            runtime.UpdateDeviceCaptureRegion(
                device,
                new ScreenCaptureRegion(-1920, 140, 1600, 960));

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var persisted = reloaded.Devices.Single(item => item.Id == device.Id);

            Assert.Equal(
                new ScreenCaptureRegion(-1920, 140, 1600, 960),
                persisted.CaptureRegion);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void FrameSourceCapturesAtLogicalSizeThenUsesTheExistingRgb565Pipeline()
    {
        var region = new ScreenCaptureRegion(-800, 25, 1600, 960);
        var capturer = new RecordingCapturer();
        var config = new ScreenConfig
        {
            Width = 2,
            Height = 4,
            Orientation = DeviceOrientation.Landscape,
        };
        using var source = new DesktopCaptureFrameSource(region, config, capturer);
        var destination = new byte[config.Width * config.Height * 2];

        source.Render(new TelemetryFrame(), destination);

        Assert.Equal(region, capturer.Region);
        Assert.Equal(4, capturer.Width);
        Assert.Equal(2, capturer.Height);
        Assert.Equal(
            Enumerable.Repeat(new byte[] { 0x00, 0xf8 }, 8).SelectMany(bytes => bytes),
            destination);
    }

    [Fact]
    public void FrameSourceReportsCaptureAndPixelTransformAsSeparateStages()
    {
        var capturer = new RecordingCapturer();
        var config = new ScreenConfig
        {
            Width = 8,
            Height = 4,
            Orientation = DeviceOrientation.Landscape,
        };
        using var source = new DesktopCaptureFrameSource(
            new ScreenCaptureRegion(0, 0, 1600, 800),
            config,
            capturer);

        var timing = source.Render(
            new TelemetryFrame(),
            new byte[config.Width * config.Height * 2]);

        Assert.True(timing.SourceTime >= TimeSpan.Zero);
        Assert.True(timing.PixelTransformTime >= TimeSpan.Zero);
        Assert.Equal(timing.SourceTime + timing.PixelTransformTime, timing.FrameTime);
    }

    [Fact]
    public void FrameSourceDoesNotAllocatePerCapturedFrame()
    {
        var capturer = new RecordingCapturer();
        var config = new ScreenConfig
        {
            Width = 320,
            Height = 240,
            Orientation = DeviceOrientation.Landscape,
        };
        using var source = new DesktopCaptureFrameSource(
            new ScreenCaptureRegion(0, 0, 1600, 900),
            config,
            capturer);
        var destination = new byte[config.Width * config.Height * 2];
        var frame = new TelemetryFrame();
        source.Render(frame, destination);

        const int frames = 20;
        var allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
        for (var index = 0; index < frames; index++)
        {
            source.Render(frame, destination);
        }

        var allocatedBytes = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
        Assert.Equal(0, allocatedBytes);
    }

    [Fact]
    public void FrameSourcePublishesItsLatestLogicalCaptureForPreviewReuse()
    {
        var capturer = new PatternCapturer();
        var config = new ScreenConfig
        {
            Width = 8,
            Height = 4,
            Orientation = DeviceOrientation.Landscape,
        };
        var exchange = new LatestBgraFrameExchange(8, 4);
        using var source = new DesktopCaptureFrameSource(
            new ScreenCaptureRegion(0, 0, 1600, 800),
            config,
            capturer,
            exchange);

        source.Render(
            new TelemetryFrame(),
            new byte[config.Width * config.Height * 2]);

        var shared = new byte[8 * 4 * 4];
        long version = 0;
        Assert.Equal(
            LatestFrameReadResult.Copied,
            exchange.TryCopyLatest(shared, ref version, TimeSpan.FromSeconds(1)));
        Assert.Equal(capturer.LastFrame, shared);
    }

    [Fact]
    public void LandscapeCaptureSourceStaysLandscapeWhenDriverReportsLandscapeDimensions()
    {
        var capturer = new RecordingCapturer();
        var config = new ScreenConfig
        {
            Width = 800,
            Height = 480,
            Orientation = DeviceOrientation.Landscape,
        };
        using var source = new DesktopCaptureFrameSource(
            new ScreenCaptureRegion(0, 0, 1600, 960),
            config,
            capturer);

        source.Render(new TelemetryFrame(), new byte[config.Width * config.Height * 2]);

        Assert.Equal(800, capturer.Width);
        Assert.Equal(480, capturer.Height);
    }

    [Fact]
    public void RearViewFramesUseTheSameOrientationContractForEveryDriverDimensionOrder()
    {
        var cases = new[]
        {
            (NativeWidth: 3, NativeHeight: 5, Orientation: DeviceOrientation.Portrait, LogicalWidth: 3, LogicalHeight: 5, PixelRotation: 0),
            (NativeWidth: 3, NativeHeight: 5, Orientation: DeviceOrientation.Landscape, LogicalWidth: 5, LogicalHeight: 3, PixelRotation: 90),
            (NativeWidth: 3, NativeHeight: 5, Orientation: DeviceOrientation.PortraitInverted, LogicalWidth: 3, LogicalHeight: 5, PixelRotation: 180),
            (NativeWidth: 3, NativeHeight: 5, Orientation: DeviceOrientation.LandscapeInverted, LogicalWidth: 5, LogicalHeight: 3, PixelRotation: 270),
            (NativeWidth: 5, NativeHeight: 3, Orientation: DeviceOrientation.Portrait, LogicalWidth: 3, LogicalHeight: 5, PixelRotation: 90),
            (NativeWidth: 5, NativeHeight: 3, Orientation: DeviceOrientation.Landscape, LogicalWidth: 5, LogicalHeight: 3, PixelRotation: 0),
            (NativeWidth: 5, NativeHeight: 3, Orientation: DeviceOrientation.PortraitInverted, LogicalWidth: 3, LogicalHeight: 5, PixelRotation: 270),
            (NativeWidth: 5, NativeHeight: 3, Orientation: DeviceOrientation.LandscapeInverted, LogicalWidth: 5, LogicalHeight: 3, PixelRotation: 180),
        };

        foreach (var testCase in cases)
        {
            var capturer = new PatternCapturer();
            var config = new ScreenConfig
            {
                Width = testCase.NativeWidth,
                Height = testCase.NativeHeight,
                Orientation = testCase.Orientation,
                Margin = 1,
                OffsetX = 1,
                OffsetY = 1,
            };
            using var source = new DesktopCaptureFrameSource(
                new ScreenCaptureRegion(0, 0, 50, 30),
                config,
                capturer,
                sharedFrames: null,
                preferNativeRgb565: false);
            var actual = new byte[config.Width * config.Height * 2];

            source.Render(new TelemetryFrame(), actual);

            Assert.Equal(testCase.LogicalWidth, capturer.Width);
            Assert.Equal(testCase.LogicalHeight, capturer.Height);
            var converted = new byte[actual.Length];
            Rgb565.FromBgra(
                capturer.LastFrame,
                testCase.LogicalWidth,
                testCase.LogicalHeight,
                testCase.PixelRotation,
                converted);
            var expected = new byte[actual.Length];
            Rgb565.ApplyMargin(
                converted,
                expected,
                testCase.NativeWidth,
                testCase.NativeHeight,
                config.Margin);
            Rgb565.ApplyOffset(
                expected,
                testCase.NativeWidth,
                testCase.NativeHeight,
                config.OffsetX,
                config.OffsetY,
                testCase.PixelRotation);
            Assert.Equal(expected, actual);
        }
    }

    [Fact]
    public void NativeRearViewCompositionStaysCloseToTheFusedReferenceForEveryOrientation()
    {
        var cases = new[]
        {
            (Width: 120, Height: 200, Orientation: DeviceOrientation.Portrait),
            (Width: 120, Height: 200, Orientation: DeviceOrientation.Landscape),
            (Width: 120, Height: 200, Orientation: DeviceOrientation.PortraitInverted),
            (Width: 120, Height: 200, Orientation: DeviceOrientation.LandscapeInverted),
            (Width: 200, Height: 120, Orientation: DeviceOrientation.Portrait),
            (Width: 200, Height: 120, Orientation: DeviceOrientation.Landscape),
            (Width: 200, Height: 120, Orientation: DeviceOrientation.PortraitInverted),
            (Width: 200, Height: 120, Orientation: DeviceOrientation.LandscapeInverted),
        };

        foreach (var testCase in cases)
        {
            var config = new ScreenConfig
            {
                Width = testCase.Width,
                Height = testCase.Height,
                Orientation = testCase.Orientation,
                Margin = 3,
                OffsetX = 2,
                OffsetY = 1,
            };
            using var native = new DesktopCaptureFrameSource(
                new ScreenCaptureRegion(0, 0, 800, 480),
                config,
                new PatternCapturer(),
                sharedFrames: null,
                preferNativeRgb565: true);
            using var fallback = new DesktopCaptureFrameSource(
                new ScreenCaptureRegion(0, 0, 800, 480),
                config,
                new PatternCapturer(),
                sharedFrames: null,
                preferNativeRgb565: false);
            var nativePixels = new byte[config.Width * config.Height * 2];
            var fallbackPixels = new byte[nativePixels.Length];

            native.Render(new TelemetryFrame(), nativePixels);
            fallback.Render(new TelemetryFrame(), fallbackPixels);

            var error = RgbError(
                nativePixels,
                fallbackPixels,
                config.Width,
                config.Height,
                tileSize: 32);
            Assert.True(
                error.Mean < 16,
                $"Whole-frame mean RGB error was {error.Mean:0.00}; expected < 16.");
            Assert.True(
                error.MaximumTile < 48,
                $"Localized 32px-tile RGB error was {error.MaximumTile:0.00}; expected < 48.");
        }
    }

    [Fact]
    public void NativeRearViewCompositionReadsEachNewCapturedFrame()
    {
        var config = new ScreenConfig
        {
            Width = 80,
            Height = 48,
            Orientation = DeviceOrientation.Landscape,
        };
        using var source = new DesktopCaptureFrameSource(
            new ScreenCaptureRegion(0, 0, 800, 480),
            config,
            new ChangingCapturer());
        var first = new byte[config.Width * config.Height * 2];
        var second = new byte[first.Length];

        source.Render(new TelemetryFrame(), first);
        source.Render(new TelemetryFrame(), second);

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void WindowsCapturerReusesItsNativeSurfaceUntilTheOutputSizeChanges()
    {
        var factory = new RecordingSurfaceFactory();
        var capturer = new WindowsDesktopRegionCapturer(factory);
        var region = new ScreenCaptureRegion(0, 0, 1600, 960);

        Assert.True(capturer.TryCapture(region, 800, 480, new byte[800 * 480 * 4]));
        Assert.True(capturer.TryCapture(region, 800, 480, new byte[800 * 480 * 4]));

        var first = Assert.Single(factory.Surfaces);
        Assert.Equal(2, first.Captures);
        Assert.False(first.Disposed);

        Assert.True(capturer.TryCapture(region, 480, 800, new byte[480 * 800 * 4]));
        Assert.Equal(2, factory.Surfaces.Count);
        Assert.True(first.Disposed);
        Assert.Equal(1, factory.Surfaces[1].Captures);

        capturer.Dispose();
        Assert.True(factory.Surfaces[1].Disposed);
    }

    private static (double Mean, double MaximumTile) RgbError(
        byte[] left,
        byte[] right,
        int width,
        int height,
        int tileSize)
    {
        var leftBgra = new byte[width * height * 4];
        var rightBgra = new byte[leftBgra.Length];
        Rgb565.ToBgra(left, width, height, leftBgra);
        Rgb565.ToBgra(right, width, height, rightBgra);
        long total = 0;
        var maximumTile = 0d;
        for (var tileY = 0; tileY < height; tileY += tileSize)
        {
            for (var tileX = 0; tileX < width; tileX += tileSize)
            {
                long tileTotal = 0;
                var tileSamples = 0;
                for (var y = tileY; y < Math.Min(height, tileY + tileSize); y++)
                {
                    for (var x = tileX; x < Math.Min(width, tileX + tileSize); x++)
                    {
                        var offset = (y * width + x) * 4;
                        tileTotal += Math.Abs(leftBgra[offset] - rightBgra[offset]);
                        tileTotal += Math.Abs(leftBgra[offset + 1] - rightBgra[offset + 1]);
                        tileTotal += Math.Abs(leftBgra[offset + 2] - rightBgra[offset + 2]);
                        tileSamples += 3;
                    }
                }

                total += tileTotal;
                maximumTile = Math.Max(maximumTile, tileTotal / (double)tileSamples);
            }
        }

        return (total / (double)(width * height * 3), maximumTile);
    }

    private static SavedDevice ScreenDevice(int rotation) => new()
    {
        Id = "capture-screen",
        Name = "Capture screen",
        Type = "screen",
        Driver = "vocore",
        Width = 480,
        Height = 800,
        Rotation = rotation,
    };
}
