using System.Globalization;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Hardware;

namespace Sprint.Desktop.Features.Devices;

/// <summary>One plugged-in USB device, by its vendor and product id.</summary>
public readonly record struct UsbId(ushort Vid, ushort Pid);

/// <summary>A USB id a catalog entry looks for (<see cref="CatalogDevice.Detect"/>). A zero
/// <see cref="Pid"/> matches any product of the vendor.</summary>
public sealed record UsbIdPattern
{
    [JsonPropertyName("vid")]
    public ushort Vid { get; init; }

    [JsonPropertyName("pid")]
    public ushort Pid { get; init; }

    public bool Matches(UsbId id) => id.Vid == this.Vid && (this.Pid == 0 || id.Pid == this.Pid);
}

/// <summary>
/// Which catalog entries are plugged in but not added yet: the Add device dialog's "Plugged in
/// now". Pure — the host hands in what a USB scan saw (<see cref="UsbPresence"/>).
/// <para>
/// USB ids alone cannot tell a preset from a bare panel (every VoCore panel reports the same
/// id), so an entry is found only when every id it lists is present, and the entries that list
/// the most ids pick first: the Omega claims its VoCore panel together with its button box
/// before a bare VoCore screen can. Saved devices claim their hardware before anything else, so
/// a device already added is never offered again.
/// </para>
/// </summary>
public static class DeviceDetection
{
    /// <summary>One catalog id per device found, so two new bare VoCore panels give the id twice.</summary>
    public static IReadOnlyList<string> FindNew(
        IEnumerable<CatalogDevice> catalog,
        IEnumerable<SavedDevice> saved,
        IEnumerable<UsbId> present)
    {
        List<CatalogDevice> entries = [.. catalog];
        List<UsbId> pool = [.. present];

        foreach (SavedDevice device in saved)
        {
            // Whatever of a saved device is not plugged in claims nothing; the rest stays its.
            foreach (UsbIdPattern pattern in Claims(device, entries))
            {
                int index = pool.FindIndex(pattern.Matches);
                if (index >= 0)
                {
                    pool.RemoveAt(index);
                }
            }
        }

        List<string> found = [];
        // OrderByDescending is stable: entries with as many ids keep their catalog order.
        foreach (CatalogDevice entry in entries.Where(entry => entry.Detect.Count > 0).OrderByDescending(entry => entry.Detect.Count))
        {
            while (TryTakeAll(pool, entry.Detect))
            {
                found.Add(entry.Id);
            }
        }

        return found;
    }

    /// <summary>
    /// The ids a saved device owns: its preset's, or — for a custom wheel, or a device saved
    /// before presets were recorded — the panel its screen driver looks for. A wheel with
    /// buttons only claims nothing; its USB id is not known.
    /// </summary>
    private static IReadOnlyList<UsbIdPattern> Claims(SavedDevice device, IReadOnlyList<CatalogDevice> entries)
    {
        CatalogDevice? preset = entries.FirstOrDefault(entry => string.Equals(entry.Id, device.PresetId, StringComparison.OrdinalIgnoreCase));
        if (preset is { Detect.Count: > 0 })
        {
            return preset.Detect;
        }

        if (string.IsNullOrWhiteSpace(device.Driver))
        {
            return [];
        }

        ScreenUsbIdentity identity = ScreenUsbIdentity.ForDriver(device.Driver, device.Vid, device.Pid);
        return identity.Vid == 0 ? [] : [new UsbIdPattern { Vid = identity.Vid, Pid = identity.Pid }];
    }

    /// <summary>Takes one distinct present id per pattern, or nothing when any pattern finds none.</summary>
    private static bool TryTakeAll(List<UsbId> pool, IReadOnlyList<UsbIdPattern> patterns)
    {
        List<int> taken = [];
        foreach (UsbIdPattern pattern in patterns)
        {
            int index = -1;
            for (int candidate = 0; candidate < pool.Count; candidate++)
            {
                if (!taken.Contains(candidate) && pattern.Matches(pool[candidate]))
                {
                    index = candidate;
                    break;
                }
            }

            if (index < 0)
            {
                return false;
            }

            taken.Add(index);
        }

        foreach (int index in taken.OrderDescending())
        {
            pool.RemoveAt(index);
        }

        return true;
    }
}

/// <summary>
/// Lists what is plugged into USB, for <see cref="DeviceDetection"/>. Only enumerates — it opens
/// no device, so it never disturbs a screen an output is driving. Empty off Windows.
/// </summary>
public static class UsbPresence
{
    public static IReadOnlyList<UsbId> Scan()
    {
        if (!OperatingSystem.IsWindows())
        {
            return [];
        }

        return Parse(WinUsbInterop.UsbDevicePaths());
    }

    /// <summary>
    /// One id per physical device from its interface paths (<c>\\?\usb#vid_c872&amp;pid_1004#…</c>).
    /// A composite device can also list its functions (<c>…&amp;mi_00</c>); those only count when
    /// the device itself is not listed, and then once per id.
    /// </summary>
    public static IReadOnlyList<UsbId> Parse(IEnumerable<string> paths)
    {
        List<UsbId> devices = [];
        HashSet<UsbId> functionsOnly = [];
        foreach (string path in paths)
        {
            if (!TryParse(path, out UsbId id))
            {
                continue;
            }

            if (path.Contains("&mi_", StringComparison.OrdinalIgnoreCase))
            {
                functionsOnly.Add(id);
            }
            else
            {
                devices.Add(id);
            }
        }

        devices.AddRange(functionsOnly.Where(id => !devices.Contains(id)));
        return devices;
    }

    private static bool TryParse(string path, out UsbId id)
    {
        id = default;
        int vid = path.IndexOf("vid_", StringComparison.OrdinalIgnoreCase);
        int pid = path.IndexOf("pid_", StringComparison.OrdinalIgnoreCase);
        if (vid < 0 || pid < 0 || vid + 8 > path.Length || pid + 8 > path.Length)
        {
            return false;
        }

        if (!ushort.TryParse(path.AsSpan(vid + 4, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out ushort vendor)
            || !ushort.TryParse(path.AsSpan(pid + 4, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out ushort product))
        {
            return false;
        }

        id = new UsbId(vendor, product);
        return true;
    }
}
