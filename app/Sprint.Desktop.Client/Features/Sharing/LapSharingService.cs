using Avalonia.Controls;
using Avalonia.Platform.Storage;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>A lap read from a file and waiting for the driver to accept it, or the reason it could not be.</summary>
public sealed record SharedLapOffer(SharedLap? Lap, string Message)
{
    public static SharedLapOffer Cancelled { get; } = new(null, "");
}

/// <summary>
/// The file half of sharing (#198): put a lap somewhere the driver picks, and read one back.
/// <para>
/// The picker lives here rather than in the page so the page stays a layout, and so the cloud
/// path (#197) can reuse <see cref="Accept"/> — a fetched lap and an imported file take the
/// same route into the corpus.
/// </para>
/// </summary>
public sealed class LapSharingService
{
    private static readonly FilePickerFileType LapFileType = new("Sprint lap")
    {
        Patterns = ["*" + SharedLapFile.Extension],
    };

    private readonly LapCorpusBrowser _browser;
    private readonly SharedLapImporter _importer;
    private readonly Func<string?> _driverName;
    private readonly Func<DateTimeOffset> _clock;

    public LapSharingService(
        LapCorpusBrowser browser,
        SharedLapImporter importer,
        Func<string?> driverName,
        Func<DateTimeOffset>? clock = null)
    {
        _browser = browser ?? throw new ArgumentNullException(nameof(browser));
        _importer = importer ?? throw new ArgumentNullException(nameof(importer));
        _driverName = driverName ?? throw new ArgumentNullException(nameof(driverName));
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    /// <summary>Turns one of the driver's own laps into a shareable artifact.</summary>
    public SharedLap? Package(CorpusLap lap)
    {
        ArgumentNullException.ThrowIfNull(lap);

        var trace = _browser.Trace(lap);
        if (trace is null)
        {
            return null;
        }

        return new SharedLap(
            new LapProvenance
            {
                SourceKind = SharedLapSources.File,
                SharedBy = _driverName(),
                DrivenAt = lap.SessionStartedAt,
                SharedAt = _clock(),
            },
            lap.Context,
            lap.LapNumber,
            lap.LapTimeSeconds,
            trace);
    }

    /// <summary>Writes the lap to a location the driver picks. Returns what to tell them.</summary>
    public async Task<string> ExportAsync(Control anchor, CorpusLap lap)
    {
        ArgumentNullException.ThrowIfNull(anchor);
        ArgumentNullException.ThrowIfNull(lap);

        if (Package(lap) is not { } shared)
        {
            return "That lap has no channels to export.";
        }

        if (TopLevel.GetTopLevel(anchor)?.StorageProvider is not { } storage)
        {
            return "This window cannot open a file dialog.";
        }

        var file = await storage.SaveFilePickerAsync(new FilePickerSaveOptions
        {
            Title = "Export lap",
            SuggestedFileName = SharedLapFile.SuggestedFileName(shared),
            DefaultExtension = SharedLapFile.Extension.TrimStart('.'),
            FileTypeChoices = [LapFileType],
        });

        if (file is null)
        {
            return "";
        }

        await using var stream = await file.OpenWriteAsync();
        SharedLapFile.Write(stream, shared);
        return $"Exported {shared.Context.TrackCourse} lap {shared.LapNumber} to {file.Name}.";
    }

    /// <summary>
    /// Reads a lap file the driver picks. Deliberately does not add it — the caller confirms
    /// first, because import is never silent (spec §2.7).
    /// </summary>
    public async Task<SharedLapOffer> OfferAsync(Control anchor)
    {
        ArgumentNullException.ThrowIfNull(anchor);

        if (TopLevel.GetTopLevel(anchor)?.StorageProvider is not { } storage)
        {
            return new SharedLapOffer(null, "This window cannot open a file dialog.");
        }

        var files = await storage.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Import lap",
            AllowMultiple = false,
            FileTypeFilter = [LapFileType],
        });

        if (files.Count == 0)
        {
            return SharedLapOffer.Cancelled;
        }

        await using var stream = await files[0].OpenReadAsync();
        var result = SharedLapFile.Read(stream);
        return result.Ok
            ? new SharedLapOffer(result.Lap, "")
            : new SharedLapOffer(null, result.Message);
    }

    /// <summary>
    /// Files an offered lap. The single receiving path, shared with the cloud fetch, so a lap
    /// that arrived either way is recorded the same.
    /// </summary>
    public string Accept(SharedLap lap)
    {
        ArgumentNullException.ThrowIfNull(lap);

        var result = _importer.Import(lap);
        return result.Added
            ? $"Added {lap.Attribution}'s {lap.Context.TrackCourse} lap. Pick it to chase it."
            : "You already have that lap.";
    }
}
