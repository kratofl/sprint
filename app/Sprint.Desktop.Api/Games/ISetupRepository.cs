namespace Sprint.Desktop.Api.Games;

/// <summary>
/// One setup the game stores, identified and change-stamped without reading its contents,
/// so a watcher can spot a change and a best-guess match can be made on car, track and
/// modification time alone.
/// </summary>
/// <param name="Id">Opaque locator the repository can read back. Callers treat it as a key.</param>
/// <param name="Name">The setup's own name as the driver sees it.</param>
/// <param name="Track">Track the setup is filed under, or null when the game does not file setups per track.</param>
public sealed record GameSetupInfo(
    string Id,
    string Name,
    string? Track,
    DateTimeOffset LastWriteUtc);

/// <summary>
/// One stored setup value, kept exactly as the game wrote it. Values are the game's own
/// indices, not physical units — rendering "rear wing = 7 clicks" needs vehicle data the
/// setup does not contain — so the raw value is preserved verbatim and diffing works without
/// interpreting anything.
/// </summary>
public sealed record GameSetupValue(
    string Section,
    string Key,
    string RawValue);

/// <summary>
/// A setup's full contents at one point in time: enough to snapshot, dedupe by content and
/// diff two versions.
/// </summary>
/// <param name="VehicleDescriptor">The car/class string the setup declares, when it does —
/// what a best-guess match against the driven car is made on. Null when absent.</param>
public sealed record GameSetupSnapshot(
    GameSetupInfo Info,
    string? VehicleDescriptor,
    IReadOnlyList<GameSetupValue> Values);

/// <summary>
/// Reads the setups a game stores, mapped onto Sprint records.
/// </summary>
/// <remarks>
/// Read-only on purpose: Sprint never writes into the game directory, and producing a setup
/// file is an export to a location the user picks, not a repository write.
/// </remarks>
public interface ISetupRepository
{
    /// <summary>
    /// Every stored setup, most recently modified first. Empty when the game has no setups
    /// stored yet, which is not an error.
    /// </summary>
    IReadOnlyList<GameSetupInfo> ListSetups();

    /// <summary>
    /// Read one setup's contents, or null when it cannot be read or parsed. One unreadable
    /// setup must never abort a scan.
    /// </summary>
    GameSetupSnapshot? Read(GameSetupInfo setup);
}
