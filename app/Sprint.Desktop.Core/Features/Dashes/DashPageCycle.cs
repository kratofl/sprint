using System.Collections.Concurrent;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Tracks which page of its resolved layout each screen is currently showing, within the pages
/// its session or mode cycles (<see cref="DashPageModes.CyclePages"/>). Scoped per DEVICE, not per
/// layout or globally — two screens assigned to the same dash can sit on different pages at once.
/// A device that has never been cycled or settled reads back <see langword="null"/>, which callers
/// treat as "use the layout's first page".
/// <para>
/// Thread-safe and free of any HTTP/JSON concern: <c>RuntimeCoordinator</c> moves it for the
/// <c>dash.page.*</c> commands and wheel buttons, <see cref="DashPageAutomation"/> settles it from
/// the ingest loop (the session, each wheel's mode, the out lap and flying lap jumps), and
/// <c>ScreenOutputs.Describe</c> and the wheel screens read <see cref="CurrentPageId"/>.
/// </para>
/// </summary>
public sealed class DashPageCycle
{
    private static readonly IReadOnlyDictionary<string, string> NoLayers = new Dictionary<string, string>();

    private readonly ConcurrentDictionary<string, string?> _pages = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, IReadOnlyDictionary<string, string>> _layers = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string?> _modes = new(StringComparer.OrdinalIgnoreCase);
    private int _session = (int)SessionType.Unknown;

    /// <summary>The session the game is in, as the ingest loop last saw it.</summary>
    public SessionType Session
    {
        get => (SessionType)Volatile.Read(ref this._session);
        set => Volatile.Write(ref this._session, (int)value);
    }

    /// <summary>The device's current page id, or null if it has never been cycled.</summary>
    public string? CurrentPageId(string deviceId) =>
        this._pages.TryGetValue(deviceId, out string? pageId) ? pageId : null;

    /// <summary>The driver's own mode in force on the device (its multi-dial's position), or null.</summary>
    public string? ModeOf(string deviceId) =>
        this._modes.TryGetValue(deviceId, out string? modeId) ? modeId : null;

    public void SetMode(string deviceId, string? modeId) => this._modes[deviceId] = modeId;

    /// <summary>The pages the device cycles in <paramref name="layout"/> now.</summary>
    public IReadOnlyList<DashPage> PagesFor(string deviceId, DashLayout layout) =>
        DashPageModes.CyclePages(layout, this.ModeOf(deviceId), this.Session);

    /// <summary>
    /// Moves <paramref name="deviceId"/>'s selection by <paramref name="offset"/> pages within the
    /// pages it cycles in <paramref name="layout"/>, wrapping around either end, and returns the
    /// newly selected page id (or the idle page's id, possibly null, when the layout has no regular
    /// pages at all). From a page outside them (a "Go to" page, or the dash or session changed) the
    /// next page is the first of them and the previous one the last.
    /// </summary>
    public string? Move(string deviceId, DashLayout layout, int offset)
    {
        ArgumentNullException.ThrowIfNull(deviceId);
        ArgumentNullException.ThrowIfNull(layout);

        IReadOnlyList<DashPage> pages = this.PagesFor(deviceId, layout);
        if (pages.Count == 0)
        {
            string? idlePageId = layout.IdlePage?.Id;
            this._pages[deviceId] = idlePageId;
            return idlePageId;
        }

        // No page picked yet: the wheel shows the dash's first page.
        int index = IndexOf(pages, this.CurrentPageId(deviceId) ?? layout.Pages.FirstOrDefault()?.Id);
        if (index < 0)
        {
            // Off the cycle: stand just before the first page (or just after the last, going back).
            index = offset >= 0 ? -1 : pages.Count;
        }

        index = ((index + offset) % pages.Count + pages.Count) % pages.Count;

        string pageId = pages[index].Id;
        this._pages[deviceId] = pageId;
        return pageId;
    }

    /// <summary>
    /// The layer the device's buttons switched each stack to (stack id → layer id), handed to the
    /// renderer with the scene; a stack not in it shows its <see cref="DashWidgetGroup.ShownFirst"/>.
    /// A new instance after every switch, so a scene compares it by reference. Kept across page
    /// changes; Sprint starts every stack on its first layer again.
    /// </summary>
    public IReadOnlyDictionary<string, string> LayersOf(string deviceId) =>
        this._layers.TryGetValue(deviceId, out IReadOnlyDictionary<string, string>? layers) ? layers : NoLayers;

    /// <summary>
    /// Steps every stack on the page the device shows (its current page, else the dash's first) by
    /// <paramref name="offset"/> layers, wrapping around, skipping hidden and empty layers. False
    /// when that page has no stack with two layers to switch between.
    /// </summary>
    public bool MoveLayers(string deviceId, DashLayout layout, int offset)
    {
        ArgumentNullException.ThrowIfNull(deviceId);
        ArgumentNullException.ThrowIfNull(layout);
        string? current = this.CurrentPageId(deviceId);
        DashPage? page = layout.Pages.FirstOrDefault(candidate => string.Equals(candidate.Id, current, StringComparison.OrdinalIgnoreCase)) ?? layout.Pages.FirstOrDefault();
        if (page is null)
        {
            return false;
        }

        Dictionary<string, string> next = new(this.LayersOf(deviceId), StringComparer.Ordinal);
        bool moved = false;
        foreach (DashWidgetGroup stack in page.Groups.Where(group => group.Mode == DashGroupMode.OneAtATime && !group.Hidden))
        {
            List<string> layers = DashWidgetGroups.ShownLayers(page, stack.Id);
            if (layers.Count < 2)
            {
                continue;
            }

            string shown = next.TryGetValue(stack.Id, out string? picked) && layers.Contains(picked)
                ? picked
                : stack.ShownFirst is { } first && layers.Contains(first) ? first : layers[0];
            next[stack.Id] = layers[((layers.IndexOf(shown) + offset) % layers.Count + layers.Count) % layers.Count];
            moved = true;
        }

        if (moved)
        {
            this._layers[deviceId] = next;
        }

        return moved;
    }

    /// <summary>
    /// Shows <paramref name="pageId"/> of <paramref name="layout"/> on the device, whatever its
    /// session or mode (a "Go to" button is the driver asking for that page); false when the layout
    /// has no such page.
    /// </summary>
    public bool Show(string deviceId, DashLayout layout, string pageId)
    {
        ArgumentNullException.ThrowIfNull(deviceId);
        ArgumentNullException.ThrowIfNull(layout);
        DashPage? page = layout.Pages.FirstOrDefault(candidate => string.Equals(candidate.Id, pageId, StringComparison.OrdinalIgnoreCase));
        if (page is null)
            return false;

        this._pages[deviceId] = page.Id;
        return true;
    }

    /// <summary>
    /// Keeps the device on a page it cycles now: on <paramref name="jump"/>, the first of those pages
    /// that jumps then; otherwise, when the current page is not among them (the session or mode
    /// changed, or it was never set), the first of them. A page the driver went to with a "Go to"
    /// button stays until something changes.
    /// </summary>
    public void Settle(string deviceId, DashLayout layout, DashPageJump? jump, bool contextChanged)
    {
        ArgumentNullException.ThrowIfNull(deviceId);
        ArgumentNullException.ThrowIfNull(layout);
        IReadOnlyList<DashPage> pages = this.PagesFor(deviceId, layout);
        if (pages.Count == 0)
        {
            return;
        }

        if (jump is not null && pages.FirstOrDefault(page => page.Jump == jump) is { } target)
        {
            this._pages[deviceId] = target.Id;
            return;
        }

        string? current = this.CurrentPageId(deviceId);
        bool known = layout.Pages.Any(page => string.Equals(page.Id, current, StringComparison.OrdinalIgnoreCase));
        if (IndexOf(pages, current) < 0 && (contextChanged || !known))
        {
            this._pages[deviceId] = pages[0].Id;
        }
    }

    private static int IndexOf(IReadOnlyList<DashPage> pages, string? pageId)
    {
        for (int index = 0; index < pages.Count; index++)
        {
            if (string.Equals(pages[index].Id, pageId, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }

        return -1;
    }

}
