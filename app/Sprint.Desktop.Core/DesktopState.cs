using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Core;

public sealed record DesktopTelemetryState(TelemetryFrame Frame, TelemetryStatus Status, double Hz);

public sealed class DesktopState
{
    private DesktopTelemetryState _telemetry = new(new TelemetryFrame(), TelemetryStatus.Disconnected("Sprint Demo"), 0);
    private TaskCompletionSource _published = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public DesktopTelemetryState Telemetry => Volatile.Read(ref this._telemetry);

    /// <summary>
    /// Completes on the next <see cref="Publish"/>, so a reader can follow the telemetry as it is
    /// published instead of polling for it. Take it before reading <see cref="Telemetry"/>, or a
    /// publish between the two is missed.
    /// </summary>
    public Task NextPublish => Volatile.Read(ref this._published).Task;

    public void Publish(DesktopTelemetryState state)
    {
        Volatile.Write(ref this._telemetry, state);
        Interlocked.Exchange(ref this._published, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).TrySetResult();
    }
}
