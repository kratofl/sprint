namespace Sprint.Desktop.Shell;

public sealed class ShellState
{
    public AppView View { get; private set; } = AppView.Home;
    public bool SidebarCollapsed { get; private set; }

    public ShellState(bool sidebarCollapsed = false)
    {
        SidebarCollapsed = sidebarCollapsed;
    }

    public int SidebarWidth => SidebarCollapsed ? Graphite.SidebarCollapsedWidth : Graphite.SidebarExpandedWidth;

    public void Navigate(AppView view)
    {
        View = view;
    }

    public void ToggleSidebar()
    {
        SidebarCollapsed = !SidebarCollapsed;
    }

    public string CurrentTitle => View switch
    {
        AppView.Home => "Home",
        AppView.Dashes => "Dashes",
        AppView.Devices => "Devices",
        AppView.Setups => "Setups",
        AppView.RaceEngineer => "Race Engineer",
        AppView.Settings => "Settings",
        AppView.Help => "Help",
        AppView.DebugLive => "Live Debug",
        AppView.DebugEngineer => "Engineer Debug",
        AppView.DebugSetup => "Setup Debug",
        _ => "Dashes"
    };

    /// <summary>The pillar/group each destination belongs to, shown as the breadcrumb parent.</summary>
    public string CurrentGroup => View switch
    {
        AppView.Home => "Overview",
        AppView.Dashes => "Dashboards",
        AppView.Devices => "Dashboards",
        AppView.Setups => "Setups",
        AppView.RaceEngineer => "Race Engineer",
        AppView.Settings => "System",
        AppView.Help => "System",
        _ => "Sprint"
    };
}
