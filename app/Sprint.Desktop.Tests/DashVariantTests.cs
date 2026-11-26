using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>A dash's versions per scope: the most specific one matching the device and car replaces what the dash draws.</summary>
public sealed class DashVariantTests
{
    private static DashPage Page(string name) => new() { Id = "p", Name = name, Widgets = [new DashWidget { Id = "gear", Type = "gear", Col = 0, Row = 0, ColSpan = 1, RowSpan = 1 }] };

    private static DashVariant Variant(string pageName, string? device = null, string? game = null, string? carClass = null, string? car = null) => new()
    {
        Scope = new DashVariantScope { Device = device, Game = game, CarClass = carClass, Car = car },
        Layout = new DashVariantLayout { GridCols = 10, GridRows = 9, Pages = [Page(pageName)] },
    };

    private static DashLayout Dash(params DashVariant[] variants) => new()
    {
        Id = "race",
        Name = "Race",
        GridCols = 10,
        GridRows = 9,
        Pages = [Page("Base")],
        Variants = [.. variants],
    };

    private static string Shows(DashLayout dash, string device, string car) =>
        DashVariants.For(dash, device, "LeMansUltimate", new DriverCar("LeMansUltimate", car).Class, car).Pages[0].Name;

    [Fact]
    public void For_PrefersTheCarOverItsClassOverItsGame_AndADevicesOwnAtTheSameLevel()
    {
        DashLayout dash = Dash(
            Variant("Game", game: "LeMansUltimate"),
            Variant("Class", carClass: "Hypercar"),
            Variant("Wheel class", device: "wheel", carClass: "Hypercar"),
            Variant("Car", car: "Hypercar BMW"));

        Assert.Equal("Car", Shows(dash, "wheel", "Hypercar BMW"));
        Assert.Equal("Wheel class", Shows(dash, "wheel", "Hypercar Ferrari"));
        Assert.Equal("Class", Shows(dash, "button-box", "Hypercar Ferrari"));
        Assert.Equal("Game", Shows(dash, "wheel", "LMGT3 Porsche"));
    }

    [Fact]
    public void For_ShowsTheDashItselfWhereNoVariantMatches_AndKeepsItsNameAndAlerts()
    {
        DashLayout dash = Dash(Variant("Class", carClass: "Hypercar"));

        DashLayout itself = DashVariants.For(dash, "wheel", "LeMansUltimate", "LMGT3", "LMGT3 Porsche");
        Assert.Same(dash.Pages, itself.Pages);
        Assert.Null(itself.Variants);
        DashLayout shown = DashVariants.For(dash, "wheel", "LeMansUltimate", "Hypercar", "Hypercar BMW");
        Assert.Equal(("race", "Race", "Class"), (shown.Id, shown.Name, shown.Pages[0].Name));
        Assert.Same(dash.Alerts, shown.Alerts);
        Assert.Null(shown.Variants);
    }

    [Fact]
    public void Resolve_ShowsTheDevicesDashAsItsVariantForTheCar()
    {
        DashLayout dash = Dash(Variant("Class", carClass: "Hypercar"));
        SavedDevice device = new() { Id = "wheel", Type = "screen", Driver = "vocore", Width = 800, Height = 480, DashId = "race" };

        Assert.Equal("Class", DevicePurposeLayouts.Resolve(device, [dash], new DriverCar("LeMansUltimate", "Hypercar BMW"))?.Pages[0].Name);
        Assert.Equal("Base", DevicePurposeLayouts.Resolve(device, [dash], new DriverCar("LeMansUltimate", "LMGT3 Porsche"))?.Pages[0].Name);
    }

    [Fact]
    public void IsValid_RefusesAVariantWithNoScope_AScopeTwice_OrAWidgetOffItsGrid()
    {
        Assert.True(DashLayoutValidator.IsValid(Dash(Variant("Class", carClass: "Hypercar"), Variant("Car", car: "Hypercar BMW"))));
        Assert.False(DashLayoutValidator.IsValid(Dash(Variant("Nowhere"))));
        Assert.False(DashLayoutValidator.IsValid(Dash(Variant("Class", carClass: "Hypercar"), Variant("Again", carClass: "hypercar"))));

        DashVariant offGrid = Variant("Class", carClass: "Hypercar");
        offGrid.Layout.Pages[0].Widgets[0].Col = 10;
        Assert.False(DashLayoutValidator.IsValid(Dash(offGrid)));
    }
}
