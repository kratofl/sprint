using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Input;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class MultiDialTests
{
    private static readonly UsbIdPattern ButtonBox = new() { Vid = 0x16D0, Pid = 0x127A };

    private static readonly MultiDialLayout Layout = new()
    {
        Label = "MULTI",
        Positions =
        [
            new MultiDialPosition { Input = "button:102", Label = "DASH", Color = "#1F7FE6" },
            new MultiDialPosition { Input = "button:103", Label = "TC2", Color = "#E0A30C" },
            new MultiDialPosition { Input = "button:104", Label = "MAP", Color = "#16B566" },
        ],
    };

    private static MultiDialTracker TrackerForOneWheel()
    {
        MultiDialTracker tracker = new();
        tracker.Configure([new MultiDialSource("wheel", [ButtonBox], ["button:102", "button:103", "button:104"])]);
        return tracker;
    }

    private static HardwareInputEvent FromButtonBox(string input) => new(0x16D0, 0x127A, input);

    [Fact]
    public void FirstReportSetsThePositionWithoutCountingATurn()
    {
        MultiDialTracker tracker = TrackerForOneWheel();
        Assert.Equal(MultiDialStatus.Unknown, tracker.StatusOf("wheel"));

        Assert.True(tracker.Observe(FromButtonBox("button:103")));

        Assert.Equal(new MultiDialStatus(1, 0), tracker.StatusOf("wheel"));
    }

    [Fact]
    public void EveryTurnToAnotherPositionCountsOnce()
    {
        MultiDialTracker tracker = TrackerForOneWheel();
        tracker.Observe(FromButtonBox("button:102"));

        tracker.Observe(FromButtonBox("button:104"));
        tracker.Observe(FromButtonBox("button:104"));
        tracker.Observe(FromButtonBox("button:103"));

        Assert.Equal(new MultiDialStatus(1, 2), tracker.StatusOf("wheel"));
    }

    [Fact]
    public void OtherButtonsAndOtherDevicesAreLeftForTheBindings()
    {
        MultiDialTracker tracker = TrackerForOneWheel();

        Assert.False(tracker.Observe(FromButtonBox("button:68")));
        Assert.False(tracker.Observe(new HardwareInputEvent(0x1234, 0x0001, "button:102")));
        Assert.Equal(MultiDialStatus.Unknown, tracker.StatusOf("wheel"));
    }

    [Fact]
    public void AWheelThatIsNoLongerFollowedForgetsItsPosition()
    {
        MultiDialTracker tracker = TrackerForOneWheel();
        tracker.Observe(FromButtonBox("button:102"));

        tracker.Configure([]);

        Assert.Equal(MultiDialStatus.Unknown, tracker.StatusOf("wheel"));
    }

    [Fact]
    public void RenamingOnePositionKeepsThePresetNamesOfTheOthers()
    {
        MultiDialSettings settings = MultiDials.WithPosition(Layout, null, 1, new MultiDialLabel("STRAT", "#F02744"));

        Assert.Equal(
            [new MultiDialLabel("DASH", "#1F7FE6"), new MultiDialLabel("STRAT", "#F02744"), new MultiDialLabel("MAP", "#16B566")],
            MultiDials.LabelsOf(Layout, settings));
        Assert.False(settings.InvertPopup);
    }

    [Fact]
    public void ADeviceSavedBeforePresetIdsFindsItsPresetByName()
    {
        CatalogDevice omega = new() { Id = "omega", Name = "Omega", Type = "wheel", Driver = "vocore", MultiDial = Layout };
        SavedDevice legacy = new() { Id = "wheel", Name = "Omega", Type = "wheel", Driver = "vocore" };
        SavedDevice renamed = new() { Id = "other", Name = "My wheel", Type = "wheel", Driver = "vocore" };

        Assert.Same(Layout, MultiDials.LayoutOf(legacy, [omega]));
        Assert.Null(MultiDials.LayoutOf(renamed, [omega]));
    }
}
