using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Input;

/// <summary>
/// One saved wheel's dial as the tracker sees it: the USB ids its controls report from
/// (the preset's <see cref="CatalogDevice.Detect"/>) and the held input of each position, in order.
/// </summary>
public sealed record MultiDialSource(string DeviceId, IReadOnlyList<UsbIdPattern> Detect, IReadOnlyList<string> Inputs);

/// <summary>
/// Where a dial stands. <see cref="Position"/> is null until the wheel has reported it.
/// <see cref="Changes"/> counts real turns only -- the first report after start is not one --
/// so the dash shows its popup exactly when the count moves.
/// </summary>
public sealed record MultiDialStatus(int? Position, int Changes)
{
    public static MultiDialStatus Unknown { get; } = new(null, 0);

    public MultiDialStatus MoveTo(int position) => this.Position switch
    {
        null => this with { Position = position },
        int current when current == position => this,
        _ => new MultiDialStatus(position, this.Changes + 1),
    };
}

/// <summary>
/// Follows each wheel's multi-position dial from its held position buttons. A dial reports its
/// position as a button that stays down, so turning it shows up as a press of the new
/// position's button; this tracker turns those presses into a position and swallows them, so a
/// turn never fires whatever is bound to that button. Thread-safe: input arrives on the Raw
/// Input thread, /api/state reads on a request thread and each wheel screen every frame on its
/// own render thread.
/// </summary>
public sealed class MultiDialTracker
{
    private readonly object _gate = new();
    private readonly Dictionary<string, MultiDialStatus> _status = new(StringComparer.OrdinalIgnoreCase);
    private IReadOnlyList<MultiDialSource> _sources = [];

    /// <summary>Replaces the dials to follow. A device that is no longer listed forgets its position.</summary>
    public void Configure(IReadOnlyList<MultiDialSource> sources)
    {
        lock (this._gate)
        {
            this._sources = sources;
            HashSet<string> kept = sources.Select(source => source.DeviceId).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (string deviceId in this._status.Keys.Where(id => !kept.Contains(id)).ToList())
            {
                this._status.Remove(deviceId);
            }
        }
    }

    /// <summary>Takes one input; true when it was a dial position, which the caller must not dispatch further.</summary>
    public bool Observe(HardwareInputEvent input)
    {
        UsbId from = new(input.Vid, input.Pid);
        bool consumed = false;
        lock (this._gate)
        {
            foreach (MultiDialSource source in this._sources)
            {
                if (!source.Detect.Any(pattern => pattern.Matches(from)))
                {
                    continue;
                }

                int position = IndexOf(source.Inputs, input.Input);
                if (position < 0)
                {
                    continue;
                }

                this._status[source.DeviceId] = this.StatusOfLocked(source.DeviceId).MoveTo(position);
                consumed = true;
            }
        }

        return consumed;
    }

    public MultiDialStatus StatusOf(string deviceId)
    {
        lock (this._gate)
        {
            return this.StatusOfLocked(deviceId);
        }
    }

    private MultiDialStatus StatusOfLocked(string deviceId) =>
        this._status.TryGetValue(deviceId, out MultiDialStatus? status) ? status : MultiDialStatus.Unknown;

    private static int IndexOf(IReadOnlyList<string> inputs, string input)
    {
        for (int index = 0; index < inputs.Count; index++)
        {
            if (string.Equals(inputs[index], input, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }

        return -1;
    }
}
