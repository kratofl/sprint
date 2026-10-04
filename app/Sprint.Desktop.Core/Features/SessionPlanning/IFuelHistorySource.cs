namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Whether Sprint holds fuel history for a given context. This is deliberately the
/// narrowest possible question: #100 only needs to know whether to ask the user for
/// manual average lap time and fuel per lap. #50 owns the history records and the
/// estimate arithmetic and will supply a real implementation without changing this
/// interface or the page above it.
/// </summary>
public interface IFuelHistorySource
{
    bool HasHistory(string game, string car, string track);
}

/// <summary>
/// The shipped implementation until #50 lands: no history for any context, so the
/// creation flow always asks for manual values.
/// </summary>
public sealed class NoFuelHistorySource : IFuelHistorySource
{
    public static NoFuelHistorySource Instance { get; } = new();

    public bool HasHistory(string game, string car, string track) => false;
}
