using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Input;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>A stack's layers switched from the wheel's buttons (#269): per device, every stack on the page it shows.</summary>
public sealed class DashStackLayerTests
{
    private static DashWidget Widget(string id, string group, bool hidden = false) => new() { Id = id, Type = "speed", Group = group, Col = 0, Row = 0, ColSpan = 1, RowSpan = 1, Hidden = hidden };

    // A stack of three layers (b shown first, c hidden) on the race page; the tyres page has none.
    private static DashLayout Dash(bool hiddenLayer = true) => new()
    {
        Id = "race",
        Pages =
        [
            new DashPage
            {
                Id = "race",
                Name = "Race",
                Widgets = [Widget("a", "stack"), Widget("b", "stack"), Widget("c", "stack", hidden: hiddenLayer)],
                Groups = [new DashWidgetGroup { Id = "stack", Name = "Stack", Mode = DashGroupMode.OneAtATime, ShownFirst = "b" }],
            },
            new DashPage { Id = "tyres", Name = "Tyres" },
        ],
    };

    [Fact]
    public void MoveLayers_StepsFromTheLayerShownFirst_WrapsAround_AndSkipsAHiddenLayer()
    {
        DashPageCycle cycle = new();
        DashLayout dash = Dash();

        Assert.Empty(cycle.LayersOf("wheel"));
        Assert.True(cycle.MoveLayers("wheel", dash, 1));
        Assert.Equal("a", cycle.LayersOf("wheel")["stack"]);
        Assert.True(cycle.MoveLayers("wheel", dash, -1));
        Assert.Equal("b", cycle.LayersOf("wheel")["stack"]);
        Assert.Empty(cycle.LayersOf("box"));
    }

    [Fact]
    public void MoveLayers_ActsOnThePageTheDeviceShows_AndKeepsTheLayerAcrossPageChanges()
    {
        DashPageCycle cycle = new();
        DashLayout dash = Dash(hiddenLayer: false);

        Assert.True(cycle.Show("wheel", dash, "tyres"));
        Assert.False(cycle.MoveLayers("wheel", dash, 1), "no stack on the tyres page");

        cycle.Show("wheel", dash, "race");
        IReadOnlyDictionary<string, string> before = cycle.LayersOf("wheel");
        cycle.MoveLayers("wheel", dash, 1);
        Assert.NotSame(before, cycle.LayersOf("wheel"));
        Assert.Equal("c", cycle.LayersOf("wheel")["stack"]);

        cycle.Show("wheel", dash, "tyres");
        cycle.Show("wheel", dash, "race");
        Assert.Equal("c", cycle.LayersOf("wheel")["stack"]);
    }

    [Fact]
    public void ButtonFunctions_OfferTheLayerButtonsOnlyForADashWithAStack()
    {
        Assert.Contains(ButtonFunctions.For(Dash()), function => function.Id == SprintCommands.DashLayerNext);
        DashLayout plain = new() { Id = "plain", Pages = [new DashPage { Id = "p", Name = "Page" }] };
        Assert.DoesNotContain(ButtonFunctions.For(plain), function => function.Id == SprintCommands.DashLayerNext);
    }
}
