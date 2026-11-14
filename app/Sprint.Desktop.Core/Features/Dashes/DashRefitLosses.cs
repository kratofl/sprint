using System.Text;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Per dash, how many widgets a change to each screen size would leave out
/// (<see cref="DashLayoutEditor.CountRefitLosses"/>), for the Duplicate dialog's and the
/// designer's warnings. Host state asks for it on every poll, so each dash's counts are kept
/// until its geometry (grid, widget places and ids, groups) changes; only sizes that would
/// leave something out are listed. Safe to call from concurrent requests.
/// </summary>
public sealed class DashRefitLosses
{
    private readonly object _gate = new();
    private Dictionary<string, Entry> _entries = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Dash id → (screen profile id → widgets left out), for every dash that would lose any.</summary>
    public IReadOnlyDictionary<string, IReadOnlyDictionary<string, int>> For(IEnumerable<DashLayout> layouts)
    {
        ArgumentNullException.ThrowIfNull(layouts);
        lock (this._gate)
        {
            Dictionary<string, Entry> next = new(StringComparer.OrdinalIgnoreCase);
            Dictionary<string, IReadOnlyDictionary<string, int>> result = new(StringComparer.Ordinal);
            foreach (DashLayout layout in layouts)
            {
                string key = GeometryKey(layout);
                Entry entry = this._entries.TryGetValue(layout.Id, out Entry? known) && known.Key == key ? known : new Entry(key, Count(layout));
                next[layout.Id] = entry;
                if (entry.Losses.Count > 0)
                {
                    result[layout.Id] = entry.Losses;
                }
            }

            // Deleted dashes drop out with the rebuild.
            this._entries = next;
            return result;
        }
    }

    private static IReadOnlyDictionary<string, int> Count(DashLayout layout)
    {
        Dictionary<string, int> losses = new(StringComparer.Ordinal);
        foreach (ScreenProfile profile in ScreenProfileCatalog.All)
        {
            int lost = DashLayoutEditor.CountRefitLosses(layout, profile);
            if (lost > 0)
            {
                losses[profile.Id] = lost;
            }
        }

        return losses;
    }

    /// <summary>Everything a refit reads: the profile and grid, and per page each widget's place, id and group, and the groups.</summary>
    private static string GeometryKey(DashLayout layout)
    {
        StringBuilder key = new();
        key.Append(layout.ScreenProfileId).Append('|').Append(layout.GridCols).Append('x').Append(layout.GridRows);
        if (layout.IdlePage is { } idle)
        {
            AppendPage(key.Append("|idle"), idle);
        }

        foreach (DashPage page in layout.Pages)
        {
            AppendPage(key.Append("|page"), page);
        }

        return key.ToString();
    }

    private static void AppendPage(StringBuilder key, DashPage page)
    {
        foreach (DashWidget widget in page.Widgets)
        {
            key.Append(';').Append(widget.Id).Append(',').Append(widget.Group)
                .Append(',').Append(widget.Col)
                .Append(',').Append(widget.Row)
                .Append(',').Append(widget.ColSpan)
                .Append(',').Append(widget.RowSpan);
        }

        foreach (DashWidgetGroup group in page.Groups)
        {
            key.Append(";g").Append(group.Id).Append(',').Append(group.Parent).Append(',').Append(group.Mode.ToString());
        }
    }

    private sealed record Entry(string Key, IReadOnlyDictionary<string, int> Losses);
}
