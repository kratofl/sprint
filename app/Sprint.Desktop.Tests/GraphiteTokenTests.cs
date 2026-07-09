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
    public void Graphite_color_tokens_match_extracted_figma_component_spec()
    {
        Assert.Equal(Color.Parse("#0A0A0A"), Graphite.Bg);
        Assert.Equal(Color.Parse("#0F0F0F"), Graphite.Panel);
        Assert.Equal(Color.Parse("#141414"), Graphite.Panel2);
        Assert.Equal(Color.Parse("#1A1A1A"), Graphite.Panel3);
        Assert.Equal(Color.Parse("#2E2E2E"), Graphite.Line);
        Assert.Equal(Color.Parse("#424242"), Graphite.Line2);
        Assert.Equal(Color.Parse("#F6F6F6"), Graphite.Text);
        Assert.Equal(Color.Parse("#7A7A7A"), Graphite.Text2);
        Assert.Equal(Color.Parse("#5A5A5A"), Graphite.Text3);
        Assert.Equal(Color.Parse("#FF6A00"), Graphite.Accent);
        Assert.Equal(Color.Parse("#16B566"), Graphite.Green);
        Assert.Equal(Color.Parse("#F02744"), Graphite.Red);
        Assert.Equal(Color.Parse("#E0A30C"), Graphite.Yellow);
        Assert.Equal(Color.Parse("#1F7FE6"), Graphite.Blue);
    }

    [Fact]
    public void Graphite_layout_tokens_match_extracted_figma_component_spec()
    {
        Assert.Equal(4, Graphite.RadiusXs);
        Assert.Equal(6, Graphite.RadiusSm);
        Assert.Equal(8, Graphite.RadiusMd);
        Assert.Equal(10, Graphite.RadiusLg);
        Assert.Equal(14, Graphite.RadiusXl);
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

        Assert.Equal(32, Graphite.TitlebarHeight);
        Assert.Equal(164, Graphite.SidebarExpandedWidth);
        Assert.Equal(44, Graphite.SidebarCollapsedWidth);
    }

    [Fact]
    public async Task Graphite_buttons_match_extracted_figma_component_spec()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var button = Graphite.Button("Save");

            Assert.Equal(25, button.MinHeight);
            Assert.Equal(new Thickness(14, 6), button.Padding);
            Assert.Equal(13, button.FontSize);
            Assert.Equal(FontWeight.Bold, button.FontWeight);
            Assert.Equal(new CornerRadius(Graphite.RadiusPill), button.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_segmented_uses_ember_filled_selected_item()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var control = Graphite.Segmented(new[] { "Pages", "Widgets" }, 1, _ => { });
            var container = Assert.IsType<Border>(control);
            Assert.Equal(Graphite.Panel2Brush, container.Background);
            Assert.Equal(new CornerRadius(Graphite.RadiusPill), container.CornerRadius);

            var group = Assert.IsType<StackPanel>(container.Child);
            var selected = Assert.IsType<Button>(group.Children[1]);
            Assert.Equal(Graphite.AccentBrush, selected.Background);
            Assert.Equal(Graphite.Panel2Brush, selected.Foreground);
            Assert.Equal(new CornerRadius(Graphite.RadiusPill), selected.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_tab_view_uses_neutral_selected_pill()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var control = Graphite.TabView(new[] { "Layout", "Alerts", "Settings" }, 0, _ => { });
            var container = Assert.IsType<Border>(control);
            Assert.Equal(Graphite.Panel2Brush, container.Background);
            Assert.Equal(new CornerRadius(Graphite.RadiusPill), container.CornerRadius);

            var group = Assert.IsType<StackPanel>(container.Child);
            var selected = Assert.IsType<Button>(group.Children[0]);
            Assert.Equal(Graphite.Panel3Brush, selected.Background);
            Assert.Equal(Graphite.TextBrush, selected.Foreground);
            Assert.Equal(new CornerRadius(Graphite.RadiusPill), selected.CornerRadius);
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
            Assert.Equal(Graphite.AccentBgBrush, neutral.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Equal(Graphite.AccentBgBrush, ghost.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Equal(Graphite.AccentHoverBrush, apply.Resources[Graphite.PointerOverBackgroundResourceKey]);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_icon_button_uses_compact_screenshot_shape_and_tooltip()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var button = Graphite.IconButton("chevron-left", "Back");

            Assert.Equal(21, button.Width);
            Assert.Equal(21, button.MinHeight);
            Assert.Equal(Graphite.Panel2Brush, button.Background);
            Assert.Equal(Graphite.LineBrush, button.BorderBrush);
            Assert.Equal(new CornerRadius(Graphite.RadiusPill), button.CornerRadius);
            Assert.Equal("Back", ToolTip.GetTip(button));
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_navigation_item_active_state_matches_component_screenshot()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var button = Graphite.NavigationItem("home", "Dash Editor", active: true, collapsed: false);

            Assert.Equal(Graphite.Panel3Brush, button.Background);
            Assert.Equal(Graphite.AccentBrush, button.Foreground);
            Assert.Equal(new Thickness(0), button.BorderThickness);
            Assert.Equal(new CornerRadius(Graphite.RadiusSm), button.CornerRadius);
            Assert.Equal(25, button.MinHeight);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_status_pill_uses_compact_uppercase_label()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var pill = Graphite.StatusPill("Connected", Graphite.GreenBrush);
            var text = Assert.IsType<TextBlock>(pill.Child);

            Assert.Equal("CONNECTED", text.Text);
            Assert.True(pill.CornerRadius.TopLeft >= 100);
            Assert.Equal(new Thickness(1), pill.BorderThickness);
        }, CancellationToken.None);
    }
}
