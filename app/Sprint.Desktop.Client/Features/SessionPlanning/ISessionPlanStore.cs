namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Narrow persistence boundary for session plans (#99). Deliberately storage-agnostic
/// so the desktop <see cref="LocalSessionPlanStore"/> ships first and a future
/// <c>RemoteStore</c>/<c>SyncStore</c> can persist the same records without any change
/// to <see cref="SessionPlannerService"/> or the UI above it. No remote implementation
/// exists in this issue by design.
/// </summary>
public interface ISessionPlanStore
{
    /// <summary>Loads every persisted plan, including completed history. Order is not guaranteed.</summary>
    IReadOnlyList<SessionPlan> LoadAll();

    /// <summary>Creates or replaces the plan identified by <see cref="SessionPlan.Id"/>.</summary>
    void Save(SessionPlan plan);

    /// <summary>Removes the plan with <paramref name="planId"/>. A no-op if it does not exist.</summary>
    void Delete(string planId);

    /// <summary>The id of the single active (armed/tracking) plan, or <c>null</c> if none.</summary>
    string? LoadActivePlanId();

    /// <summary>Records the single active plan id, or clears it when <paramref name="planId"/> is <c>null</c>.</summary>
    void SaveActivePlanId(string? planId);
}
