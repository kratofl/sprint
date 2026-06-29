namespace Sprint.Desktop.Features.Setup;

public sealed class SetupParameter
{
    public string Key { get; init; } = "";
    public string Label { get; init; } = "";
    public double Min { get; init; }
    public double Max { get; init; }
    public double Step { get; init; } = 1;
    public string Unit { get; init; } = "";
    public string Group { get; init; } = "";
}

public sealed class SetupProgram
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public Dictionary<string, double> Values { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}
