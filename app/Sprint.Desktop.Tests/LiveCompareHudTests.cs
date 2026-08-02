using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The HUD's testable surface (#195): the bindable command, and where the overlay is allowed to
/// come back. The Win32 calls themselves are not unit-tested — they are guarded and fall back
/// safely, the same standard the WinUSB transport is held to, and they need a real desktop
/// compositor and a real game to mean anything.
/// </summary>
public sealed class LiveCompareHudTests
{
    private static readonly HudScreen Primary = new(0, 0, 2560, 1440);
    private static readonly HudScreen Secondary = new(2560, 0, 1920, 1080);

    [Fact]
    public void TheToggleIsBindableFromAKeyboardAsWellAsAWheel()
    {
        var bus = new CommandBus();
        SprintCommands.RegisterDefaults(bus);

        var meta = bus.Catalog().Single(command => command.Id == SprintCommands.CompareHudToggle);

        Assert.Equal("Live Compare", meta.Category);
        Assert.True(meta.Capturable);
        // Most drivers have no spare wheel button to give this, so the keyboard fallback must work.
        Assert.False(meta.DeviceOnly);
    }

    [Fact]
    public void OnlyTheToggleIsBindableSoALockedHudNeverBecomesUnreachable()
    {
        // Lock and target selection live in the Sprint window: a locked HUD is click-through,
        // so a binding that put them only on the overlay would be a dead end.
        var bus = new CommandBus();
        SprintCommands.RegisterDefaults(bus);

        Assert.Single(bus.Catalog(), command => command.Category == "Live Compare");
    }

    [Fact]
    public void ALayoutIsKeyedByMonitorPositionAndResolution()
    {
        Assert.NotEqual(HudLayoutStore.KeyFor(Primary), HudLayoutStore.KeyFor(Secondary));
        // Same monitor, different resolution: the old rectangle is the wrong shape now.
        Assert.NotEqual(
            HudLayoutStore.KeyFor(Primary),
            HudLayoutStore.KeyFor(Primary with { Width = 1920, Height = 1080 }));
        Assert.Equal(HudLayoutStore.KeyFor(Primary), HudLayoutStore.KeyFor(Primary));
    }

    [Fact]
    public void TheHudComesBackWhereItWasLeft()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Primary, 300, 200, 800, 500);
        var restored = HudLayoutStore.Restore(settings, [Primary]);

        Assert.NotNull(restored);
        Assert.Equal(300, restored!.X);
        Assert.Equal(200, restored.Y);
        Assert.Equal(800, restored.Width);
        Assert.Equal(500, restored.Height);
    }

    [Fact]
    public void EachMonitorKeepsItsOwnPlacement()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Primary, 100, 100, 800, 500);
        HudLayoutStore.Save(settings, Secondary, 2600, 50, 600, 400);

        Assert.Equal(100, HudLayoutStore.Restore(settings, [Primary])!.X);
        Assert.Equal(2600, HudLayoutStore.Restore(settings, [Secondary])!.X);
    }

    [Fact]
    public void SavingTwiceOnOneMonitorReplacesRatherThanAccumulates()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Primary, 100, 100, 800, 500);
        HudLayoutStore.Save(settings, Primary, 140, 120, 820, 520);

        Assert.Single(settings.Layouts);
        Assert.Equal(140, HudLayoutStore.Restore(settings, [Primary])!.X);
    }

    [Fact]
    public void ALayoutForAMonitorThatIsGoneIsNotRestored()
    {
        var settings = new LiveCompareSettings();
        HudLayoutStore.Save(settings, Secondary, 2600, 50, 600, 400);

        // The second monitor was unplugged; restoring 2600px across would put a click-through
        // window somewhere the driver cannot see or drag back.
        Assert.Null(HudLayoutStore.Restore(settings, [Primary]));
    }

    [Fact]
    public void ALayoutThatNoLongerOverlapsItsScreenIsDiscarded()
    {
        var settings = new LiveCompareSettings();
        HudLayoutStore.Save(settings, Primary, 100, 100, 800, 500);
        settings.Layouts[0].X = -4000;

        Assert.Null(HudLayoutStore.Restore(settings, [Primary]));
    }

    [Fact]
    public void TheFirstPlacementStaysOffTheRacingLineInTheCentreOfTheScreen()
    {
        var layout = HudLayoutStore.Default(Primary);

        Assert.True(layout.X + layout.Width < Primary.Width / 2, "must not reach the centre");
        Assert.True(layout.Y + layout.Height < Primary.Height / 2);
        Assert.True(layout.Width >= HudLayoutStore.MinWidth);
        Assert.True(layout.Height >= HudLayoutStore.MinHeight);
    }

    [Fact]
    public void ADegenerateSavedSizeIsClampedRatherThanRestoredAsASliver()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Primary, 100, 100, 4, 4);

        var restored = HudLayoutStore.Restore(settings, [Primary])!;
        Assert.Equal(HudLayoutStore.MinWidth, restored.Width);
        Assert.Equal(HudLayoutStore.MinHeight, restored.Height);
    }

    [Fact]
    public void TheFullscreenCaseIsStatedRatherThanShowingNothing()
    {
        // Spec §2.3: a HUD that silently shows nothing is the worst outcome, so the message has
        // to name the cause and the fix.
        Assert.Contains("exclusive fullscreen", CompareHudWindow.FullscreenNotice, StringComparison.Ordinal);
        Assert.Contains("borderless", CompareHudWindow.FullscreenNotice, StringComparison.Ordinal);
    }

    [Fact]
    public void TheHudDefaultsMatchTheProposedWindowAndPanels()
    {
        var settings = new LiveCompareSettings();

        Assert.Equal(200, settings.MetersBehind);
        Assert.Equal(600, settings.MetersAhead);
        Assert.Equal(["speed", "pedals"], settings.PanelIds);
        Assert.False(settings.Locked);
    }
}
