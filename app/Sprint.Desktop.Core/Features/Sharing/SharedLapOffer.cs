namespace Sprint.Desktop.Features.Sharing;

/// <summary>A lap read from a file or the cloud and waiting for the driver to accept it, or the reason it could not be.</summary>
public sealed record SharedLapOffer(SharedLap? Lap, string Message)
{
    public static SharedLapOffer Cancelled { get; } = new(null, "");
}
