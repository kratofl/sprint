namespace Sprint.Desktop.Features.Setup;

/// <summary>
/// Persistence boundary for captured setup versions (#188). Storage-agnostic so a future
/// remote or synced vault can hold the same records without touching capture or association.
/// </summary>
public interface ISetupSnapshotStore
{
    /// <summary>Every persisted snapshot. Order is not guaranteed.</summary>
    IReadOnlyList<SetupSnapshot> LoadAll();

    /// <summary>Creates or replaces the snapshot identified by <see cref="SetupSnapshot.Id"/>.</summary>
    void Save(SetupSnapshot snapshot);
}
