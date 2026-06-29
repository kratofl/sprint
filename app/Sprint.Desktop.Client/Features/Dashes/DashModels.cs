using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Dashes;

public sealed class DashLayout
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("default")]
    public bool IsDefault { get; set; }

    [JsonPropertyName("gridCols")]
    public int GridCols { get; set; } = 20;

    [JsonPropertyName("gridRows")]
    public int GridRows { get; set; } = 12;

    [JsonPropertyName("pages")]
    public List<DashPage> Pages { get; set; } = [];
}

public sealed class DashPage
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("widgets")]
    public List<DashWidget> Widgets { get; set; } = [];
}

public sealed class DashWidget
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("col")]
    public int Col { get; set; }

    [JsonPropertyName("row")]
    public int Row { get; set; }

    [JsonPropertyName("colSpan")]
    public int ColSpan { get; set; } = 1;

    [JsonPropertyName("rowSpan")]
    public int RowSpan { get; set; } = 1;
}
