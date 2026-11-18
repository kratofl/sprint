using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>A device's dash for a game, class or car: the most specific rule wins, else its own dash.</summary>
public sealed class DeviceDashRuleTests
{
    private static readonly DriverCar BmwHypercar = new("LeMansUltimate", "Hypercar BMW");

    private static DeviceDashRule Rule(string kind, string value, string dashId) => new() { Kind = kind, Value = value, DashId = dashId };

    [Fact]
    public void Pick_PrefersTheCarOverItsClassOverItsGame()
    {
        List<DeviceDashRule> rules =
        [
            Rule(DeviceDashRules.Game, "LeMansUltimate", "lmu"),
            Rule(DeviceDashRules.Class, "hypercar", "hyper"),
            Rule(DeviceDashRules.Car, "Hypercar BMW", "bmw"),
            Rule(DeviceDashRules.Class, "LMGT3", "gt3"),
        ];

        Assert.Equal("bmw", DeviceDashRules.Pick(rules, BmwHypercar, _ => true));
        Assert.Equal("hyper", DeviceDashRules.Pick(rules, BmwHypercar with { Car = "Hypercar Ferrari" }, _ => true));
        Assert.Equal("gt3", DeviceDashRules.Pick(rules, BmwHypercar with { Car = "LMGT3 Porsche" }, _ => true));
        Assert.Equal("lmu", DeviceDashRules.Pick(rules, BmwHypercar with { Car = "LMP2 ELMS" }, _ => true));
        Assert.Null(DeviceDashRules.Pick(rules, DriverCar.None, _ => true));
    }

    [Fact]
    public void Pick_PassesOverARuleWhoseDashIsGone()
    {
        List<DeviceDashRule> rules = [Rule(DeviceDashRules.Car, "Hypercar BMW", "deleted"), Rule(DeviceDashRules.Class, "Hypercar", "hyper")];

        Assert.Equal("hyper", DeviceDashRules.Pick(rules, BmwHypercar, id => id != "deleted"));
    }

    [Fact]
    public void Resolve_ShowsTheRulesDashForTheCarAndTheDevicesOwnOtherwise()
    {
        DashLayout own = new() { Id = "own", Name = "Own", Pages = [new DashPage { Id = "p", Name = "Driving" }] };
        DashLayout hyper = new() { Id = "hyper", Name = "Hypercar", Pages = [new DashPage { Id = "p", Name = "Driving" }] };
        SavedDevice device = new()
        {
            Id = "wheel",
            Type = "screen",
            Driver = "vocore",
            Width = 800,
            Height = 480,
            DashId = "own",
            DashRules = [Rule(DeviceDashRules.Class, "Hypercar", "hyper")],
        };

        Assert.Same(hyper, DevicePurposeLayouts.Resolve(device, [own, hyper], BmwHypercar));
        Assert.Same(own, DevicePurposeLayouts.Resolve(device, [own, hyper], BmwHypercar with { Car = "LMGT3 Porsche" }));
    }
}
