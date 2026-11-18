using Sprint.Desktop.Features.Dashes;

namespace Sprint.Desktop.Features.Input;

/// <summary>What a wheel button press means right now.</summary>
public abstract record ButtonPress
{
    private ButtonPress()
    {
    }

    /// <summary>The press is the button the driver was asked for: bind <paramref name="Input"/> to <paramref name="Command"/> on <paramref name="DeviceId"/>.</summary>
    public sealed record Assign(string DeviceId, string Command, string Input) : ButtonPress;

    /// <summary>An ordinary press: run what the button is bound to, if anything.</summary>
    public sealed record Run(HardwareInputEvent Input) : ButtonPress;
}

/// <summary>The device and function waiting for a press, since <paramref name="Since"/>.</summary>
public sealed record ButtonListening(string DeviceId, string Command, DateTimeOffset Since);

/// <summary>
/// Assigning wheel buttons. While the Controls tab asks "press the button for Next dash page",
/// the next press is that button, not its action; after <see cref="Timeout"/> without one the
/// request lapses. Thread-safe: presses arrive on the input thread, <see cref="Listen"/> and
/// <see cref="Cancel"/> from commands, <see cref="Current"/> from the state poll.
/// </summary>
public sealed class ButtonAssignment
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    private readonly Lock _gate = new();
    private ButtonListening? _listening;

    public void Listen(string deviceId, string command, DateTimeOffset now)
    {
        lock (this._gate)
            this._listening = new ButtonListening(deviceId, command, now);
    }

    public void Cancel()
    {
        lock (this._gate)
            this._listening = null;
    }

    /// <summary>The request waiting for a press at <paramref name="now"/>, or null.</summary>
    public ButtonListening? Current(DateTimeOffset now)
    {
        lock (this._gate)
            return this.Live(now);
    }

    public ButtonPress Press(HardwareInputEvent input, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(input);
        lock (this._gate)
        {
            if (this.Live(now) is not { } listening)
                return new ButtonPress.Run(input);

            this._listening = null;
            return new ButtonPress.Assign(listening.DeviceId, listening.Command, input.Input);
        }
    }

    private ButtonListening? Live(DateTimeOffset now)
    {
        if (this._listening is { } listening && now - listening.Since >= Timeout)
            this._listening = null;
        return this._listening;
    }
}

/// <summary>A function a wheel button can run on a device, as the Controls tab lists it.</summary>
public sealed record ButtonFunction(string Id, string Label);

/// <summary>
/// The functions a device's buttons can run, and how a bound command id reads back. A page jump is
/// <c>dash.page.goto:&lt;pageId&gt;</c>, so one binding list holds every function.
/// </summary>
public static class ButtonFunctions
{
    public const string GotoPrefix = "dash.page.goto:";

    /// <summary>
    /// For a device showing <paramref name="layout"/>: next and previous page and a jump to each of
    /// its pages; on any device, Ack (it acts on every dash, so a button box can carry it too) and
    /// the HUD over the game.
    /// </summary>
    public static IReadOnlyList<ButtonFunction> For(DashLayout? layout)
    {
        List<ButtonFunction> functions = [];
        if (layout is not null && layout.Pages.Count > 0)
        {
            functions.Add(new ButtonFunction(SprintCommands.DashPageNext, "Next dash page"));
            functions.Add(new ButtonFunction(SprintCommands.DashPagePrev, "Previous dash page"));
            functions.AddRange(layout.Pages.Select(page => new ButtonFunction(GotoPrefix + page.Id, $"Go to {page.Name}")));
        }

        functions.Add(new ButtonFunction(SprintCommands.DashAcknowledge, "Acknowledge"));
        functions.Add(new ButtonFunction(SprintCommands.CompareHudToggle, "Show or hide the HUD"));
        return functions;
    }

    /// <summary>The page a <c>dash.page.goto:</c> command jumps to, or null for any other command.</summary>
    public static string? GotoPage(string command) =>
        command.StartsWith(GotoPrefix, StringComparison.Ordinal) && command.Length > GotoPrefix.Length ? command[GotoPrefix.Length..] : null;
}
