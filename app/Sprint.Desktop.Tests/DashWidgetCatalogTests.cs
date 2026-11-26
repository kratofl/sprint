using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashWidgetCatalogTests
{
    [Fact]
    public void CatalogContainsDefaultPresetAndCriticalWidgetTypes()
    {
        string[] expected = new[]
        {
            "text",
            "rpm_bar",
            "gear_speed",
            "input_trace",
            "current_lap",
            "last_lap",
            "delta",
            "fuel",
            "tyre_temp",
            "flag",
            "tc",
            "tyre_temp_numbers",
            "brake_temp_numbers",
            "tyre_brake_temp_numbers",
        };

        foreach (string? type in expected)
        {
            Assert.True(DashWidgetCatalog.IsKnown(type), $"Expected widget catalog to include '{type}'.");
        }

        DashWidgetDefinition gearSpeed = DashWidgetCatalog.Get("gear_speed");
        Assert.Equal("Gear + Speed", gearSpeed.Name);
        Assert.Contains("car.gear", gearSpeed.Bindings);
        Assert.Contains("car.speed", gearSpeed.Bindings);

        // The gear's parts round its digit are switches the inspector offers, on but the flip.
        Assert.Equal([("inputs", "on"), ("readouts", "on"), ("flip", "off")], DashWidgetCatalog.Get("gear").Config.Select(field => (field.Key, field.Default)));
        Assert.All(DashWidgetCatalog.Get("gear").Config, field => Assert.Equal(DashConfigKind.Switch, field.Kind));
    }

    [Fact]
    public void CatalogIncludesExpandedRealDashboardWidgets()
    {
        // US30: race context + hybrid readouts real dashboards expose.
        foreach (string? type in new[] { "position", "gap_ahead", "predictive_lap", "tyre_pressure", "ve_percent" })
        {
            Assert.True(DashWidgetCatalog.IsKnown(type), $"Expected expanded catalog to include '{type}'.");
        }

        Assert.Contains("race.gapAhead", DashWidgetCatalog.Get("gap_ahead").Bindings);
        Assert.Contains("race.gapBehind", DashWidgetCatalog.Get("gap_behind").Bindings);
        Assert.Equal("Virtual Energy", DashWidgetCatalog.Get("ve_percent").Name);
    }

    [Fact]
    public void FuelTargetDeclaresAPlannedTargetNotActualConsumption()
    {
        // #189: the widget used to read car.fuelPerLapLiters, which is what the car is
        // burning — a "target" nobody set and nobody can miss.
        DashWidgetDefinition fuelTarget = DashWidgetCatalog.Get("fuel_target");

        Assert.Contains("target.fuelPerLapLiters", fuelTarget.Bindings);
        Assert.DoesNotContain("car.fuelPerLapLiters", fuelTarget.Bindings);
    }

    [Fact]
    public void RetiredAndSplitWidgetTypesAreGone()
    {
        foreach (string type in new[] { "header", "sector", "lap_time", "slip", "cut", "arb", "bar" })
        {
            Assert.False(DashWidgetCatalog.IsKnown(type), $"'{type}' was retired or split.");
        }
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
        DashLayout layout = new DashLayout
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
