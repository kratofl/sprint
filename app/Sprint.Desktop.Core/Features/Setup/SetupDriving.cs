using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Setup;

/// <summary>How many laps were driven on one tyre choice: front and rear compound as the game named them.</summary>
public sealed record TyreChoice(string? Front, string? Rear, int Laps);

/// <summary>
/// How one setup version drove, over the valid laps of every run the driver put it on. Times
/// are medians, never means, like everywhere else lap history is summed up (traffic and offs).
/// </summary>
public sealed record SetupDriven(
    string VersionId,
    int Laps,
    int Sessions,
    double? BestLapSeconds,
    double? MedianLapSeconds,
    double? FuelPerLapLiters,
    IReadOnlyList<TyreChoice> Tyres);

/// <summary>Sums up the laps driven on setup versions, from the runs the driver put them on (<see cref="RunSetups"/>).</summary>
public static class SetupDriving
{
    /// <summary>One summary per version in <paramref name="versionIds"/>, in that order; a version never driven has zero laps.</summary>
    public static IReadOnlyList<SetupDriven> Summarize(
        IReadOnlyList<string> versionIds,
        IEnumerable<LapHistorySession> sessions,
        IReadOnlyDictionary<string, IReadOnlyDictionary<int, RunSetup>> picks)
    {
        Dictionary<string, List<(string Session, LapHistoryRecord Lap)>> driven = versionIds
            .Distinct(StringComparer.Ordinal)
            .ToDictionary(id => id, _ => new List<(string, LapHistoryRecord)>(), StringComparer.Ordinal);

        foreach (LapHistorySession session in sessions)
        {
            if (!picks.TryGetValue(session.Id, out IReadOnlyDictionary<int, RunSetup>? runs))
            {
                continue;
            }

            foreach (LapHistoryRecord lap in session.Laps.Where(lap => lap.IsValid && lap.LapTimeSeconds > 0))
            {
                if (runs.TryGetValue(lap.Outing ?? 0, out RunSetup? setup) && driven.TryGetValue(setup.SnapshotId, out List<(string, LapHistoryRecord)>? laps))
                {
                    laps.Add((session.Id, lap));
                }
            }
        }

        return [.. versionIds.Select(id => Summary(id, driven[id]))];
    }

    private static SetupDriven Summary(string versionId, List<(string Session, LapHistoryRecord Lap)> laps)
    {
        List<double> times = [.. laps.Select(entry => entry.Lap.LapTimeSeconds).Order()];
        List<double> fuel = [.. laps.Select(entry => entry.Lap.FuelUsedLiters).OfType<double>().Order()];
        return new SetupDriven(
            versionId,
            laps.Count,
            laps.Select(entry => entry.Session).Distinct(StringComparer.Ordinal).Count(),
            times.Count > 0 ? times[0] : null,
            LowerMedian(times),
            LowerMedian(fuel),
            [
                .. laps
                    .GroupBy(entry => (entry.Lap.FrontCompound, entry.Lap.RearCompound))
                    .Where(group => group.Key.FrontCompound is not null || group.Key.RearCompound is not null)
                    .Select(group => new TyreChoice(group.Key.FrontCompound, group.Key.RearCompound, group.Count()))
                    .OrderByDescending(choice => choice.Laps)
            ]);
    }

    /// <summary>The lower middle value, so the answer is always one that was really measured.</summary>
    private static double? LowerMedian(List<double> sorted) => sorted.Count > 0 ? sorted[(sorted.Count - 1) / 2] : null;
}
