using System.Collections.Concurrent;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Tracks which page of its resolved layout each screen is currently showing. Scoped per
/// DEVICE, not per layout or globally — two screens assigned to the same dash can sit on
/// different pages at once — mirroring the deleted Avalonia client's
/// <c>DeviceScreenService</c>'s per-device <c>DashPageSelection</c> dictionary. A device that has
/// never been cycled reads back <see langword="null"/>, which callers treat as "use the layout's
/// first page" (the pre-cycling default).
/// <para>
/// Thread-safe and free of any HTTP/JSON concern: <c>RuntimeCoordinator</c> advances it from
/// Kestrel request threads for the <c>dash.page.next</c>/<c>dash.page.prev</c> commands, and a
/// future wheel-button dispatcher (matrix 4.7) can call <see cref="Move"/> directly with no HTTP
/// round-trip at all. <c>ScreenOutputs.Describe</c> reads <see cref="CurrentPageId"/> from the
/// telemetry-publish loop to fill in <c>screens[].pageId</c>.
/// </para>
/// </summary>
public sealed class DashPageCycle
{
    private readonly ConcurrentDictionary<string, string?> _pages = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>The device's current page id, or null if it has never been cycled.</summary>
    public string? CurrentPageId(string deviceId) =>
        _pages.TryGetValue(deviceId, out string? pageId) ? pageId : null;

    /// <summary>
    /// Moves <paramref name="deviceId"/>'s selection by <paramref name="offset"/> pages within
    /// <paramref name="layout"/>, wrapping around either end, and returns the newly selected page
    /// id (or the idle page's id, possibly null, when the layout has no regular pages at all). A
    /// previously selected page id that <paramref name="layout"/> no longer has — e.g. the
    /// device's assigned dash changed since the last cycle — restarts from the first page rather
    /// than throwing.
    /// </summary>
    public string? Move(string deviceId, DashLayout layout, int offset)
    {
        ArgumentNullException.ThrowIfNull(deviceId);
        ArgumentNullException.ThrowIfNull(layout);

        if (layout.Pages.Count == 0)
        {
            string? idlePageId = layout.IdlePage?.Id;
            _pages[deviceId] = idlePageId;
            return idlePageId;
        }

        string? current = CurrentPageId(deviceId);
        int index = layout.Pages.FindIndex(page =>
            string.Equals(page.Id, current, StringComparison.OrdinalIgnoreCase));
        if (index < 0)
        {
            index = 0;
        }

        index = (index + offset) % layout.Pages.Count;
        if (index < 0)
        {
            index += layout.Pages.Count;
        }

        string pageId = layout.Pages[index].Id;
        _pages[deviceId] = pageId;
        return pageId;
    }
}
