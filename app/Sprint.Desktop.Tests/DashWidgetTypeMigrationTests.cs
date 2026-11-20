using System.Text.Json;
using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public class DashWidgetTypeMigrationTests
{
    [Fact]
    public void Rewrites_legacy_ers_widgets_on_every_page()
    {
        DashLayout layout = new DashLayout
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
                },
            ],
        };

        bool changed = DashWidgetTypeMigration.Apply(layout);

        Assert.True(changed);
        Assert.Equal("ve_percent", layout.IdlePage!.Widgets[0].Type);
        Assert.Equal("ve_percent", layout.Pages[0].Widgets[0].Type);
    }

    [Fact]
    public void Leaves_layouts_without_legacy_types_untouched()
    {
        DashLayout layout = new DashLayout
        {
            Pages = [new DashPage { Widgets = [new DashWidget { Id = "ve", Type = "ve_percent" }] }],
        };

        Assert.False(DashWidgetTypeMigration.Apply(layout));
        Assert.Equal("ve_percent", layout.Pages[0].Widgets[0].Type);
    }

    [Fact]
    public void Retired_widgets_become_the_single_value_their_setting_picked()
    {
        DashPage page = new DashPage
        {
            Widgets =
            [
                Widget("last", "lap_time", ("show", "last")),
                Widget("all", "lap_time", ("show", "all")),
                Widget("class", "lap_time", ("show", "class")),
                Widget("behind", "gaps", ("side", "behind")),
                Widget("both", "gaps", ("side", "both")),
                Widget("budget", "virtual_energy", ("mode", "budget")),
                Widget("core", "tyre_temp", ("channel", "core")),
                Widget("soc", "soc"),
                Widget("header", "header"),
            ],
        };
        DashLayout layout = new DashLayout { Pages = [page] };

        Assert.True(DashWidgetTypeMigration.Apply(layout));

        Assert.Equal(
            ["last_lap", "current_lap", "class_best", "gap_behind", "gap_ahead", "ve_percent", "tyre_core_temp", "battery"],
            page.Widgets.Select(widget => widget.Type).ToArray());
        Assert.All(page.Widgets, widget => Assert.Null(widget.Config));
    }

    [Fact]
    public void A_zoned_flag_in_the_top_bar_spot_goes_and_the_pit_limiter_widgets_migrate()
    {
        DashLayout layout = new DashLayout
        {
            Id = "zoned",
            Zoned = true,
            GridCols = DashZones.Cols,
            GridRows = DashZones.Rows,
            Pages =
            [
                new DashPage
                {
                    Widgets =
                    [
                        new DashWidget { Id = "flag-top", Type = "flag", Col = 1, Row = 0, ColSpan = 2, RowSpan = 1 },
                        new DashWidget { Id = "flag-grid", Type = "flag", Col = 1, Row = 1, ColSpan = 2, RowSpan = 1 },
                    ],
                },
            ],
            ExtensionData = new Dictionary<string, JsonElement>
            {
                ["pitLimiter"] = JsonSerializer.SerializeToElement(new
                {
                    style = "box",
                    widgets = new[] { new { id = "pit-weather", type = "weather", col = 1, row = 1, colSpan = 2, rowSpan = 1 } },
                }),
            },
        };

        Assert.True(DashWidgetTypeMigration.Apply(layout));

        Assert.Equal(["flag-grid"], layout.Pages[0].Widgets.Select(widget => widget.Id).ToArray());
        Assert.NotNull(layout.ExtensionData);
        JsonElement pitLimiter = layout.ExtensionData["pitLimiter"];
        Assert.Equal("box", pitLimiter.GetProperty("style").GetString());
        Assert.Equal("air_temp", pitLimiter.GetProperty("widgets")[0].GetProperty("type").GetString());
        Assert.True(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void A_saved_copy_of_the_old_hypercar_preset_still_loads()
    {
        string dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            // A copy seeded by the Sprint before the zoned redesign retired lap_time, gaps, soc and the rest.
            string layouts = Path.Combine(dataRoot, "dash-layouts");
            Directory.CreateDirectory(layouts);
            File.Copy(Path.Combine(TestEnv.RepoRoot, "app", "Sprint.Desktop.Tests", "Fixtures", "hypercar-before-dash-v2.json"), Path.Combine(layouts, "hypercar.json"));
            File.WriteAllLines(Path.Combine(layouts, ".preset-seeded"), ["default", "hypercar"]);

            DesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);

            DashLayout hypercar = Assert.Single(runtime.DashLayouts, layout => layout.Id == "hypercar");
            Assert.True(DashLayoutValidator.IsValid(hypercar));
            DashPage push = hypercar.Pages.Single(page => page.Id == "push");
            Assert.Contains(push.Widgets, widget => widget.Type == "class_best");
            // Re-saved upgraded (ids keep their old names; only the types change).
            Assert.DoesNotContain("\"lap_time\"", File.ReadAllText(Path.Combine(layouts, "hypercar.json")));
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static DashWidget Widget(string id, string type, params (string Key, string Value)[] config) => new DashWidget
    {
        Id = id,
        Type = type,
        Config = config.Length == 0 ? null : config.ToDictionary(entry => entry.Key, entry => JsonSerializer.SerializeToElement(entry.Value)),
    };
}
