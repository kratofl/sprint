using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>Where a lap that did not come from this machine came from.</summary>
public sealed record LapProvenance
{
    /// <summary>How it arrived: <c>file</c> or <c>cloud</c>.</summary>
    [JsonPropertyName("sourceKind")]
    public string SourceKind { get; init; } = SharedLapSources.File;

    /// <summary>
    /// Who drove it, as a display name. Never an email address: attributing somebody's Spa lap
    /// to <c>luca@…</c> is wrong, which is why the cloud user gained a display name (spec §2.7).
    /// </summary>
    [JsonPropertyName("sharedBy")]
    public string? SharedBy { get; init; }

    /// <summary>The code it was pulled with, when it came from the cloud.</summary>
    [JsonPropertyName("shareCode")]
    public string? ShareCode { get; init; }

    /// <summary>When the lap was actually driven, if the sharer knew.</summary>
    [JsonPropertyName("drivenAt")]
    public DateTimeOffset? DrivenAt { get; init; }

    [JsonPropertyName("sharedAt")]
    public DateTimeOffset SharedAt { get; init; }
}

/// <summary>How a shared lap reached this machine.</summary>
public static class SharedLapSources
{
    public const string File = "file";
    public const string Cloud = "cloud";
}

/// <summary>
/// A lap somebody can hand to somebody else: the channels plus enough provenance to attribute
/// and contextualise them (#197, #198). One shape for both the file on disk and the blob in the
/// cloud, so an exported file and a fetched lap cannot disagree.
/// </summary>
public sealed record SharedLap(
    LapProvenance Provenance,
    LapHistoryContext Context,
    int LapNumber,
    double LapTimeSeconds,
    LapChannelTrace Trace)
{
    /// <summary>
    /// The lap's identity, for refusing a second import of the same one.
    /// <para>
    /// Derived from who drove it, where, and how fast rather than from a generated id: the same
    /// lap can arrive as a file from one friend and by code from another, and those two are the
    /// same lap. A generated id would let the corpus fill with duplicates that all look
    /// distinct.
    /// </para>
    /// </summary>
    public string Fingerprint
    {
        get
        {
            var seed = string.Create(
                CultureInfo.InvariantCulture,
                $"{Provenance.SharedBy}|{Context.Game}|{Context.TrackCourse}|{Context.CarModel}|{LapNumber}|{LapTimeSeconds:F3}");
            return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(seed)))[..16];
        }
    }

    /// <summary>Who to credit on screen when the sharer left no name.</summary>
    public string Attribution => Provenance.SharedBy is { Length: > 0 } name ? name : "Unknown driver";
}
