namespace Sprint.Desktop;

/// <summary>
/// The subset of Graphite design tokens that pure dash/shell logic needs as plain data
/// (hex colors, sidebar widths). The single source of truth for these values — web
/// surfaces mirror them from <c>packages/tokens</c> instead.
/// </summary>
public static class GraphiteTokens
{
    public const string AccentHex = "#FF6A00";
    public const string GreenHex = "#16B566";
    public const string RedHex = "#F02744";
    public const string YellowHex = "#E0A30C";
    public const string BlueHex = "#1F7FE6";
    public const string TextHex = "#F5F5F7";
    public const string DashThemeSuzukiPrimaryHex = "#7C3AED";
    public const string DashThemeSuzukiAccentHex = "#B15CFF";
    public const string DashThemeMonoPrimaryHex = "#F6F6F6";
    public const string DashThemeMonoAccentHex = "#7A7A7A";

    public const int SidebarExpandedWidth = 184;
    public const int SidebarCollapsedWidth = 52;
}
