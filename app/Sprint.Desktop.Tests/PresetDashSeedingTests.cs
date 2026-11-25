using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class PresetDashSeedingTests
{
    [Fact]
    public void EveryShippedPresetIsSeededOnceAndADeletedOneStaysDeleted()
    {
        string dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            // A preset that does not validate is only logged and skipped: every shipped file must arrive.
            Assert.Equal(Directory.GetFiles(Path.Combine(TestEnv.PresetRoot, "dash"), "*.json").Length, runtime.DashLayouts.Count);
            Assert.Contains(runtime.DashLayouts, layout => layout.Id == "default");
            DashLayout hypercar = Assert.Single(runtime.DashLayouts, layout => layout.Id == "hypercar");
            Assert.Contains(hypercar.Pages, page => page.Jump == DashPageJump.FlyingLap);

            runtime.DeleteDashLayout(hypercar);
            DesktopRuntime reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            Assert.DoesNotContain(reloaded.DashLayouts, layout => layout.Id == "hypercar");
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void AnInstallFromBeforeTheHypercarGetsItOnce()
    {
        string dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            // What an older Sprint left: the empty marker from when "default" was the only preset,
            // and that dash since deleted. The default stays gone; the later presets arrive.
            string layouts = Path.Combine(dataRoot, "dash-layouts");
            Directory.CreateDirectory(layouts);
            File.WriteAllText(Path.Combine(layouts, ".preset-seeded"), "");

            DesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            Assert.Equal(["endurance", "hypercar"], runtime.DashLayouts.Select(layout => layout.Id).ToArray());
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void ResettingTheHypercarPutsBackItsOwnPages()
    {
        string dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            DashLayout hypercar = runtime.DashLayouts.Single(layout => layout.Id == "hypercar");
            int pages = hypercar.Pages.Count;
            hypercar.Pages.RemoveAt(0);

            runtime.ResetDashLayout(hypercar);

            Assert.Equal(pages, hypercar.Pages.Count);
            Assert.Equal("practice", hypercar.Pages[0].Id);
            Assert.Equal("Hypercar", hypercar.Name);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}
