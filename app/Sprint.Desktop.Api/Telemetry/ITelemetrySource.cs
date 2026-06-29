namespace Sprint.Desktop.Api.Telemetry;

public interface ITelemetrySource
{
    string Name { get; }
    TelemetryFrame Current { get; }
    TelemetryFrame Advance();
}
