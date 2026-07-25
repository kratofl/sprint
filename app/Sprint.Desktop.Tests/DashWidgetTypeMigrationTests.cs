using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public class DashWidgetTypeMigrationTests
{
    [Fact]
    public void Rewrites_legacy_ers_widgets_across_pages_and_stacks()
    {
        var layout = new DashLayout
        {
            IdlePage = new DashPage
            {
                Widgets = [new DashWidget { Id = "idle-ers", Type = "ers" }],
            },
            Pages =
            [
                new DashPage
                {
                    Widgets = [new DashWidget { Id = "page-ers", Type = "ers" }],
                    WidgetStacks =
                    [
                        new DashWidgetStack
                        {
                            Layers =
                            [
                                new DashWidgetStackLayer
                                {
                                    Widgets = [new DashWidget { Id = "stack-ers", Type = "ERS" }],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        var changed = DashWidgetTypeMigration.Apply(layout);

        Assert.True(changed);
        Assert.Equal("virtual_energy", layout.IdlePage!.Widgets[0].Type);
        Assert.Equal("virtual_energy", layout.Pages[0].Widgets[0].Type);
        Assert.Equal("virtual_energy", layout.Pages[0].WidgetStacks[0].Layers[0].Widgets[0].Type);
    }

    [Fact]
    public void Leaves_layouts_without_legacy_types_untouched()
    {
        var layout = new DashLayout
        {
            Pages = [new DashPage { Widgets = [new DashWidget { Id = "ve", Type = "virtual_energy" }] }],
        };

        Assert.False(DashWidgetTypeMigration.Apply(layout));
        Assert.Equal("virtual_energy", layout.Pages[0].Widgets[0].Type);
    }
}
