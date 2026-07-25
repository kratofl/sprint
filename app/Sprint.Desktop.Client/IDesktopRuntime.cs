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
    ReadOnlyObservableCollection<SetupProgram> SetupTemplates { get; }
    ObservableCollection<SetupProgram> SetupPrograms { get; }
    ObservableCollection<EngineerControl> EngineerControls { get; }
    ObservableCollection<RadioLogEntry> RadioLog { get; }
    ExternalOperationState EngineerPushState { get; }

    void SaveSettings();
    void ResetSettingsToDefaults();
    void SaveControls();
    void SaveDevices();
    SavedDevice AddDevice(CatalogDevice catalog);
    void UpdateDevice(SavedDevice device, string name, int rotation, int offsetX, int offsetY, int margin, string dashId);
    void UpdateDevicePurpose(SavedDevice device, string purpose);
    void RemoveDevice(SavedDevice device);
    DashLayout CreateDashLayout();
    DashLayout CreateDashLayout(ScreenProfile profile);
    void SetDashScreenProfile(DashLayout layout, ScreenProfile profile);
    DashLayout DuplicateDashToProfile(DashLayout source, ScreenProfile profile);
    void SaveDashLayout(DashLayout layout);
    void ResetDashLayout(DashLayout layout);
    void SetDefaultDashLayout(DashLayout layout);
    void DeleteDashLayout(DashLayout layout);
    string GetDashThumbnailPath(DashLayout layout);
    SetupProgram DuplicateSetup(SetupProgram source);
    void SaveSetupPrograms();
    void PushEngineerChanges();
    void AcknowledgeEngineerChanges(bool succeeded);
    void RevertEngineerChanges();
    void SendQuickMessage(string message);
}
