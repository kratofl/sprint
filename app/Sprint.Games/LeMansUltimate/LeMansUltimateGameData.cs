using Sprint.Desktop.Api.Games;

namespace Sprint.Games.LeMansUltimate;

internal static class LeMansUltimateGameData
{
    /// <summary>
    /// The game name every writer stamps onto Sprint records, and therefore part of the
    /// lap-history context key. Both writers — the live mapper and the results importer —
    /// must use this exact value: two spellings would split one real context into two corpus
    /// buckets that never join, and every statistic would silently use half the data.
    /// <para>
    /// Deliberately distinct from <see cref="Descriptor"/>'s id, which is a lowercase
    /// identifier for settings and registry lookup, not a value stamped into stored history.
    /// </para>
    /// </summary>
    public const string GameName = "LeMansUltimate";

    public const string SharedMemoryName = "LMU_Data";
    public const int MaxVehicles = 104;
    public const string WindowsSupportPath = @"Le Mans Ultimate\Support\SharedMemoryInterface";
    public const string LinuxSharedMemoryPath = "/dev/shm/LMU_Data";

    public static GameDescriptor Descriptor { get; } = new(
        Id: "lemansultimate",
        Name: "Le Mans Ultimate",
        Transport: $"shared memory:{SharedMemoryName}",
        Available: OperatingSystem.IsWindows() || File.Exists(LinuxSharedMemoryPath));
}
