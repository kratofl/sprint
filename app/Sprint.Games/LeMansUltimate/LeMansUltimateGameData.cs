namespace Sprint.Games.LeMansUltimate;

internal static class LeMansUltimateGameData
{
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
