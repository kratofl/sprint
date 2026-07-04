using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Headless;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class VisualSmokeTests
{
    public static IEnumerable<object[]> PrimaryViews()
    {
        foreach (var view in new[]
        {
            AppView.Live,
            AppView.Engineer,
            AppView.Setup,
            AppView.Dashes,
            AppView.Devices,
            AppView.Settings,
            AppView.Help
        })
        {
            yield return [view, 1440, 900];
            yield return [view, 1120, 720];
        }
    }

    [Theory]
    [MemberData(nameof(PrimaryViews))]
    public async Task Primary_shell_views_capture_meaningful_rendered_png_artifacts(AppView view, int width, int height)
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(VisualSmokeTests).Assembly);

        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var shell = new ShellState();
                shell.Navigate(view);
                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, shell, telemetry)
                {
                    Width = width,
                    Height = height
                };

                window.Show();
                using var frame = SaveFrame(window, $"{view.ToString().ToLowerInvariant()}-{width}x{height}.png");
                window.Close();

                AssertMeaningfulImage(frame);
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static string VisualArtifactRoot()
    {
        var path = Path.Combine(TestEnv.RepoRoot, "app", "Sprint.Desktop.Tests", "artifacts", "visual");
        Directory.CreateDirectory(path);
        return path;
    }

    private static Bitmap SaveFrame(MainWindow window, string fileName)
    {
        var path = Path.Combine(VisualArtifactRoot(), fileName);
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        var captured = frame!;
        Assert.True(captured.PixelSize.Width > 0, "Expected captured frame to have a positive width.");
        Assert.True(captured.PixelSize.Height > 0, "Expected captured frame to have a positive height.");
        captured.Save(path);
        Assert.True(File.Exists(path), $"Expected visual artifact at {path}.");
        Assert.True(new FileInfo(path).Length > 0, $"Expected non-empty visual artifact at {path}.");
        return captured;
    }

    private static void AssertMeaningfulImage(Bitmap frame)
    {
        var pixelSize = frame.PixelSize;
        Assert.True(pixelSize.Width > 0, "Expected captured frame to decode with a positive width.");
        Assert.True(pixelSize.Height > 0, "Expected captured frame to decode with a positive height.");

        var stride = pixelSize.Width * 4;
        var bytes = new byte[stride * pixelSize.Height];
        using var copy = new WriteableBitmap(
            pixelSize,
            new Vector(96, 96),
            PixelFormat.Bgra8888,
            AlphaFormat.Premul);

        using (var framebuffer = copy.Lock())
        {
            frame.CopyPixels(framebuffer);
            Marshal.Copy(framebuffer.Address, bytes, 0, bytes.Length);
        }

        var visiblePixels = 0;
        var colorBuckets = new HashSet<int>();
        for (var i = 0; i < bytes.Length; i += 4)
        {
            var blue = bytes[i];
            var green = bytes[i + 1];
            var red = bytes[i + 2];
            var alpha = bytes[i + 3];
            if (alpha == 0)
            {
                continue;
            }

            visiblePixels++;
            colorBuckets.Add(((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5));
        }

        var totalPixels = pixelSize.Width * pixelSize.Height;
        Assert.True(visiblePixels > totalPixels / 2, "Expected captured frame to contain visible pixels.");
        Assert.True(colorBuckets.Count >= 8, $"Expected captured frame to contain varied rendered content, found {colorBuckets.Count} color buckets.");
    }
}
