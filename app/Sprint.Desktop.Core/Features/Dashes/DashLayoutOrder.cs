namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// The one stable order dashes are listed in (by name, then id), and the dash a device falls
/// back to when it has none or its own was deleted: the first in that order. Stable across
/// restarts, unlike the runtime collection, which appends new dashes at the end.
/// </summary>
public static class DashLayoutOrder
{
    public static IEnumerable<DashLayout> Sort(IEnumerable<DashLayout> layouts) =>
        layouts
            .OrderBy(layout => layout.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(layout => layout.Id, StringComparer.Ordinal);

    /// <summary>The fallback dash, or null when there are no dashes at all.</summary>
    public static DashLayout? First(IEnumerable<DashLayout> layouts) => Sort(layouts).FirstOrDefault();
}
