using System.Text.Json;
using System.Text.Json.Serialization;

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
    public bool IsTemplate { get; set; }
    public Dictionary<string, double> Values { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }

    public override string ToString() => this.Name;
}
