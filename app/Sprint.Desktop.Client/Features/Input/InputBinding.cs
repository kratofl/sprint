using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Devices;

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

internal sealed record ResolvedHardwareBinding(string Command, string? DeviceId);

/// <summary>
/// Resolves Raw Input using the retired detector's wildcard device semantics.
/// A wheel's screen transport and its controls commonly expose different USB
/// identities, so bindings stored on a saved device cannot be scoped to the
/// screen VID/PID. Device bindings still carry their owning device id as the
/// command payload; global controls are the fallback.
/// </summary>
internal static class HardwareBindingResolver
{
    public static ResolvedHardwareBinding? Resolve(
        HardwareInputEvent input,
        IEnumerable<SavedDevice> devices,
        IEnumerable<InputBinding> globalBindings)
    {
        foreach (var device in devices.Where(device => !device.Disabled))
        {
            if (ResolveDevice(input.Input, device) is { } resolved)
            {
                return resolved;
            }
        }

        return BindingResolver.Resolve(input.Input, globalBindings) is { } command
            ? new ResolvedHardwareBinding(command, null)
            : null;
    }

    private static ResolvedHardwareBinding? ResolveDevice(string input, SavedDevice device)
    {
        var command = device.Bindings
            .FirstOrDefault(binding => string.Equals(binding.Input, input, StringComparison.OrdinalIgnoreCase))
            ?.Command;
        return string.IsNullOrWhiteSpace(command)
            ? null
            : new ResolvedHardwareBinding(
                command,
                DeviceCapabilities.HasScreen(device) ? device.Id : null);
    }
}
