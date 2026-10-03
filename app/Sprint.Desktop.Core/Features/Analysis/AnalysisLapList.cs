namespace Sprint.Desktop.Features.Analysis;

public enum AnalysisLapFilter
{
    All,
    WithChannels,
    TimeOnly,
}

public enum AnalysisLapSort
{
    Fastest,
    LapNumber,
}

/// <summary>Pure lap-sidebar filtering and ordering, kept out of the Avalonia view for tests.</summary>
public static class AnalysisLapList
{
    public static IReadOnlyList<CorpusLap> Apply(
        IReadOnlyList<CorpusLap> laps,
        AnalysisLapFilter filter,
        AnalysisLapSort sort)
    {
        ArgumentNullException.ThrowIfNull(laps);

        var filtered = filter switch
        {
            AnalysisLapFilter.WithChannels => laps.Where(lap => lap.HasChannels),
            AnalysisLapFilter.TimeOnly => laps.Where(lap => !lap.HasChannels),
            _ => laps.AsEnumerable(),
        };

        return sort switch
        {
            AnalysisLapSort.LapNumber => [.. filtered.OrderBy(lap => lap.LapNumber)],
            _ => [.. filtered.OrderBy(lap => lap.LapTimeSeconds)],
        };
    }
}
