using Sprint.Desktop.Features.Dashes;

namespace Sprint.Desktop.Features.Devices;

/// <summary>
/// Resolves the telemetry-backed layout a screen purpose renders. Dashboard devices
/// use the user's assigned layout; focused display purposes use a built-in layout so
/// selecting them is enough to produce useful output. Rear-view video is intentionally
/// absent until issue #41 supplies a video frame source.
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
                        Id = "purpose-lap-times-delta",
                        Type = "delta",
                        Col = 0,
                        Row = 0,
                        ColSpan = 20,
                        RowSpan = 4,
                    },
                    new DashWidget
                    {
                        Id = "purpose-lap-times-laps",
                        Type = "lap_time",
                        Col = 0,
                        Row = 4,
                        ColSpan = 20,
                        RowSpan = 6,
                        Style = new DashWidgetStyle { Border = false },
                    },
                    new DashWidget
                    {
                        Id = "purpose-lap-times-sectors",
                        Type = "sector",
                        Col = 0,
                        Row = 10,
                        ColSpan = 20,
                        RowSpan = 2,
                        Style = new DashWidgetStyle { Border = false },
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

    private static DashLayout? ResolveDashboard(SavedDevice device, IEnumerable<DashLayout> dashboards)
    {
        var layouts = dashboards as IReadOnlyList<DashLayout> ?? dashboards.ToList();
        return layouts.FirstOrDefault(layout =>
                   string.Equals(layout.Id, device.DashId, StringComparison.OrdinalIgnoreCase))
            ?? layouts.FirstOrDefault(layout => layout.IsDefault)
            ?? layouts.FirstOrDefault();
    }
}
