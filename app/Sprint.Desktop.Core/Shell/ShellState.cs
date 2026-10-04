namespace Sprint.Desktop.Shell;

public sealed class ShellState
{
    public AppView View { get; private set; } = AppView.Home;
    public bool SidebarCollapsed { get; private set; }

    public ShellState(bool sidebarCollapsed = false)
    {
        this.SidebarCollapsed = sidebarCollapsed;
    }

    public void Navigate(AppView view)
    {
        this.View = view;
    }

    public void ToggleSidebar()
    {
        this.SidebarCollapsed = !this.SidebarCollapsed;
    }

    public string CurrentTitle => this.View switch
    {
        AppView.Home => "Home",
        AppView.SessionPlanner => "Session Planner",
        AppView.Analysis => "Analysis",
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
    public string CurrentGroup => this.View switch
    {
        AppView.Home => "Overview",
        AppView.SessionPlanner => "Race Weekend",
        AppView.Analysis => "Race Weekend",
        AppView.Dashes => "Dashboards",
        AppView.Devices => "Dashboards",
        AppView.Setups => "Setups",
        AppView.RaceEngineer => "Race Engineer",
        AppView.Settings => "System",
        AppView.Help => "System",
        _ => "Sprint"
    };
}
