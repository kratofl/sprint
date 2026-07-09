namespace Sprint.Desktop.Shell;

public sealed class ShellState
{
    public AppView View { get; private set; } = AppView.Home;
    public bool SidebarCollapsed { get; private set; }

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
        AppView.Dashes => "Dash Editor",
        AppView.Devices => "Devices",
        AppView.Setups => "Setups",
        AppView.Settings => "Settings",
        AppView.Help => "Help",
        AppView.DebugLive => "Live Debug",
        AppView.DebugEngineer => "Engineer Debug",
        AppView.DebugSetup => "Setup Debug",
        _ => "Dash Editor"
    };
}
