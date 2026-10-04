namespace Sprint.Desktop.Features.Setup;

/// <summary>The per-parameter contribution to a predicted lap-time delta.</summary>
public sealed record SetupParameterDelta(string Key, double Difference, double LapContributionSeconds);

/// <summary>A synthetic A/B prediction: candidate-vs-baseline lap delta and its breakdown.</summary>
public sealed record SetupPrediction(double LapDeltaSeconds, IReadOnlyList<SetupParameterDelta> Contributions);

/// <summary>
/// Synthetic setup A/B comparison (matrix 4.8, US20 — explicitly NOT real
/// telemetry). Produces a deterministic predicted lap-time delta between two
/// setup programs from small per-parameter sensitivities, so the Setup page can
/// show a plausible "candidate is +0.12s vs baseline" cue. Pure + testable.
/// A positive delta means the candidate is predicted slower than the baseline.
/// </summary>
public static class SetupComparison
{
    // Synthetic seconds-per-unit sensitivities. Signs follow sim-racing intuition
    // (more fuel/pressure = slower; lower ride height / more front splitter = a bit
    // quicker). These are illustrative, not a physics model.
    private static double Weight(string key) => key switch
    {
        "fuelLoad" => 0.032,
        "rearWing" => 0.011,
        "splitter" => -0.009,
        "springF" or "springR" => 0.0008,
        "arbF" or "arbR" => 0.004,
        "rideF" or "rideR" => -0.006,
        "pressF" or "pressR" => 0.012,
        "bias" => 0.003,
        "ducts" => 0.002,
        "diff" => 0.0009,
        _ => 0.005,
    };

    public static SetupPrediction Compare(SetupProgram baseline, SetupProgram candidate)
    {
        ArgumentNullException.ThrowIfNull(baseline);
        ArgumentNullException.ThrowIfNull(candidate);

        var keys = baseline.Values.Keys
            .Union(candidate.Values.Keys, StringComparer.OrdinalIgnoreCase)
            .OrderBy(key => key, StringComparer.OrdinalIgnoreCase);

        var contributions = new List<SetupParameterDelta>();
        double total = 0;
        foreach (var key in keys)
        {
            baseline.Values.TryGetValue(key, out var a);
            candidate.Values.TryGetValue(key, out var b);
            var difference = b - a;
            if (Math.Abs(difference) < 1e-9)
            {
                continue;
            }

            var contribution = Math.Round(difference * Weight(key), 3);
            total += contribution;
            contributions.Add(new SetupParameterDelta(key, difference, contribution));
        }

        return new SetupPrediction(Math.Round(total, 3), contributions);
    }
}
