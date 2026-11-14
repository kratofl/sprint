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

/// <summary>The part of Sprint's setup page a value is shown on.</summary>
public enum SetupTab
{
    Power,
    WheelsAndBrakes,
    Suspension,
    Dampers,
    ChassisAndAero,
}

/// <summary>
/// One stored value as the driver reads it: where it sits on the setup page, what it is
/// called, and the readable value the game wrote beside it.
/// </summary>
/// <param name="Group">The block it is shown in on its tab, such as "Front", "Rear left" or
/// "Gearbox". A per-corner group is named "Front left", "Front right", "Rear left" or
/// "Rear right", so a view can fold an axle's two sides into one row.</param>
/// <param name="Display">The value in the game's own words ("-1.0 deg", "P12"), in whatever
/// language the game was set to when it saved the file.</param>
/// <param name="Step">The game's own index for the value, when it has one. Two values with
/// the same step are the same setting, whatever language their displays are in.</param>
public sealed record GameSetupReading(
    string Section,
    string Key,
    SetupTab Tab,
    string Group,
    string Label,
    string Display,
    int? Step);

/// <summary>The car a setup declares, split up for grouping and filtering.</summary>
/// <param name="Car">The car's name as the driver knows it, such as "Porsche 963".</param>
/// <param name="Class">The class it races in, such as "Hypercar", when the setup says.</param>
/// <param name="Season">The season or series version the car is from, such as "WEC 2025".</param>
public sealed record GameSetupVehicle(string Car, string? Class, string? Season);

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
    /// The directory whose subtree holds the setups, so a host that wants to notice a save can
    /// watch it. Null when the game's setups are not one watchable tree.
    /// </summary>
    /// <remarks>
    /// A path rather than a change event (#188): a watcher has a lifetime, a thread, a debounce
    /// and a re-scan policy, and making every repository own one would put all of that behind a
    /// capability that is otherwise a pure reader. The host owns the watcher, points it here,
    /// and calls <see cref="ListSetups"/> again when it fires — which is also the only way the
    /// repository stays usable from a test with no watcher at all.
    /// </remarks>
    string? WatchRoot { get; }

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

    /// <summary>
    /// How a stored value reads on the setup page, or null when it is not something the
    /// driver sets: a header, a note, or a setting this car cannot adjust.
    /// </summary>
    GameSetupReading? Describe(GameSetupValue value);

    /// <summary>The car a setup's <see cref="GameSetupSnapshot.VehicleDescriptor"/> names.</summary>
    GameSetupVehicle DescribeVehicle(string vehicleDescriptor);

    /// <summary>A track as the driver knows it, from the name the game files setups under.</summary>
    string TrackName(string track);
}
