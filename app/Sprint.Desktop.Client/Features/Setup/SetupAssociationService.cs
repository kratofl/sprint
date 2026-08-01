using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Setup;

/// <summary>
/// How a session's setup is recorded when Sprint could not identify it.
/// </summary>
public static class SetupAssociation
{
    /// <summary>
    /// The reference written when the driver confirms the setup cannot be identified.
    /// <para>
    /// An explicit marker rather than leaving the field empty, because "nobody has been asked
    /// yet" and "asked, and the answer is that we do not know" are different states: only the
    /// first should ever be asked about again, and neither may become a guess. A generated
    /// snapshot id can never collide with it — those are content digests prefixed
    /// <c>setup-</c>.
    /// </para>
    /// </summary>
    public const string Unknown = "unknown";

    /// <summary>True when <paramref name="reference"/> is the unknown marker.</summary>
    public static bool IsUnknown(string? reference) =>
        string.Equals(reference, Unknown, StringComparison.Ordinal);
}

/// <summary>
/// Sprint's best guess at which setup a session was driven with, for the driver to confirm.
/// </summary>
/// <param name="Candidate">
/// The proposed setup, or null when none could be identified. Null is the honest answer and
/// the only alternative to a guess: a wrong reference in history is worse than no reference.
/// </param>
/// <param name="Reason">Why this is the proposal, in words a confirmation prompt can show.</param>
public sealed record SetupAssociationProposal(SetupSnapshot? Candidate, string Reason)
{
    /// <summary>True when no setup could be identified, so confirming records <see cref="SetupAssociation.Unknown"/>.</summary>
    public bool IsUnknown => Candidate is null;

    /// <summary>
    /// Rear brake bias as telemetry observed it, when the caller supplied it, and the value
    /// the candidate states for the same control.
    /// <para>
    /// Shown beside each other for the driver to judge, never compared numerically: the file
    /// states an index into the vehicle's own steps, and turning that into a percentage needs
    /// vehicle data the setup does not carry. A comparison Sprint cannot actually make would
    /// reject the right setup as often as the wrong one.
    /// </para>
    /// </summary>
    public double? ObservedBrakeBiasRear { get; init; }

    /// <summary>The candidate's own brake-bias index, or null when it states none.</summary>
    public string? CandidateBrakeBiasSetting { get; init; }

    /// <summary>
    /// What confirming this proposal as-is records: the candidate's id, or the unknown marker.
    /// </summary>
    public string Reference => Candidate?.Id ?? SetupAssociation.Unknown;
}

/// <summary>
/// Matches a finished session to the setup it was driven with (#188).
/// <para>
/// Shared memory does not say which setup is loaded — only whether the setup is fixed — so
/// this proposes and never decides: the most recently saved setup for the car and track, and
/// the driver confirms it. Nothing here writes a reference on its own.
/// </para>
/// </summary>
public sealed class SetupAssociationService
{
    /// <summary>The setup key holding rear brake bias, surfaced beside the observed value.</summary>
    private const string BrakeBiasKey = "BrakeBiasSetting";

    private readonly ISetupSnapshotStore _setups;
    private readonly ILapHistoryStore _history;

    public SetupAssociationService(ISetupSnapshotStore setups, ILapHistoryStore history)
    {
        _setups = setups ?? throw new ArgumentNullException(nameof(setups));
        _history = history ?? throw new ArgumentNullException(nameof(history));
    }

    /// <summary>
    /// Proposes the setup <paramref name="session"/> was most likely driven with.
    /// </summary>
    /// <param name="observedBrakeBiasRear">
    /// Rear brake bias as telemetry reported it, when known. Carried into the proposal for the
    /// driver to sanity-check the candidate against; it does not select one.
    /// </param>
    public SetupAssociationProposal Propose(
        LapHistorySession session,
        double? observedBrakeBiasRear = null)
    {
        ArgumentNullException.ThrowIfNull(session);

        var context = session.Context;
        var candidates = _setups.LoadAll()
            .Where(snapshot => Matches(snapshot, context))
            // The setup in the car is the one most recently saved for it. The file's own
            // timestamp, not when Sprint captured it: a first capture pass sees a folder of
            // old setups all at once and would otherwise rank them by scan order.
            .OrderByDescending(snapshot => snapshot.SourceLastWriteUtc)
            .ToList();

        if (candidates.Count == 0)
        {
            return new SetupAssociationProposal(
                null,
                $"No setup captured for {Describe(context)}.")
            {
                ObservedBrakeBiasRear = observedBrakeBiasRear,
            };
        }

        var candidate = candidates[0];
        return new SetupAssociationProposal(
            candidate,
            $"Most recently saved setup for {Describe(context)}.")
        {
            ObservedBrakeBiasRear = observedBrakeBiasRear,
            CandidateBrakeBiasSetting = candidate.Value(BrakeBiasKey),
        };
    }

    /// <summary>
    /// Records the driver's answer on the session and on the lap records it produced, and
    /// persists the session. <paramref name="reference"/> is a snapshot id, or
    /// <see cref="SetupAssociation.Unknown"/> when the setup could not be identified.
    /// </summary>
    /// <param name="segment">
    /// The plan segment these laps were driven in, when a plan was running: its lap summaries
    /// carry the same reference, so a plan read back later says which setup produced its laps.
    /// Persisting the plan stays with the planner, which owns it.
    /// </param>
    public void Confirm(LapHistorySession session, string reference, PlanSegment? segment = null)
    {
        ArgumentNullException.ThrowIfNull(session);
        ArgumentException.ThrowIfNullOrEmpty(reference);

        session.SetupReference = reference;
        _history.Save(session);

        foreach (var lap in segment?.Laps ?? [])
        {
            lap.SetupReference = reference;
        }
    }

    /// <summary>
    /// Whether a captured setup could be the one this session was driven with. Both parts must
    /// match: a setup for the right car at another track is not a candidate, and neither is
    /// another car's setup for this one.
    /// </summary>
    private static bool Matches(SetupSnapshot snapshot, LapHistoryContext context) =>
        string.Equals(snapshot.Game, context.Game, StringComparison.OrdinalIgnoreCase)
        && NamesTrack(snapshot.Track, context.TrackCourse)
        && DescribesCar(snapshot.VehicleDescriptor, context.CarModel);

    /// <summary>
    /// Whether the folder the game filed a setup under names the course that was driven. The
    /// two are written by different parts of the sim — a folder name against a scored track
    /// name — so one naming a longer form of the other still matches, while an unrelated track
    /// does not.
    /// </summary>
    private static bool NamesTrack(string? track, string course)
    {
        var stored = Normalize(track);
        var driven = Normalize(course);
        if (stored.Length == 0 || driven.Length == 0)
        {
            return false;
        }

        return stored.Contains(driven, StringComparison.Ordinal)
            || driven.Contains(stored, StringComparison.Ordinal);
    }

    /// <summary>
    /// Whether a setup's declared class names the car that was driven. The declaration is a
    /// class string ("Hypercar Porsche_963 WEC2025") and the driven car is a model
    /// ("Porsche 963"), so every word of the model must appear in it — which one car's class
    /// string does and another's does not.
    /// </summary>
    private static bool DescribesCar(string? vehicleDescriptor, string carModel)
    {
        var declared = Normalize(vehicleDescriptor);
        var driven = Normalize(carModel);
        if (declared.Length == 0 || driven.Length == 0)
        {
            return false;
        }

        return driven
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .All(word => declared.Contains(word, StringComparison.Ordinal));
    }

    /// <summary>
    /// A name reduced to lower-case words. Setups spell a car <c>Porsche_963</c> where
    /// telemetry spells it <c>Porsche 963</c>, and a separator is the only difference.
    /// </summary>
    private static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }

        var normalized = new System.Text.StringBuilder(value.Length);
        foreach (var c in value)
        {
            if (char.IsLetterOrDigit(c))
            {
                normalized.Append(char.ToLowerInvariant(c));
            }
            else if (normalized.Length > 0 && normalized[^1] != ' ')
            {
                normalized.Append(' ');
            }
        }

        return normalized.ToString().TrimEnd();
    }

    private static string Describe(LapHistoryContext context) =>
        $"{context.CarModel} at {context.TrackCourse}";
}
