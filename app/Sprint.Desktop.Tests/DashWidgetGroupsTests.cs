using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public class DashWidgetGroupsTests
{
    // A dash as saved before groups: a page widget, and a stack whose two layers reuse ids
    // that are already taken on the page.
    private const string LegacyDashJson = """
        {
          "id": "legacy", "name": "Legacy", "gridCols": 20, "gridRows": 12,
          "pages": [{
            "id": "main", "name": "Main",
            "widgets": [{ "id": "fuel", "type": "fuel", "col": 0, "row": 0, "colSpan": 4, "rowSpan": 2 }],
            "widgetStacks": [{
              "id": "stack", "name": "Right column", "col": 14, "row": 4, "colSpan": 6, "rowSpan": 8,
              "defaultLayerId": "layer-2",
              "layers": [
                { "id": "layer-1", "name": "Timing", "widgets": [{ "id": "fuel", "type": "lap_time", "col": 0, "row": 0, "colSpan": 6, "rowSpan": 4 }] },
                { "id": "layer-2", "name": "Tyres", "widgets": [{ "id": "tyres", "type": "tyre_temp", "col": 0, "row": 0, "colSpan": 9, "rowSpan": 4 }] }
              ]
            }]
          }]
        }
        """;

    [Fact]
    public void Widget_stacks_load_as_a_one_at_a_time_group_that_draws_the_same()
    {
        DashLayout layout = Deserialize(LegacyDashJson);

        Assert.True(DashWidgetStackMigration.Apply(layout));

        DashPage page = layout.Pages[0];
        Assert.Null(page.LegacyWidgetStacks);
        DashWidgetGroup stack = Assert.Single(page.Groups, group => group.Mode == DashGroupMode.OneAtATime);
        Assert.Equal("Right column", stack.Name);
        Assert.Equal(["layer-1", "layer-2"], page.Groups.Where(group => group.Parent == stack.Id).Select(group => group.Id));
        Assert.Equal("layer-2", stack.ShownFirst);

        // Layer widgets move into page coordinates, clipped to the stack; a taken id gets a suffix.
        DashWidget timing = Assert.Single(page.Widgets, widget => widget.Type == "lap_time");
        Assert.Equal(("fuel-2", "layer-1", 14, 4, 6, 4), (timing.Id, timing.Group, timing.Col, timing.Row, timing.ColSpan, timing.RowSpan));
        DashWidget tyres = Assert.Single(page.Widgets, widget => widget.Type == "tyre_temp");
        Assert.Equal(6, tyres.ColSpan);

        // The two layers share cells, which only layers of one stack may.
        Assert.True(DashLayoutValidator.IsValid(layout));
        Assert.False(DashWidgetStackMigration.Apply(layout));
    }

    [Fact]
    public void Groups_survive_a_save_and_a_cloud_round_trip_without_the_old_stacks()
    {
        DashLayout layout = Deserialize(LegacyDashJson);
        DashWidgetStackMigration.Apply(layout);
        layout.Pages[0].Widgets[0].Hidden = true;

        string saved = JsonSerializer.Serialize(layout);
        Assert.DoesNotContain("widgetStacks", saved, StringComparison.Ordinal);
        Assert.Equal(saved, JsonSerializer.Serialize(Deserialize(saved)));

        // Cloud sync writes enums with its own converter; the mode must still come back.
        JsonSerializerOptions cloud = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
        DashLayout downloaded = JsonSerializer.Deserialize<DashLayout>(JsonSerializer.Serialize(layout, cloud), cloud) ?? throw new InvalidOperationException();
        Assert.Equal(saved, JsonSerializer.Serialize(downloaded));
    }

    [Fact]
    public void Only_layers_of_one_stack_may_share_cells()
    {
        DashLayout layout = LayoutWith(
            [Widget("a", "one"), Widget("b", "two")],
            [new DashWidgetGroup { Id = "stack", Mode = DashGroupMode.OneAtATime }, new DashWidgetGroup { Id = "one", Parent = "stack" }, new DashWidgetGroup { Id = "two", Parent = "stack" }]);
        Assert.True(DashLayoutValidator.IsValid(layout));

        layout.Pages[0].Groups[0].Mode = DashGroupMode.Together;
        Assert.False(DashLayoutValidator.IsValid(layout));

        layout.Pages[0].Groups[0].Mode = DashGroupMode.OneAtATime;
        layout.Pages[0].Widgets[1].Group = "one";
        Assert.False(DashLayoutValidator.IsValid(layout));
    }

    [Theory]
    [InlineData("missing", null)]
    [InlineData(null, "loop")]
    [InlineData("a", null)]
    public void Groups_must_form_a_tree(string? widgetGroup, string? groupParent)
    {
        DashLayout layout = LayoutWith(
            [Widget("a", widgetGroup)],
            [new DashWidgetGroup { Id = widgetGroup == "a" ? "a" : "loop", Parent = groupParent }]);

        Assert.False(DashLayoutValidator.IsValid(layout));
    }

    [Fact]
    public void A_refit_keeps_the_layers_of_a_stack_on_top_of_each_other()
    {
        DashLayout layout = LayoutWith(
            [Widget("a", "stack"), Widget("b", "stack")],
            [new DashWidgetGroup { Id = "stack", Mode = DashGroupMode.OneAtATime }]);

        DashLayoutEditor.RefitLayoutToGrid(layout, 10, 6);

        Assert.Equal(2, layout.Pages[0].Widgets.Count);
        Assert.All(layout.Pages[0].Widgets, widget => Assert.Equal((2, 1), (widget.ColSpan, widget.RowSpan)));
    }

    private static DashLayout Deserialize(string json) =>
        JsonSerializer.Deserialize<DashLayout>(json) ?? throw new InvalidOperationException("Not a dash.");

    private static DashWidget Widget(string id, string? group) =>
        new() { Id = id, Type = "fuel", Col = 0, Row = 0, ColSpan = 4, RowSpan = 2, Group = group };

    private static DashLayout LayoutWith(List<DashWidget> widgets, List<DashWidgetGroup> groups) => new()
    {
        Id = "layout",
        GridCols = 20,
        GridRows = 12,
        Pages = [new DashPage { Id = "main", Name = "Main", Widgets = widgets, Groups = groups }],
    };
}
