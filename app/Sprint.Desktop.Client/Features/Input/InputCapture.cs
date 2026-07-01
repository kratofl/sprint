namespace Sprint.Desktop.Features.Input;

public enum InputCapturePhase
{
    Idle,
    Listening,
    Captured,
    Cancelled,
    TimedOut,
}

/// <summary>
/// Immutable state for a single "listen to bind" capture (matrix 4.7 US35). Holds
/// the command being bound while listening and the captured input token once a
/// button/key arrives.
/// </summary>
public sealed record InputCaptureState(
    InputCapturePhase Phase,
    string? Command,
    string? CapturedInput,
    DateTimeOffset StartedAt)
{
    public static InputCaptureState Idle { get; } = new(InputCapturePhase.Idle, null, null, default);

    public bool IsListening => Phase == InputCapturePhase.Listening;
}

/// <summary>
/// Pure reducer for the listen-to-bind capture session: start/cancel/timeout plus
/// a single-flight capture that accepts either a physical button token or a
/// keyboard-fallback token. No timers or UI — the caller supplies the clock and
/// drives <see cref="Tick"/>, keeping the ergonomics unit-testable (US43).
/// </summary>
public static class InputCaptureReducer
{
    public static InputCaptureState Start(string command, DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(command);
        return new InputCaptureState(InputCapturePhase.Listening, command, null, now);
    }

    /// <summary>Records the captured input token and completes the session. No-op unless currently listening (single-flight).</summary>
    public static InputCaptureState Capture(InputCaptureState state, string input)
    {
        if (!state.IsListening || string.IsNullOrWhiteSpace(input))
        {
            return state;
        }

        return state with { Phase = InputCapturePhase.Captured, CapturedInput = input };
    }

    public static InputCaptureState Cancel(InputCaptureState state) =>
        state.IsListening ? state with { Phase = InputCapturePhase.Cancelled } : state;

    /// <summary>Times out a listening session once <paramref name="timeout"/> has elapsed since it started.</summary>
    public static InputCaptureState Tick(InputCaptureState state, DateTimeOffset now, TimeSpan timeout)
    {
        if (state.IsListening && now - state.StartedAt >= timeout)
        {
            return state with { Phase = InputCapturePhase.TimedOut };
        }

        return state;
    }

    /// <summary>Builds the binding produced by a completed capture, or null if not captured.</summary>
    public static InputBinding? ToBinding(InputCaptureState state) =>
        state.Phase == InputCapturePhase.Captured && state.Command is { } command && state.CapturedInput is { } input
            ? new InputBinding { Input = input, Command = command }
            : null;
}
