using System.Collections.ObjectModel;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Engineer;
using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop;

public interface IDesktopRuntime
{
    event EventHandler<RenderProfile>? RenderProfileChanged;

    AppSettings Settings { get; }
    ControlsConfig Controls { get; }
    RenderProfile CurrentRenderProfile { get; }
    ObservableCollection<CatalogDevice> Catalog { get; }
    ObservableCollection<SavedDevice> Devices { get; }
    ObservableCollection<DashLayout> DashLayouts { get; }
    ObservableCollection<SetupProgram> SetupPrograms { get; }
    ObservableCollection<EngineerControl> EngineerControls { get; }
    ObservableCollection<RadioLogEntry> RadioLog { get; }

    void SaveSettings();
    void SaveControls();
    SavedDevice AddDevice(CatalogDevice catalog);
    void UpdateDevice(SavedDevice device, string name, int rotation, int offsetX, int offsetY, int margin, string dashId);
    void RemoveDevice(SavedDevice device);
    DashLayout CreateDashLayout();
    void SaveDashLayout(DashLayout layout);
    void SetDefaultDashLayout(DashLayout layout);
    void DeleteDashLayout(DashLayout layout);
    string GetDashThumbnailPath(DashLayout layout);
    void SaveSetupPrograms();
    void PushEngineerChanges();
    void RevertEngineerChanges();
    void SendQuickMessage(string message);
}
