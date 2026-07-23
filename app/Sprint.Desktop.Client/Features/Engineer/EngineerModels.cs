namespace Sprint.Desktop.Features.Engineer;

public enum ExternalOperationState
{
    Idle,
    Pending,
    Confirmed,
    Failed,
}

public sealed class EngineerControl
{
    public string Key { get; init; } = "";
    public string Label { get; init; } = "";
    public double Min { get; init; }
    public double Max { get; init; }
    public double Step { get; init; } = 1;
    public string Unit { get; init; } = "";
    public double CarValue { get; set; }
    public double StagedValue { get; set; }
}

public sealed class RadioLogEntry
{
    public string Message { get; init; } = "";
    public string Detail { get; init; } = "";
    public int Lap { get; init; }
    public string Status { get; init; } = "SENT";
}
