using Sprint.Desktop.Api.Engineer;

namespace Sprint.Desktop.Features.Engineer;

/// <summary>
/// The WS9 engineer staging seam: turns the client's mutable
/// <see cref="EngineerControl"/> list into the shared <see cref="StagedControlChange"/>
/// contract (the reviewable "stage → review → push" unit, US19/US20) and applies
/// push/revert. Also builds the engineer→driver <see cref="EngineerCommand"/>
/// shapes (set-target-lap / note). Pure and Avalonia-free so the diff/push/revert
/// semantics and contract round-trip are unit-testable without the UI.
/// </summary>
public static class EngineerStageService
{
    private const double Epsilon = 1e-6;

    /// <summary>The full staged-vs-car diff for every control (dirty flag per entry).</summary>
    public static IReadOnlyList<StagedControlChange> Diff(IEnumerable<EngineerControl> controls)
    {
        ArgumentNullException.ThrowIfNull(controls);
        return controls
            .Select(control => new StagedControlChange
            {
                Key = control.Key,
                CarValue = control.CarValue,
                StagedValue = control.StagedValue,
            })
            .ToArray();
    }

    /// <summary>Only the entries whose staged value differs from the car.</summary>
    public static IReadOnlyList<StagedControlChange> DirtyChanges(IEnumerable<EngineerControl> controls) =>
        Diff(controls).Where(change => change.IsDirty).ToArray();

    public static int DirtyCount(IEnumerable<EngineerControl> controls) =>
        controls.Count(control => Math.Abs(control.CarValue - control.StagedValue) > Epsilon);

    /// <summary>Applies staged values onto the car (car ← staged) and returns the changes that were applied.</summary>
    public static IReadOnlyList<StagedControlChange> Push(IEnumerable<EngineerControl> controls)
    {
        var applied = DirtyChanges(controls);
        foreach (var control in controls)
        {
            control.CarValue = control.StagedValue;
        }

        return applied;
    }

    /// <summary>Discards staged edits (staged ← car).</summary>
    public static void Revert(IEnumerable<EngineerControl> controls)
    {
        foreach (var control in controls)
        {
            control.StagedValue = control.CarValue;
        }
    }

    public static EngineerCommand SetTargetLap(double lapTimeSeconds, int lapNumber, string from, long timestampMs) => new()
    {
        Id = $"cmd-target-{timestampMs}",
        Type = EngineerCommandType.SetTargetLap,
        Payload = new SetTargetLapPayload { LapTimeSeconds = lapTimeSeconds, LapNumber = lapNumber },
        TimestampMs = timestampMs,
        From = from,
    };

    public static EngineerCommand SendNote(string text, string from, long timestampMs) => new()
    {
        Id = $"cmd-note-{timestampMs}",
        Type = EngineerCommandType.SendNote,
        Payload = new NotePayload { Text = text },
        TimestampMs = timestampMs,
        From = from,
    };
}
