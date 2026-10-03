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

    /// <summary>
    /// Just the context of every session — the game/track/car buckets — without materialising
    /// laps. A reference curve is the largest thing Sprint stores (201 points per lap), so
    /// deserialising the whole corpus to list distinct track names is what made the creation
    /// sheet stall once a driver had real mileage recorded.
    /// <para>
    /// The default implementation projects <see cref="LoadAll"/>, which keeps fakes and future
    /// stores working; a store that can read cheaply overrides it.
    /// </para>
    /// </summary>
    IReadOnlyList<LapHistoryContext> LoadContexts() =>
        [.. LoadAll().Select(session => session.Context)];

    /// <summary>Creates or replaces the session identified by <see cref="LapHistorySession.Id"/>.</summary>
    void Save(LapHistorySession session);

    /// <summary>Removes the session with <paramref name="sessionId"/>. A no-op if it does not exist.</summary>
    void Delete(string sessionId);
}
