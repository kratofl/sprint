namespace Sprint.Desktop.Host;

/// <summary>One device's most recently delivered frame stats — what has actually been painted,
/// not what is configured. See <see cref="ScreenOutputs"/> for the configured-output description
/// this is layered onto.</summary>
public sealed record ScreenFrameDescription(string DeviceId, int Width, int Height, long Sequence, int Bytes, DateTimeOffset ReceivedAt);

/// <summary>
/// Records frames actually delivered by an offscreen browser (<c>POST /api/screens/{id}/frame</c>).
/// Deliberately does not describe which outputs should exist — a device that is configured but has
/// not painted yet is a real, reportable state, not the absence of one. See
/// <see cref="ScreenOutputs.Describe"/> for the configured-output list this feeds diagnostics into.
/// </summary>
public sealed class FrameStore
{
    private readonly Dictionary<string, ScreenFrameDescription> _frames = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();

    public void Publish(string id, int width, int height, long sequence, int bytes)
    {
        lock (this._gate)
        {
            if (this._frames.TryGetValue(id, out ScreenFrameDescription? old) && old.Sequence >= sequence) return;
            this._frames[id] = new ScreenFrameDescription(id, width, height, sequence, bytes, DateTimeOffset.UtcNow);
        }
    }

    /// <summary>The most recently delivered frame's stats for one device, or null before its first frame.</summary>
    public ScreenFrameDescription? Get(string deviceId)
    {
        lock (this._gate)
        {
            return this._frames.TryGetValue(deviceId, out ScreenFrameDescription? frame) ? frame : null;
        }
    }
}
