namespace Sprint.Desktop.Shell;

public sealed class ShellState
{
    public AppView View { get; private set; } = AppView.Live;
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
        AppView.Live => "Live",
        AppView.Engineer => "Engineer",
        AppView.Setup => "Setup",
        AppView.Dashes => "Dashes",
        AppView.Devices => "Devices",
        AppView.Settings => "Settings",
        AppView.Help => "Help",
        _ => "Live"
    };
}
