using Sprint.Desktop.Features.Dashes;

namespace Sprint.Desktop.Features.Devices;

/// <summary>
/// Resolves the telemetry-backed layout a screen purpose renders. Dashboard devices
/// use the user's assigned layout; focused display purposes use a built-in layout so
/// selecting them is enough to produce useful output. Rear-view video uses its own
/// desktop-capture frame source and therefore has no dash layout.
/// </summary>
public static class DevicePurposeLayouts
{
    private static readonly DashLayout FlagDisplay = new()
    {
        Id = "purpose-flags",
        Name = "Flag display",
        GridCols = 20,
        GridRows = 12,
        Pages =
        [
            new DashPage
            {
                Id = "purpose-flags-live",
                Name = "Flags",
                Widgets =
                [
                    new DashWidget
                    {
                        Id = "purpose-flags-state",
                        Type = "flag",
                        Col = 0,
                        Row = 0,
                        ColSpan = 20,
                        RowSpan = 12,
                    },
                ],
            },
        ],
    };

    private static readonly DashLayout LapTimer = new()
    {
        Id = "purpose-lap-times",
        Name = "Lap timer",
        GridCols = 20,
        GridRows = 12,
        Pages =
        [
            new DashPage
            {
                Id = "purpose-lap-times-live",
                Name = "Timing",
                Widgets =
                [
                    new DashWidget
                    {
                        Id = "purpose-lap-times-racelogic",
                        Type = "racelogic_lap_timer",
                        Col = 0,
                        Row = 0,
                        ColSpan = 20,
                        RowSpan = 12,
                    },
                ],
            },
        ],
    };

    /// <summary>The layout <paramref name="device"/> shows while the driver is in <paramref name="car"/>.</summary>
    public static DashLayout? Resolve(SavedDevice device, IEnumerable<DashLayout> dashboards, DriverCar car)
    {
        ArgumentNullException.ThrowIfNull(device);
        ArgumentNullException.ThrowIfNull(dashboards);
        ArgumentNullException.ThrowIfNull(car);

        DevicePurpose purpose = DevicePurposes.Resolve(device.Purpose);
        return purpose.Output switch
        {
            DevicePurposeOutputKind.DashboardLayout => ResolveDashboard(device, dashboards, car),
            DevicePurposeOutputKind.BuiltInFlagLayout => FlagDisplay,
            DevicePurposeOutputKind.BuiltInLapTimerLayout => LapTimer,
            DevicePurposeOutputKind.DesktopCaptureRegion => null,
            _ => throw new ArgumentOutOfRangeException(
                nameof(device),
                device.Purpose,
                "Unknown device purpose output kind."),
        };
    }

    /// <summary>
    /// The dash a rule picks for the car (<see cref="DeviceDashRules.Pick"/>), else the device's own
    /// dash, else the stable fallback (<see cref="DashLayoutOrder.First"/>); null when there are no dashes.
    /// </summary>
    private static DashLayout? ResolveDashboard(SavedDevice device, IEnumerable<DashLayout> dashboards, DriverCar car)
    {
        IReadOnlyList<DashLayout> layouts = dashboards as IReadOnlyList<DashLayout> ?? dashboards.ToList();
        DashLayout? Find(string id) => layouts.FirstOrDefault(layout => string.Equals(layout.Id, id, StringComparison.OrdinalIgnoreCase));
        string? picked = DeviceDashRules.Pick(device.DashRules, car, id => Find(id) is not null);
        return (picked is null ? null : Find(picked)) ?? Find(device.DashId) ?? DashLayoutOrder.First(layouts);
    }
}
