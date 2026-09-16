using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The HUD's testable surface (#195): the bindable command, which windows the overlay set is
/// made of, and where each of them is allowed to come back. The Win32 calls themselves are not
/// unit-tested — they are guarded and fall back safely, the same standard the WinUSB transport
/// is held to, and they need a real desktop compositor and a real game to mean anything.
/// </summary>
public sealed class LiveCompareHudTests
{
    private static readonly HudScreen Primary = new(0, 0, 2560, 1440);
    private static readonly HudScreen Secondary = new(2560, 0, 1920, 1080);

    private const string Brake = "brake";
    private const string Speed = "speed";

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
    public void TheOverlayIsOneSmallWindowPerReadingRatherThanOneStack()
    {
        // The driver asked for small windows they place and size one by one: throttle against
        // the target, brake against the target, speed against the target.
        var specs = HudWindowPlan.Build(new LiveCompareSettings());

        Assert.Equal(
            [HudWindowPlan.DeltaWindowId, "throttle", Brake, Speed],
            specs.Select(spec => spec.Id));
        Assert.Equal(3, HudWindowPlan.Panels(specs).Count);
    }

    [Fact]
    public void EveryChartWindowDrawsExactlyOneChart()
    {
        // A window holding two panels is the stack this replaced.
        foreach (var spec in HudWindowPlan.Build(new LiveCompareSettings()))
        {
            if (spec.Panel is { } panel)
            {
                Assert.Single(panel.Channels);
            }
        }
    }

    [Fact]
    public void TheDeltaWindowCanBeTurnedOffWithoutTakingTheChartsWithIt()
    {
        var specs = HudWindowPlan.Build(new LiveCompareSettings { ShowDelta = false });

        Assert.DoesNotContain(specs, spec => spec.Id == HudWindowPlan.DeltaWindowId);
        Assert.Equal(3, specs.Count);
    }

    [Fact]
    public void ALayoutIsKeyedByWindowAsWellAsMonitorPositionAndResolution()
    {
        // Per-window, so the driver's brake window and speed window do not fight over one slot.
        Assert.NotEqual(
            HudLayoutStore.KeyFor(Brake, Primary),
            HudLayoutStore.KeyFor(Speed, Primary));

        Assert.NotEqual(
            HudLayoutStore.KeyFor(Brake, Primary),
            HudLayoutStore.KeyFor(Brake, Secondary));
        // Same monitor, different resolution: the old rectangle is the wrong shape now.
        Assert.NotEqual(
            HudLayoutStore.KeyFor(Brake, Primary),
            HudLayoutStore.KeyFor(Brake, Primary with { Width = 1920, Height = 1080 }));
        Assert.Equal(HudLayoutStore.KeyFor(Brake, Primary), HudLayoutStore.KeyFor(Brake, Primary));
    }

    [Fact]
    public void EachWindowComesBackWhereItWasLeft()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Brake, Primary, 300, 200, 420, 180);
        HudLayoutStore.Save(settings, Speed, Primary, 300, 400, 420, 180);

        var brake = HudLayoutStore.Restore(settings, Brake, [Primary]);
        Assert.NotNull(brake);
        Assert.Equal(300, brake!.X);
        Assert.Equal(200, brake.Y);
        Assert.Equal(420, brake.Width);
        Assert.Equal(180, brake.Height);

        Assert.Equal(400, HudLayoutStore.Restore(settings, Speed, [Primary])!.Y);
    }

    [Fact]
    public void EachMonitorKeepsItsOwnPlacement()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Brake, Primary, 100, 100, 380, 160);
        HudLayoutStore.Save(settings, Brake, Secondary, 2600, 50, 300, 140);

        Assert.Equal(100, HudLayoutStore.Restore(settings, Brake, [Primary])!.X);
        Assert.Equal(2600, HudLayoutStore.Restore(settings, Brake, [Secondary])!.X);
    }

    [Fact]
    public void SavingTwiceOnOneMonitorReplacesRatherThanAccumulates()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Brake, Primary, 100, 100, 380, 160);
        HudLayoutStore.Save(settings, Brake, Primary, 140, 120, 400, 170);

        Assert.Single(settings.Layouts);
        Assert.Equal(140, HudLayoutStore.Restore(settings, Brake, [Primary])!.X);
    }

    [Fact]
    public void ALayoutForAMonitorThatIsGoneIsNotRestored()
    {
        var settings = new LiveCompareSettings();
        HudLayoutStore.Save(settings, Brake, Secondary, 2600, 50, 380, 160);

        // The second monitor was unplugged; restoring 2600px across would put a click-through
        // window somewhere the driver cannot see or drag back.
        Assert.Null(HudLayoutStore.Restore(settings, Brake, [Primary]));
    }

    [Fact]
    public void ALayoutThatNoLongerOverlapsItsScreenIsDiscarded()
    {
        var settings = new LiveCompareSettings();
        HudLayoutStore.Save(settings, Brake, Primary, 100, 100, 380, 160);
        settings.Layouts[0].X = -4000;

        Assert.Null(HudLayoutStore.Restore(settings, Brake, [Primary]));
    }

    [Fact]
    public void TheFirstPlacementIsAColumnWhereNoWindowLandsOnAnother()
    {
        var specs = HudWindowPlan.Build(new LiveCompareSettings());
        var column = HudLayoutStore.DefaultColumn(specs, Primary);

        Assert.Equal(specs.Count, column.Count);
        for (var i = 1; i < column.Count; i++)
        {
            Assert.True(
                column[i].Y >= column[i - 1].Y + column[i - 1].Height,
                $"window {i} opens on top of window {i - 1}");
        }
    }

    [Fact]
    public void TheFirstColumnStillDoesNotOverlapOnAScaledDisplay()
    {
        // Avalonia gives a window's position in physical pixels and its size in
        // device-independent ones. A column laid out without the conversion fits at 100% and
        // opens with every window on top of the one above it at 150%.
        var scaled = Primary with { Scaling = 1.5 };
        var specs = HudWindowPlan.Build(new LiveCompareSettings());
        var column = HudLayoutStore.DefaultColumn(specs, scaled);

        for (var i = 1; i < column.Count; i++)
        {
            Assert.True(
                column[i].Y >= column[i - 1].Y + column[i - 1].Height,
                $"window {i} opens on top of window {i - 1} at 150%");
        }

        // Each window covers the same area of glass, which is more pixels.
        Assert.True(column[1].Width > HudLayoutStore.DefaultColumn(specs, Primary)[1].Width);

        // Scaling is not part of the layout key: the rectangle is stored in physical pixels, so
        // changing the display scale must not lose a placement the driver chose.
        Assert.Equal(HudLayoutStore.KeyFor(Brake, Primary), HudLayoutStore.KeyFor(Brake, scaled));
    }

    [Fact]
    public void TheFirstPlacementStaysOffTheRacingLineInTheCentreOfTheScreen()
    {
        // A driver's eyes live on the racing line in the middle of the frame, so the column
        // hugs the left. Vertically it may run past the middle — a left column is out of the
        // way at any height.
        foreach (var layout in HudLayoutStore.DefaultColumn(HudWindowPlan.Build(new LiveCompareSettings()), Primary))
        {
            Assert.True(layout.X + layout.Width < Primary.Width / 2, "must not reach the centre");
            Assert.True(layout.Y >= Primary.Y);
            Assert.True(layout.Y + layout.Height <= Primary.Y + Primary.Height);
        }
    }

    [Fact]
    public void EveryOverlayWindowIsOverlaySizedNotAThirdOfTheScreen()
    {
        // The first build sized this as a fraction, which on a 2560-wide monitor put an 870 px
        // window on top of the game. That is a second window, not a HUD.
        foreach (var layout in HudLayoutStore.DefaultColumn(HudWindowPlan.Build(new LiveCompareSettings()), Primary))
        {
            Assert.InRange(layout.Width, HudLayoutStore.MinWidth, 420);
            Assert.InRange(layout.Height, HudLayoutStore.MinHeight, 200);
        }
    }

    [Fact]
    public void ASmallScreenStillGetsAColumnThatFitsOnIt()
    {
        var screen = new HudScreen(0, 0, 1024, 600);

        foreach (var layout in HudLayoutStore.DefaultColumn(HudWindowPlan.Build(new LiveCompareSettings()), screen))
        {
            Assert.True(layout.X + layout.Width <= screen.Width);
            Assert.True(layout.Y + layout.Height <= screen.Height);
        }
    }

    [Fact]
    public void ADegenerateSavedSizeIsClampedRatherThanRestoredAsASliver()
    {
        var settings = new LiveCompareSettings();

        HudLayoutStore.Save(settings, Brake, Primary, 100, 100, 4, 4);

        var restored = HudLayoutStore.Restore(settings, Brake, [Primary])!;
        Assert.Equal(HudLayoutStore.MinWidth, restored.Width);
        Assert.Equal(HudLayoutStore.MinHeight, restored.Height);
    }

    [Fact]
    public void TheFullscreenCaseIsStatedRatherThanShowingNothing()
    {
        // Spec §2.3: a HUD that silently shows nothing is the worst outcome, so the message has
        // to name the cause and the fix.
        Assert.Contains("exclusive fullscreen", CompareHudHost.FullscreenNotice, StringComparison.Ordinal);
        Assert.Contains("borderless", CompareHudHost.FullscreenNotice, StringComparison.Ordinal);
    }

    [Fact]
    public void TheHudDefaultsMatchTheWindowsAndPanelsTheDriverAskedFor()
    {
        var settings = new LiveCompareSettings();

        Assert.Equal(200, settings.MetersBehind);
        Assert.Equal(600, settings.MetersAhead);
        // Throttle, brake and speed, one window each — driver feedback 2026-08-07.
        Assert.Equal(["throttle", "brake", "speed"], settings.PanelIds);
        Assert.True(settings.ShowDelta);
        Assert.False(settings.Locked);
    }

    [Fact]
    public void ThrottleAndBrakeAreSeparatePanelsAndNeitherIsFilled()
    {
        // In a single-channel panel the two series are the same channel on two laps. A fill
        // would wash them over each other and stop meaning magnitude; colour keeps meaning
        // whose lap it is (spec §2.3).
        Assert.False(LapChartPanels.Throttle.FillFirst);
        Assert.False(LapChartPanels.Brake.FillFirst);
        // The combined panel still exists for the Analysis view, where they share an axis.
        Assert.True(LapChartPanels.Pedals.FillFirst);
    }

    [Fact]
    public void PreferencesFromAOneWindowBuildAreResetRatherThanKept()
    {
        // A driver who opened the overlay already had the stacked panel set and a rectangle
        // sized for one big window persisted, so the fix has to reach their settings file, not
        // only new installs.
        var settings = new LiveCompareSettings { Version = 2, PanelIds = ["pedals", Speed, "gear"] };
        HudLayoutStore.Save(settings, "hud", Primary, 100, 100, 460, 340);

        Assert.True(settings.Migrate());

        Assert.Equal(["throttle", Brake, Speed], settings.PanelIds);
        Assert.True(settings.ShowDelta);
        Assert.Empty(settings.Layouts);
        // Idempotent: the next start must not wipe a placement the driver has since chosen.
        HudLayoutStore.Save(settings, Brake, Primary, 40, 40, 380, 160);
        Assert.False(settings.Migrate());
        Assert.Single(settings.Layouts);
    }
}
