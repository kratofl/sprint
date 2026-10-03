using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Host;

/// <summary>Delivery stats for one device's most recent frame, or null before its first frame.</summary>
public sealed record ScreenOutputPerformance(long Sequence, int Bytes, DateTimeOffset ReceivedAt);

/// <summary>The two ways a screen's pixels get produced. See <see cref="ScreenOutputDescription.Source"/>.</summary>
public static class ScreenOutputSources
{
    /// <summary>Electron paints <see cref="ScreenOutputDescription.Layout"/> in an offscreen
    /// browser and POSTs the result — dashboard, flag-display, and lap-timer purposes alike.</summary>
    public const string Dash = "dash";

    /// <summary>The host captures the device's stored desktop region itself; no browser is
    /// involved and there is no <see cref="ScreenOutputDescription.Layout"/> to render.</summary>
    public const string Capture = "capture";
}

/// <summary>One configured screen output. For a <see cref="ScreenOutputSources.Dash"/> entry,
/// Electron creates one offscreen browser per entry returned by <see cref="ScreenOutputs.Describe"/>
/// and renders <see cref="Layout"/> — this describes what should render, not what has already
/// painted. A <see cref="ScreenOutputSources.Capture"/> entry has no browser and no layout; it
/// exists purely so callers can see the device's configured output and hardware status.</summary>
public sealed record ScreenOutputDescription(
    string DeviceId,
    string Source,
    int Width,
    int Height,
    int RefreshHz,
    DashLayout? Layout,
    string PageId,
    bool Idle,
    ScreenOutputPerformance? Performance,
    ScreenOutputHardware? Hardware);

/// <summary>
/// Builds the <c>screens</c> array for <c>/api/state</c>: one entry per enabled device whose
/// purpose has an implemented output (<see cref="DeviceCapabilities.DrivesScreenOutput"/> — the
/// same selection <see cref="Host.ScreenOutputService"/> drives to hardware), describing the
/// CONFIGURED output rather than anything that has actually rendered.
/// <para>
/// This has to be derived from the runtime's devices, not from <see cref="FrameStore"/>. Electron
/// creates one offscreen browser per <see cref="ScreenOutputSources.Dash"/> entry here (it skips
/// <see cref="ScreenOutputSources.Capture"/> entries — those are captured natively, see
/// <see cref="Host.ScreenOutputService"/>), and that offscreen browser is the only thing that ever
/// posts a frame back (<c>POST /api/screens/{id}/frame</c>) — deriving the list from received
/// frames would mean no screen entry until a frame arrives, and no frame until a window exists for
/// it, which can never bootstrap.
/// </para>
/// <para>
/// A rear-view mirror device with no capture region selected yet is not a candidate at all here
/// (<see cref="DeviceCapabilities.DrivesScreenOutput"/> requires a valid one) — it simply has no
/// entry, the same "not configured yet" state the deleted Avalonia client reported purely in its
/// own UI ("Setup needed"), never as an error from this host.
/// </para>
/// </summary>
public static class ScreenOutputs
{
    public static IReadOnlyList<ScreenOutputDescription> Describe(
        IEnumerable<SavedDevice> devices,
        IEnumerable<DashLayout> layouts,
        FrameStore frames,
        bool telemetryLive,
        Func<string, ScreenOutputHardware?>? hardwareLookup = null,
        DashPageCycle? pageCycle = null)
    {
        ArgumentNullException.ThrowIfNull(devices);
        ArgumentNullException.ThrowIfNull(layouts);
        ArgumentNullException.ThrowIfNull(frames);

        List<DashLayout> layoutList = [.. layouts];
        List<ScreenOutputDescription> outputs = [];

        foreach (SavedDevice device in devices)
        {
            if (device.Disabled || !DeviceCapabilities.DrivesScreenOutput(device))
            {
                continue;
            }

            DeviceOrientationTransform transform = DeviceOrientations.Transform(device.Width, device.Height, device.Orientation);
            ScreenFrameDescription? frame = frames.Get(device.Id);
            ScreenOutputPerformance? performance = frame is null
                ? null
                : new ScreenOutputPerformance(frame.Sequence, frame.Bytes, frame.ReceivedAt);
            ScreenOutputHardware? hardware = hardwareLookup?.Invoke(device.Id);

            DevicePurpose purpose = DevicePurposes.Resolve(device.Purpose);
            if (purpose.Output is DevicePurposeOutputKind.DesktopCaptureRegion)
            {
                outputs.Add(new ScreenOutputDescription(
                    device.Id,
                    ScreenOutputSources.Capture,
                    transform.LogicalWidth,
                    transform.LogicalHeight,
                    DeviceRefreshRates.Normalize(device.RefreshHz),
                    null,
                    "",
                    false,
                    performance,
                    hardware));
                continue;
            }

            DashLayout? layout = DevicePurposeLayouts.Resolve(device, layoutList);
            if (layout is null)
            {
                // No layout to resolve at all (an empty runtime); nothing to describe for this device.
                continue;
            }

            // A stale/idle screen shows the idle page when the layout has one, else its main page —
            // never a blank output while telemetry is disconnected. Only while telemetry is live
            // does the device's own page selection (dash.page.next/prev) take effect.
            bool idle = !telemetryLive;
            DashPage? active = idle ? null : ResolveActivePage(layout, pageCycle?.CurrentPageId(device.Id));
            DashPage? page = (idle ? layout.IdlePage : active) ?? layout.Pages.FirstOrDefault();

            outputs.Add(new ScreenOutputDescription(
                device.Id,
                ScreenOutputSources.Dash,
                transform.LogicalWidth,
                transform.LogicalHeight,
                DeviceRefreshRates.Normalize(device.RefreshHz),
                layout,
                page?.Id ?? "",
                idle,
                performance,
                hardware));
        }

        return outputs;
    }

    private static DashPage? ResolveActivePage(DashLayout layout, string? currentPageId) =>
        currentPageId is null
            ? null
            : layout.Pages.FirstOrDefault(page => string.Equals(page.Id, currentPageId, StringComparison.OrdinalIgnoreCase));
}
