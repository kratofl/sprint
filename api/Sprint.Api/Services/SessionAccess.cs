namespace Sprint.Api.Services;

/// <summary>
/// What one viewer may see, as plain data: the drivers they engineer for, and the sessions of
/// those drivers they were excluded from. <see cref="CanView"/> is the access rule for every
/// session surface — lists, history and the live stream — so it lives in exactly one place.
/// </summary>
public sealed record ViewerGrants(
    string ViewerId,
    IReadOnlySet<string> Drivers,
    IReadOnlySet<(string DriverId, string SessionKey)> Excluded)
{
    /// <summary>The driver always sees their own sessions; a linked engineer sees the driver's sessions unless excluded from that one.</summary>
    public bool CanView(string driverId, string sessionKey) =>
        driverId == this.ViewerId
        || (this.Drivers.Contains(driverId) && !this.Excluded.Contains((driverId, sessionKey)));
}
