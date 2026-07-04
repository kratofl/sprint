using Avalonia;
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
        Assert.Equal(220, Graphite.SidebarExpandedWidth);
        Assert.Equal(62, Graphite.SidebarCollapsedWidth);
    }

    [Fact]
    public void Graphite_buttons_match_extracted_figma_component_spec()
    {
        var button = Graphite.Button("Save");

        Assert.Equal(25, button.MinHeight);
        Assert.Equal(new Thickness(14, 6), button.Padding);
        Assert.Equal(13, button.FontSize);
        Assert.Equal(FontWeight.Bold, button.FontWeight);
        Assert.Equal(new CornerRadius(Graphite.RadiusMd), button.CornerRadius);
    }
}
