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
        ColorSystem = DashColorSystem.Functional,
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
        ColorSystem = DashColorSystem.Functional,
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

    public static DashLayout? Resolve(SavedDevice device, IEnumerable<DashLayout> dashboards)
    {
        ArgumentNullException.ThrowIfNull(device);
        ArgumentNullException.ThrowIfNull(dashboards);

        var purpose = DevicePurposes.Resolve(device.Purpose);
        return purpose.Output switch
        {
            DevicePurposeOutputKind.DashboardLayout => ResolveDashboard(device, dashboards),
            DevicePurposeOutputKind.BuiltInFlagLayout => FlagDisplay,
            DevicePurposeOutputKind.BuiltInLapTimerLayout => LapTimer,
            DevicePurposeOutputKind.DesktopCaptureRegion => null,
            _ => throw new ArgumentOutOfRangeException(
                nameof(device),
                device.Purpose,
                "Unknown device purpose output kind."),
        };
    }

    /// <summary>The device's own dash, else the stable fallback (<see cref="DashLayoutOrder.First"/>); null when there are no dashes.</summary>
    private static DashLayout? ResolveDashboard(SavedDevice device, IEnumerable<DashLayout> dashboards)
    {
        IReadOnlyList<DashLayout> layouts = dashboards as IReadOnlyList<DashLayout> ?? dashboards.ToList();
        return layouts.FirstOrDefault(layout =>
                   string.Equals(layout.Id, device.DashId, StringComparison.OrdinalIgnoreCase))
            ?? DashLayoutOrder.First(layouts);
    }
}
