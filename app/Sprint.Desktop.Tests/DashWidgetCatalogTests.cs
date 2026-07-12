using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashWidgetCatalogTests
{
    [Fact]
    public void CatalogContainsDefaultPresetAndCriticalWidgetTypes()
    {
        var expected = new[]
        {
            "header",
            "text",
            "rpm_bar",
            "gear_speed",
            "input_trace",
            "sector",
            "lap_time",
            "delta",
            "fuel",
            "tyre_temp",
            "flag",
            "tc"
        };

        foreach (var type in expected)
        {
            Assert.True(DashWidgetCatalog.IsKnown(type), $"Expected widget catalog to include '{type}'.");
        }

        var gearSpeed = DashWidgetCatalog.Get("gear_speed");
        Assert.Equal("Gear + Speed", gearSpeed.Name);
        Assert.Contains("car.gear", gearSpeed.Bindings);
        Assert.Contains("car.speed", gearSpeed.Bindings);
    }

    [Fact]
    public void CatalogIncludesExpandedRealDashboardWidgets()
    {
        // US30: race context + hybrid readouts real dashboards expose.
        foreach (var type in new[] { "position", "gaps", "predictive_lap", "tyre_pressure", "ers" })
        {
            Assert.True(DashWidgetCatalog.IsKnown(type), $"Expected expanded catalog to include '{type}'.");
        }

        Assert.Contains("race.gapAhead", DashWidgetCatalog.Get("gaps").Bindings);
        Assert.Contains("race.gapBehind", DashWidgetCatalog.Get("gaps").Bindings);
        Assert.Equal("ERS / Hybrid", DashWidgetCatalog.Get("ers").Name);
    }

    [Fact]
    public void CatalogRejectsUnknownWidgetTypes()
    {
        Assert.False(DashWidgetCatalog.IsKnown("unknown-widget"));
        Assert.Throws<KeyNotFoundException>(() => DashWidgetCatalog.Get("unknown-widget"));
    }

    [Fact]
    public void LayoutValidationRejectsUnknownWidgetTypes()
    {
        var layout = new DashLayout
        {
            Id = "invalid-widget",
            Pages =
            [
                new DashPage
                {
                    Id = "main",
                    Name = "Main",
                    Widgets =
                    [
                        new DashWidget { Id = "unknown", Type = "unknown-widget", Col = 0, Row = 0, ColSpan = 1, RowSpan = 1 }
                    ]
                }
            ]
        };

        Assert.False(DashLayoutValidator.IsValid(layout));
    }
}
