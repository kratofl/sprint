namespace Sprint.Desktop.Features.Input;

/// <summary>
/// The driver's Ack presses, an app-wide event: one press, from whichever device's button, takes the
/// alert up now down on every dash. A count
/// rather than an event, so each dash output acts on it from its own thread: a wheel screen's render
/// loop compares <see cref="Count"/> with the last it saw on every frame, and a browser display's feed
/// also awaits <see cref="Next"/> so a press reaches the page without waiting for telemetry.
/// Thread-safe.
/// </summary>
public sealed class Acknowledgements
{
    private long _count;
    private TaskCompletionSource _next = new(TaskCreationOptions.RunContinuationsAsynchronously);

    /// <summary>How many times Ack was pressed since the host started.</summary>
    public long Count => Interlocked.Read(ref this._count);

    /// <summary>Completes at the next press.</summary>
    public Task Next => Volatile.Read(ref this._next).Task;

    public void Acknowledge()
    {
        Interlocked.Increment(ref this._count);
        TaskCompletionSource pressed = Interlocked.Exchange(ref this._next, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        pressed.TrySetResult();
    }
}
