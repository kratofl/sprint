using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Media;
using Sprint.Desktop;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class GraphiteTokenTests
{
    [Fact]
    public void Graphite_color_tokens_match_calm_precision_contract()
    {
        Assert.Equal(Color.Parse("#0B0B0D"), Graphite.Bg);
        Assert.Equal(Color.Parse("#101012"), Graphite.Panel);
        Assert.Equal(Color.Parse("#141416"), Graphite.Panel2);
        Assert.Equal(Color.Parse("#1B1B1E"), Graphite.Panel3);
        Assert.Equal(Color.Parse("#12FFFFFF"), Graphite.Line);
        Assert.Equal(Color.Parse("#1FFFFFFF"), Graphite.Line2);
        Assert.Equal(Color.Parse("#F5F5F7"), Graphite.Text);
        Assert.Equal(Color.Parse("#A1A1AA"), Graphite.Text2);
        Assert.Equal(Color.Parse("#6F6F78"), Graphite.Text3);
        Assert.Equal(Color.Parse("#FF6A00"), Graphite.Accent);
        Assert.Equal(Color.Parse("#16B566"), Graphite.Green);
        Assert.Equal(Color.Parse("#F02744"), Graphite.Red);
        Assert.Equal(Color.Parse("#E0A30C"), Graphite.Yellow);
        Assert.Equal(Color.Parse("#1F7FE6"), Graphite.Blue);
    }

    [Fact]
    public void Graphite_layout_tokens_match_calm_precision_contract()
    {
        Assert.Equal(4, Graphite.RadiusXs);
        Assert.Equal(7, Graphite.RadiusSm);
        Assert.Equal(7, Graphite.RadiusMd);
        Assert.Equal(10, Graphite.RadiusLg);
        Assert.Equal(12, Graphite.RadiusXl);
        Assert.Equal(999, Graphite.RadiusPill);

        Assert.Equal(2, Graphite.Space1);
        Assert.Equal(4, Graphite.Space2);
        Assert.Equal(6, Graphite.Space3);
        Assert.Equal(8, Graphite.Space4);
        Assert.Equal(10, Graphite.Space5);
        Assert.Equal(14, Graphite.Space6);
        Assert.Equal(16, Graphite.Space7);
        Assert.Equal(18, Graphite.Space8);
        Assert.Equal(20, Graphite.Space9);
        Assert.Equal(22, Graphite.Space10);
        Assert.Equal(36, Graphite.Space12);

        Assert.Equal(44, Graphite.ToolbarHeight);
        Assert.Equal(184, Graphite.SidebarExpandedWidth);
        Assert.Equal(52, Graphite.SidebarCollapsedWidth);
    }

    [Fact]
    public async Task Graphite_buttons_use_compact_continuous_geometry()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var button = Graphite.Button("Save");

            Assert.Equal(30, button.MinHeight);
            Assert.Equal(new Thickness(12, 6), button.Padding);
            Assert.Equal(13, button.FontSize);
            Assert.Equal(FontWeight.Medium, button.FontWeight);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), button.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_segmented_uses_a_neutral_tonal_selection()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var control = Graphite.Segmented(new[] { "Pages", "Widgets" }, 1, _ => { });
            var container = Assert.IsType<Border>(control);
            Assert.Equal(Graphite.Panel2Brush, container.Background);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), container.CornerRadius);

            var group = Assert.IsType<StackPanel>(container.Child);
            var selected = Assert.IsType<Button>(group.Children[1]);
            Assert.Equal(Graphite.Panel3Brush, selected.Background);
            Assert.Equal(Graphite.TextBrush, selected.Foreground);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), selected.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_tab_view_uses_neutral_selected_segment()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var control = Graphite.TabView(new[] { "Layout", "Alerts", "Settings" }, 0, _ => { });
            var container = Assert.IsType<Border>(control);
            Assert.Equal(Graphite.Panel2Brush, container.Background);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), container.CornerRadius);

            var group = Assert.IsType<StackPanel>(container.Child);
            var selected = Assert.IsType<Button>(group.Children[0]);
            Assert.Equal(Graphite.Panel3Brush, selected.Background);
            Assert.Equal(Graphite.TextBrush, selected.Foreground);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), selected.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_buttons_publish_colored_hover_surfaces()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var primary = Graphite.Button("Widgets", ButtonTone.Primary);
            var neutral = Graphite.Button("Layout");
            var ghost = Graphite.Button("Pages", ButtonTone.Ghost);
            var apply = Graphite.AccentIconButton("check", "Apply");

            Assert.Equal(Graphite.AccentHoverBrush, primary.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Equal(Graphite.AccentHoverBrush, primary.Resources["ButtonBackgroundPointerOver"]);
            Assert.Equal(Graphite.Panel2HoverBrush, neutral.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Equal(Graphite.Panel2HoverBrush, ghost.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Equal(Graphite.AccentHoverBrush, apply.Resources[Graphite.PointerOverBackgroundResourceKey]);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_icon_button_uses_compact_desktop_shape_and_tooltip()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var button = Graphite.IconButton("chevron-left", "Back");

            Assert.Equal(28, button.Width);
            Assert.Equal(28, button.MinHeight);
            Assert.Equal(Graphite.Panel2Brush, button.Background);
            Assert.Equal(Graphite.LineBrush, button.BorderBrush);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), button.CornerRadius);
            Assert.Equal("Back", ToolTip.GetTip(button));
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_navigation_item_active_state_is_quiet_and_precise()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var button = Graphite.NavigationItem("home", "Dash Editor", active: true, collapsed: false);

            Assert.Equal(Graphite.Panel3Brush, button.Background);
            Assert.Equal(Graphite.TextBrush, button.Foreground);
            Assert.Equal(new Thickness(0), button.BorderThickness);
            Assert.Equal(new CornerRadius(Graphite.RadiusSm), button.CornerRadius);
            Assert.Equal(36, button.MinHeight);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_status_pill_uses_compact_sentence_case_label()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var pill = Graphite.StatusPill("Connected", Graphite.GreenBrush);
            var text = Assert.IsType<TextBlock>(pill.Child);

            Assert.Equal("Connected", text.Text);
            Assert.True(pill.CornerRadius.TopLeft >= 100);
            Assert.Equal(new Thickness(1), pill.BorderThickness);
        }, CancellationToken.None);
    }
}
