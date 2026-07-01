using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashPreviewRendererTests
{
    [Fact]
    public void RenderPlanResolvesWidgetBoundsAndBindings()
    {
        var layout = new DashLayout
        {
            Id = "test-layout",
            GridCols = 20,
            GridRows = 12,
            Pages =
            [
                new DashPage
                {
                    Id = "main",
                    Name = "Main",
                    Widgets =
                    [
                        new DashWidget
                        {
                            Id = "gear-speed",
                            Type = "gear_speed",
                            Col = 10,
                            Row = 6,
                            ColSpan = 5,
                            RowSpan = 3
                        }
                    ]
                }
            ]
        };

        var context = new DashBindingContext(
            new TelemetryFrame
            {
                Car = new CarState
                {
                    Gear = 5,
                    SpeedMetersPerSecond = 75
                }
            },
            new AppSettings());

        var plan = DashPreviewRenderer.BuildPlan(layout, context, 320, 192);

        var widget = Assert.Single(plan.Widgets);
        Assert.Equal("gear-speed", widget.Id);
        Assert.Equal("Gear + Speed", widget.Label);
        Assert.Equal(new DashRenderBounds(160, 96, 80, 48), widget.Bounds);
        Assert.Equal(5, widget.Bindings["car.gear"]);
        Assert.Equal(270, widget.Bindings["car.speed"]);
    }
}
