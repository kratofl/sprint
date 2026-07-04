using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Input;

/// <summary>
/// Maps a hardware input token to an application command. The token is an opaque
/// string (e.g. <c>button:5</c>, <c>key:F1</c>, <c>encoder:2+</c>) so the same
/// shape covers wheel buttons, encoders, and the keyboard fallback (matrix 4.7).
/// </summary>
public sealed record InputBinding
{
    [JsonPropertyName("input")]
    public string Input { get; init; } = "";

    [JsonPropertyName("command")]
    public string Command { get; init; } = "";
}

/// <summary>The persisted global controls config (controls.json).</summary>
public sealed class ControlsConfig
{
    [JsonPropertyName("bindings")]
    public List<InputBinding> Bindings { get; set; } = [];
}

/// <summary>
/// Resolves an input token to a command across ordered binding layers
/// (device-specific first, then global/wildcard), matching the Go detector's
/// "exact device then wildcard" routing. Pure + testable.
/// </summary>
public static class BindingResolver
{
    public static string? Resolve(string input, params IEnumerable<InputBinding>[] layers)
    {
        foreach (var layer in layers)
        {
            foreach (var binding in layer)
            {
                if (string.Equals(binding.Input, input, StringComparison.OrdinalIgnoreCase))
                {
                    return binding.Command;
                }
            }
        }

        return null;
    }
}
