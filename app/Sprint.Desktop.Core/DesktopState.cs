using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Core;

public sealed record DesktopTelemetryState(TelemetryFrame Frame, TelemetryStatus Status, double Hz);

public sealed class DesktopState
{
    private DesktopTelemetryState _telemetry = new(new TelemetryFrame(), TelemetryStatus.Disconnected("Sprint Demo"), 0);

    public DesktopTelemetryState Telemetry => Volatile.Read(ref _telemetry);

    public void Publish(DesktopTelemetryState state) => Volatile.Write(ref _telemetry, state);
}
