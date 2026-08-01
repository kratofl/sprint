namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Persistence boundary for the lap-history corpus (#179). Separate from
/// <see cref="ISessionPlanStore"/> on purpose: plans and history have different shapes,
/// different volumes and different lifetimes, and only history is written without the user
/// asking. Storage-agnostic so a future remote/sync implementation can persist the same
/// records without touching the recorder or its readers.
/// </summary>
public interface ILapHistoryStore
{
    /// <summary>Loads every persisted history session. Order is not guaranteed.</summary>
    IReadOnlyList<LapHistorySession> LoadAll();

    /// <summary>Creates or replaces the session identified by <see cref="LapHistorySession.Id"/>.</summary>
    void Save(LapHistorySession session);

    /// <summary>Removes the session with <paramref name="sessionId"/>. A no-op if it does not exist.</summary>
    void Delete(string sessionId);
}
