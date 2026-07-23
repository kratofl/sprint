using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Layout;
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
        Assert.Equal(Color.Parse("#A06BFF"), Graphite.Purple);
    }

    [Fact]
    public async Task Graphite_semantic_material_and_interaction_tokens_match_the_evolved_contract()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);
        await session.Dispatch(() =>
        {
            Assert.Equal(Graphite.AccentBrush, Graphite.ActionMaterialBrush);
            AssertVerticalMaterial(
                Graphite.SelectionMaterialBrush,
                ("#7A3204", 0d),
                ("#421A02", 1d));
            AssertVerticalMaterial(
                Graphite.TelemetryMaterialBrush,
                ("#FF9F0A", 0d),
                ("#FF6A00", 1d));

            Assert.Equal(16, Graphite.IconSizeControl);
            Assert.Equal(20, Graphite.IconSizeNavigation);
            Assert.Equal(24, Graphite.IconSizeEmphasis);
            Assert.Equal(2, Graphite.FocusThickness);
            Assert.Equal(TimeSpan.Zero, Graphite.FeedbackDuration);
            Assert.Equal(TimeSpan.FromMilliseconds(100), Graphite.ContentFadeDuration);
            Assert.Equal(TimeSpan.FromMilliseconds(160), Graphite.SpatialDuration);
        }, CancellationToken.None);
    }

    [Fact]
    public void Graphite_layout_tokens_expose_the_evolved_semantic_radius_roles()
    {
        Assert.Equal(6, Graphite.RadiusNested);
        Assert.Equal(8, Graphite.RadiusControl);
        Assert.Equal(12, Graphite.RadiusGroup);
        Assert.Equal(16, Graphite.RadiusOverlay);
        Assert.Equal(999, Graphite.RadiusPill);

        Assert.Equal(Graphite.RadiusNested, Graphite.RadiusXs);
        Assert.Equal(Graphite.RadiusControl, Graphite.RadiusSm);
        Assert.Equal(Graphite.RadiusControl, Graphite.RadiusMd);
        Assert.Equal(Graphite.RadiusGroup, Graphite.RadiusLg);
        Assert.Equal(Graphite.RadiusOverlay, Graphite.RadiusXl);

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
    public void Graphite_operational_text_and_wheel_semantics_meet_contrast_gates()
    {
        Assert.True(Contrast(Graphite.Text, Graphite.Bg) >= 7.0, "Primary Glance text must meet the 7:1 operational target.");
        Assert.True(Contrast(Graphite.Text2, Graphite.Bg) >= 4.5, "Secondary normal text must meet 4.5:1.");
        Assert.True(Contrast(Graphite.Text3, Graphite.Bg) >= 3.0, "Large muted labels and boundaries must meet 3:1.");

        foreach (var semantic in new[]
        {
            Graphite.Accent,
            Graphite.Blue,
            Graphite.Green,
            Graphite.Yellow,
            Graphite.Red,
            Color.Parse("#A06BFF"),
        })
        {
            Assert.True(Contrast(semantic, Color.Parse("#08080A")) >= 4.5,
                $"Wheel semantic {semantic} must meet 4.5:1 on the wheel canvas.");
        }

        Assert.True(Contrast(Graphite.Panel2, Graphite.Accent) >= 4.5,
            "Primary-button text must meet 4.5:1 on the flat orange fill.");
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
    public async Task Graphite_content_surfaces_consume_group_radius_role()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var card = Graphite.Card(new TextBlock());
            var state = Assert.IsType<Border>(Graphite.StatePanel("Waiting", "No frames yet.", Graphite.BlueBrush));

            Assert.Equal(new CornerRadius(Graphite.RadiusGroup), card.CornerRadius);
            Assert.Equal(new CornerRadius(Graphite.RadiusGroup), state.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_segmented_uses_a_neutral_active_option()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var control = Graphite.Segmented(new[] { "Pages", "Widgets" }, 1, _ => { });
            var container = Assert.IsType<Border>(control);
            Assert.Equal(Graphite.Panel2Brush, container.Background);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), container.CornerRadius);

            var group = Assert.IsType<Grid>(container.Child);
            var selected = Assert.IsType<Button>(group.Children[1]);
            Assert.Equal(Graphite.Panel3Brush, selected.Background);
            Assert.Equal(Graphite.TextBrush, selected.Foreground);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), selected.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_segmented_can_distribute_options_across_available_width()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var control = Graphite.Segmented(new[] { "Pages", "Widgets" }, 1, _ => { }, stretch: true);
            var container = Assert.IsType<Border>(control);
            var group = Assert.IsType<Grid>(container.Child);

            Assert.Equal(HorizontalAlignment.Stretch, container.HorizontalAlignment);
            Assert.All(group.ColumnDefinitions, column => Assert.Equal(GridLength.Star, column.Width));
            Assert.All(group.Children.OfType<Button>(), button => Assert.Equal(HorizontalAlignment.Stretch, button.HorizontalAlignment));
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_tab_view_uses_the_default_orange_material_for_the_active_tab()
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
            Assert.Equal(Graphite.AccentBrush, selected.Background);
            Assert.Equal(Graphite.Panel2Brush, selected.Foreground);
            Assert.Equal(new CornerRadius(Graphite.RadiusMd), selected.CornerRadius);
        }, CancellationToken.None);
    }

    [Fact]
    public async Task Graphite_primary_buttons_use_action_material_with_immediate_feedback()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(GraphiteTokenTests).Assembly);

        await session.Dispatch(() =>
        {
            var primary = Graphite.Button("Widgets", ButtonTone.Primary);
            var neutral = Graphite.Button("Layout");
            var ghost = Graphite.Button("Pages", ButtonTone.Ghost);
            var apply = Graphite.AccentIconButton("check", "Apply");

            Assert.Equal(Graphite.AccentBrush, primary.Background);
            Assert.Same(primary.Background, primary.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Same(primary.Background, primary.Resources["ButtonBackgroundPointerOver"]);
            Assert.Equal(Graphite.Panel2HoverBrush, neutral.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Equal(Graphite.Panel2HoverBrush, ghost.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Same(apply.Background, apply.Resources[Graphite.PointerOverBackgroundResourceKey]);
            Assert.Null(primary.Transitions);
            Assert.Null(neutral.Transitions);
            Assert.Null(ghost.Transitions);
            Assert.Null(apply.Transitions);
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
            Assert.Equal("Back", AutomationProperties.GetName(button));
            var icon = Assert.IsType<Viewbox>(button.Content);
            Assert.Equal(Graphite.IconSizeControl, icon.Width);
            Assert.Equal(Graphite.IconSizeControl, icon.Height);
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
            Assert.Equal("Dash Editor", AutomationProperties.GetName(button));
            var row = Assert.IsType<StackPanel>(button.Content);
            var icon = Assert.IsType<Viewbox>(row.Children[1]);
            Assert.Equal(Graphite.IconSizeNavigation, icon.Width);
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

    private static void AssertVerticalMaterial(IBrush brush, params (string Color, double Offset)[] expected)
    {
        var gradient = Assert.IsType<LinearGradientBrush>(brush);
        Assert.Equal(new RelativePoint(0.5, 0, RelativeUnit.Relative), gradient.StartPoint);
        Assert.Equal(new RelativePoint(0.5, 1, RelativeUnit.Relative), gradient.EndPoint);
        Assert.Equal(expected.Length, gradient.GradientStops.Count);
        for (var index = 0; index < expected.Length; index++)
        {
            Assert.Equal(Color.Parse(expected[index].Color), gradient.GradientStops[index].Color);
            Assert.Equal(expected[index].Offset, gradient.GradientStops[index].Offset);
        }
    }

    private static double Contrast(Color first, Color second)
    {
        static double Luminance(Color color)
        {
            static double Channel(byte value)
            {
                var normalized = value / 255d;
                return normalized <= 0.04045
                    ? normalized / 12.92
                    : Math.Pow((normalized + 0.055) / 1.055, 2.4);
            }

            return 0.2126 * Channel(color.R) + 0.7152 * Channel(color.G) + 0.0722 * Channel(color.B);
        }

        var a = Luminance(first);
        var b = Luminance(second);
        return (Math.Max(a, b) + 0.05) / (Math.Min(a, b) + 0.05);
    }
}
