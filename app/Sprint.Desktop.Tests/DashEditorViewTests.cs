using Avalonia.Controls;
using Avalonia.Headless;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashEditorViewTests
{
    [Fact]
    public async Task Editor_view_constructs_and_renders_headless()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(DashEditorViewTests).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                var layout = runtime.DashLayouts.First(item => item.IsDefault);
                var controller = new DashEditorController(layout, runtime.SaveDashLayout);
                var view = new DashEditorView(controller, runtime.Settings, () => new TelemetryFrame(), () => { });

                var window = new Window { Width = 1200, Height = 800, Content = view };
                window.Show();

                // The default preset's main page is fully tiled; add a fresh empty
                // page, then a widget, to exercise the add path + view rebuild.
                controller.AddPage();
                Assert.True(controller.AddWidget("fuel"));

                var frame = window.CaptureRenderedFrame();
                Assert.NotNull(frame);
                Assert.True(frame!.PixelSize.Width > 0 && frame.PixelSize.Height > 0);

                window.Close();
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
