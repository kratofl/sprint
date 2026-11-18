using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Input;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Keeps every wheel on a page its session or mode cycles, from the ingest loop: on each new frame
/// it hands <see cref="DashPageCycle"/> the session, each device's mode (its multi-dial's position,
/// <see cref="MultiDials.ActiveMode"/>) and the out lap / flying lap moments
/// (<see cref="DashLapWatch"/>), and settles each device's page. Runs on the ingest thread only.
/// </summary>
public sealed class DashPageAutomation
{
    private readonly IDesktopRuntime _runtime;
    private readonly DashPageCycle _cycle;
    private readonly MultiDialTracker _dials;
    private readonly DashLapWatch _laps = new();

    public DashPageAutomation(IDesktopRuntime runtime, DashPageCycle cycle, MultiDialTracker dials)
    {
        this._runtime = runtime ?? throw new ArgumentNullException(nameof(runtime));
        this._cycle = cycle ?? throw new ArgumentNullException(nameof(cycle));
        this._dials = dials ?? throw new ArgumentNullException(nameof(dials));
    }

    public void Observe(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        DashPageJump? jump = this._laps.Next(frame);
        bool sessionChanged = this._cycle.Session != frame.Session.SessionType;
        this._cycle.Session = frame.Session.SessionType;

        HashSet<string> modes = this._runtime.Settings.DashModes.Select(mode => mode.Id).ToHashSet(StringComparer.Ordinal);
        List<SavedDevice> devices;
        lock (this._runtime.DevicesGate)
        {
            devices = this._runtime.Devices.Where(device => !device.Disabled).ToList();
        }

        List<DashLayout> layouts = this._runtime.DashLayouts.ToList();
        DriverCar car = DriverCar.Of(this._runtime.Settings.LastSeenContext);
        List<CatalogDevice> catalog = this._runtime.Catalog.ToList();
        foreach (SavedDevice device in devices)
        {
            if (DevicePurposeLayouts.Resolve(device, layouts, car) is not { } layout)
            {
                continue;
            }

            string? mode = MultiDials.LayoutOf(device, catalog) is { } dial
                ? MultiDials.ActiveMode(device, dial, this._dials.StatusOf(device.Id), modes.Contains)
                : null;
            bool modeChanged = this._cycle.ModeOf(device.Id) != mode;
            this._cycle.SetMode(device.Id, mode);
            this._cycle.Settle(device.Id, layout, jump, sessionChanged || modeChanged);
        }
    }
}
