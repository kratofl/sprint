using System.Diagnostics;
using System.Runtime.InteropServices;
using SkiaSharp;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Runtime;
using Xunit;
using Xunit.Abstractions;

namespace Sprint.Desktop.Tests;

internal sealed class RenderingDiagnosticFactAttribute : FactAttribute
{
    public RenderingDiagnosticFactAttribute()
    {
        if (!string.Equals(
                Environment.GetEnvironmentVariable("SPRINT_RENDER_DIAGNOSTICS"),
                "1",
                StringComparison.Ordinal))
        {
            Skip = "Set SPRINT_RENDER_DIAGNOSTICS=1 to run rendering benchmarks and write comparison artifacts.";
        }
    }
}

public sealed class RenderingOptimizationDiagnosticsTests(ITestOutputHelper output)
{
    private sealed class BenchmarkCapturer : IDesktopRegionCapturer
    {
        public bool TryCapture(
            ScreenCaptureRegion region,
            int destinationWidth,
            int destinationHeight,
            byte[] bgra)
        {
            Array.Fill(bgra, (byte)0x7f);
            return true;
        }
    }

    [RenderingDiagnosticFact]
    public void DirectRgb565ExperimentReportsPerformanceAndQualityDiagnostics()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        var artifactRoot = Path.Combine(
            TestEnv.RepoRoot,
            "app",
            "Sprint.Desktop.Tests",
            "artifacts",
            "rendering-optimization",
            "latest");
        Directory.CreateDirectory(artifactRoot);
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            var layouts = new[]
            {
                runtime.DashLayouts.First(layout => layout.IsDefault),
                DevicePurposeLayouts.Resolve(
                    new SavedDevice { Purpose = DevicePurposes.LapTimes },
                    runtime.DashLayouts)
                    ?? throw new InvalidOperationException("Lap timer layout was not resolved."),
            };
            var frame = new TelemetryFrame
            {
                Car = new CarState
                {
                    Gear = 4,
                    Rpm = 7425,
                    MaxRpm = 9000,
                    SpeedMetersPerSecond = 51.67f,
                },
                Lap = new LapState
                {
                    CurrentLap = 7,
                    CurrentLapTime = 82.413,
                    LastLapTime = 81.972,
                    BestLapTime = 81.404,
                },
            };

            foreach (var layout in layouts)
            {
                foreach (var size in new[]
                         {
                             (Width: 320, Height: 240, Iterations: 10),
                             (Width: 480, Height: 272, Iterations: 8),
                             (Width: 800, Height: 480, Iterations: 4),
                         })
                {
                    RunCase(
                        runtime,
                        layout,
                        frame,
                        size.Width,
                        size.Height,
                        size.Iterations,
                        artifactRoot);
                }
            }
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [RenderingDiagnosticFact]
    public void NativeRearViewCompositionReportsProductionAdapterDiagnostics()
    {
        var cases = new[]
        {
            (Width: 320, Height: 240, Orientation: DeviceOrientation.Landscape, Iterations: 20),
            (Width: 480, Height: 272, Orientation: DeviceOrientation.Landscape, Iterations: 15),
            (Width: 800, Height: 480, Orientation: DeviceOrientation.Landscape, Iterations: 8),
            (Width: 480, Height: 800, Orientation: DeviceOrientation.Landscape, Iterations: 8),
        };

        foreach (var testCase in cases)
        {
            var config = new ScreenConfig
            {
                Width = testCase.Width,
                Height = testCase.Height,
                Orientation = testCase.Orientation,
                Margin = 5,
            };
            using var native = new DesktopCaptureFrameSource(
                new ScreenCaptureRegion(0, 0, 1600, 900),
                config,
                new BenchmarkCapturer(),
                sharedFrames: null,
                preferNativeRgb565: true);
            using var fallback = new DesktopCaptureFrameSource(
                new ScreenCaptureRegion(0, 0, 1600, 900),
                config,
                new BenchmarkCapturer(),
                sharedFrames: null,
                preferNativeRgb565: false);
            var nativePixels = new byte[config.Width * config.Height * 2];
            var fallbackPixels = new byte[nativePixels.Length];
            var frame = new TelemetryFrame();
            void RenderNative() => native.Render(frame, nativePixels);
            void RenderFallback() => fallback.Render(frame, fallbackPixels);
            RenderNative();
            RenderFallback();

            var nativeMeasurement = Measure(RenderNative, testCase.Iterations);
            var fallbackMeasurement = Measure(RenderFallback, testCase.Iterations);
            output.WriteLine(
                $"rear-view {testCase.Width}x{testCase.Height} {testCase.Orientation}: " +
                $"fused={fallbackMeasurement.Elapsed.TotalMilliseconds / testCase.Iterations:0.000} ms/frame " +
                $"({fallbackMeasurement.AllocatedBytes / testCase.Iterations:0} B/frame), " +
                $"native={nativeMeasurement.Elapsed.TotalMilliseconds / testCase.Iterations:0.000} ms/frame " +
                $"({nativeMeasurement.AllocatedBytes / testCase.Iterations:0} B/frame)");
            Assert.True(
                nativeMeasurement.Elapsed < fallbackMeasurement.Elapsed,
                "Native rear-view composition must be faster than the fused managed fallback.");
            Assert.True(
                nativeMeasurement.AllocatedBytes
                    <= fallbackMeasurement.AllocatedBytes + testCase.Iterations * 64,
                "Native rear-view composition must not introduce a per-frame allocation regression.");
        }
    }

    private void RunCase(
        DesktopRuntime runtime,
        DashLayout layout,
        TelemetryFrame frame,
        int nativeWidth,
        int nativeHeight,
        int iterations,
        string artifactRoot)
    {
        const int margin = 5;
        const int offsetX = 2;
        const int offsetY = 2;
        var transform = DeviceOrientations.Transform(
            nativeWidth,
            nativeHeight,
            DeviceOrientation.Landscape);
        var palette = DashPalette.FromLayout(layout);
        using var bgraPainter = new DashPainter(
            transform.LogicalWidth,
            transform.LogicalHeight,
            palette);
        using var directPainter = new DashPainter(
            transform.LogicalWidth,
            transform.LogicalHeight,
            palette);
        var legacy = new byte[nativeWidth * nativeHeight * 2];
        var direct = new byte[legacy.Length];
        var directHandle = GCHandle.Alloc(direct, GCHandleType.Pinned);
        try
        {
            var info = new SKImageInfo(
                nativeWidth,
                nativeHeight,
                SKColorType.Rgb565,
                SKAlphaType.Opaque);
            using var directSurface = SKSurface.Create(
                info,
                directHandle.AddrOfPinnedObject(),
                nativeWidth * 2)
                ?? throw new InvalidOperationException("Skia did not create the caller-backed RGB565 surface.");
            var outputTransform = ScreenCanvasTransform.Create(
                nativeWidth,
                nativeHeight,
                transform,
                margin,
                offsetX,
                offsetY);

            void RenderBgraThenCompose()
            {
                var bitmap = bgraPainter.Render(layout, frame, runtime.Settings);
                Rgb565.ComposeFromBgra(
                    bitmap.GetPixelSpan(),
                    nativeWidth,
                    nativeHeight,
                    transform,
                    margin,
                    offsetX,
                    offsetY,
                    legacy);
            }

            void RenderDirect() =>
                directPainter.RenderToSurface(
                    directSurface,
                    layout,
                    frame,
                    runtime.Settings,
                    outputTransform: outputTransform);

            RenderBgraThenCompose();
            RenderDirect();
            Assert.Contains(legacy, value => value != 0);
            Assert.Contains(direct, value => value != 0);
            Assert.Equal(0, direct[0]);
            Assert.Equal(0, direct[1]);

            var bgraMeasurement = Measure(RenderBgraThenCompose, iterations);
            var directMeasurement = Measure(RenderDirect, iterations);
            var meanChannelError = MeanAbsoluteChannelError(
                legacy,
                direct,
                nativeWidth,
                nativeHeight);
            var maximumTileError = MaximumTileChannelError(
                legacy,
                direct,
                nativeWidth,
                nativeHeight,
                tileSize: 32);

            WriteRgb565Png(
                legacy,
                nativeWidth,
                nativeHeight,
                Path.Combine(artifactRoot, $"{layout.Id}-{nativeWidth}x{nativeHeight}-bgra-fused.png"));
            WriteSurfacePng(
                directSurface,
                Path.Combine(artifactRoot, $"{layout.Id}-{nativeWidth}x{nativeHeight}-direct-rgb565.png"));
            output.WriteLine(
                $"{layout.Id} {nativeWidth}x{nativeHeight}: " +
                $"BGRA+fused={bgraMeasurement.Elapsed.TotalMilliseconds / iterations:0.000} ms/frame " +
                $"({bgraMeasurement.AllocatedBytes / iterations:0} B/frame), " +
                $"direct RGB565={directMeasurement.Elapsed.TotalMilliseconds / iterations:0.000} ms/frame " +
                $"({directMeasurement.AllocatedBytes / iterations:0} B/frame), " +
                $"mean RGB error={meanChannelError:0.00}, " +
                $"maximum 32px tile error={maximumTileError:0.00}");
            Assert.True(
                directMeasurement.Elapsed < bgraMeasurement.Elapsed,
                "Direct RGB565 must be faster than BGRA rendering plus composition.");
            Assert.True(
                meanChannelError < 16,
                $"Whole-frame mean RGB error was {meanChannelError:0.00}; expected < 16.");
            Assert.True(
                maximumTileError < 48,
                $"Localized 32px-tile RGB error was {maximumTileError:0.00}; expected < 48.");

            var config = new ScreenConfig
            {
                Width = nativeWidth,
                Height = nativeHeight,
                Orientation = DeviceOrientation.Landscape,
                Margin = margin,
                OffsetX = offsetX,
                OffsetY = offsetY,
            };
            using var productionDirect = new DashPainterFrameSource(
                layout,
                runtime.Settings,
                config,
                palette);
            using var productionFallback = new DashPainterFrameSource(
                layout,
                runtime.Settings,
                config,
                palette,
                preferDirectRgb565: false);
            var productionDirectPixels = new byte[legacy.Length];
            var productionFallbackPixels = new byte[legacy.Length];
            void RenderProductionDirect() =>
                productionDirect.Render(frame, productionDirectPixels);
            void RenderProductionFallback() =>
                productionFallback.Render(frame, productionFallbackPixels);
            RenderProductionDirect();
            RenderProductionFallback();
            var productionDirectMeasurement = Measure(RenderProductionDirect, iterations);
            var productionFallbackMeasurement = Measure(RenderProductionFallback, iterations);
            output.WriteLine(
                $"{layout.Id} {nativeWidth}x{nativeHeight} adapter: " +
                $"fallback={productionFallbackMeasurement.Elapsed.TotalMilliseconds / iterations:0.000} ms/frame " +
                $"({productionFallbackMeasurement.AllocatedBytes / iterations:0} B/frame), " +
                $"direct={productionDirectMeasurement.Elapsed.TotalMilliseconds / iterations:0.000} ms/frame " +
                $"({productionDirectMeasurement.AllocatedBytes / iterations:0} B/frame)");
            Assert.True(
                productionDirectMeasurement.Elapsed < productionFallbackMeasurement.Elapsed,
                "The production direct adapter must be faster than its fallback.");
            Assert.True(
                productionDirectMeasurement.AllocatedBytes
                    <= productionFallbackMeasurement.AllocatedBytes + iterations * 64,
                "The production direct adapter must not introduce a per-frame allocation regression.");
        }
        finally
        {
            directHandle.Free();
        }
    }

    private static (TimeSpan Elapsed, long AllocatedBytes) Measure(Action action, int iterations)
    {
        var stopwatch = Stopwatch.StartNew();
        var allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
        for (var iteration = 0; iteration < iterations; iteration++)
        {
            action();
        }

        var allocatedBytes = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
        stopwatch.Stop();
        return (stopwatch.Elapsed, allocatedBytes);
    }

    private static double MeanAbsoluteChannelError(
        byte[] expected,
        byte[] actual,
        int width,
        int height)
    {
        var expectedBgra = new byte[width * height * 4];
        var actualBgra = new byte[expectedBgra.Length];
        Rgb565.ToBgra(expected, width, height, expectedBgra);
        Rgb565.ToBgra(actual, width, height, actualBgra);
        long total = 0;
        for (var pixel = 0; pixel < width * height; pixel++)
        {
            var offset = pixel * 4;
            total += Math.Abs(expectedBgra[offset] - actualBgra[offset]);
            total += Math.Abs(expectedBgra[offset + 1] - actualBgra[offset + 1]);
            total += Math.Abs(expectedBgra[offset + 2] - actualBgra[offset + 2]);
        }

        return total / (double)(width * height * 3);
    }

    private static double MaximumTileChannelError(
        byte[] expected,
        byte[] actual,
        int width,
        int height,
        int tileSize)
    {
        var expectedBgra = new byte[width * height * 4];
        var actualBgra = new byte[expectedBgra.Length];
        Rgb565.ToBgra(expected, width, height, expectedBgra);
        Rgb565.ToBgra(actual, width, height, actualBgra);
        var maximum = 0d;
        for (var tileY = 0; tileY < height; tileY += tileSize)
        {
            for (var tileX = 0; tileX < width; tileX += tileSize)
            {
                long total = 0;
                var samples = 0;
                for (var y = tileY; y < Math.Min(height, tileY + tileSize); y++)
                {
                    for (var x = tileX; x < Math.Min(width, tileX + tileSize); x++)
                    {
                        var offset = (y * width + x) * 4;
                        total += Math.Abs(expectedBgra[offset] - actualBgra[offset]);
                        total += Math.Abs(expectedBgra[offset + 1] - actualBgra[offset + 1]);
                        total += Math.Abs(expectedBgra[offset + 2] - actualBgra[offset + 2]);
                        samples += 3;
                    }
                }

                maximum = Math.Max(maximum, total / (double)samples);
            }
        }

        return maximum;
    }

    private static void WriteRgb565Png(byte[] pixels, int width, int height, string path)
    {
        var handle = GCHandle.Alloc(pixels, GCHandleType.Pinned);
        try
        {
            var info = new SKImageInfo(width, height, SKColorType.Rgb565, SKAlphaType.Opaque);
            using var surface = SKSurface.Create(
                info,
                handle.AddrOfPinnedObject(),
                width * 2)
                ?? throw new InvalidOperationException("Skia did not wrap the composed RGB565 buffer.");
            WriteSurfacePng(surface, path);
        }
        finally
        {
            handle.Free();
        }
    }

    private static void WriteSurfacePng(SKSurface surface, string path)
    {
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        File.WriteAllBytes(path, data.ToArray());
    }
}
