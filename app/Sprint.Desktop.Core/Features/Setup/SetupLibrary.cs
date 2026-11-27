using System.Security.Cryptography;
using System.Text;
using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Games;

namespace Sprint.Desktop.Features.Setup;

/// <summary>One setup the game stores, as the Setups list shows it.</summary>
/// <param name="Id">Sprint's key for the file: stable while the file stays where it is.</param>
/// <param name="Track">The folder the game files it under; <paramref name="TrackName"/> is how the driver says it.</param>
/// <param name="SavedAt">When the game last wrote the file.</param>
/// <param name="Versions">How many different contents Sprint has seen the file hold, at least one.</param>
/// <param name="CircuitId">The circuit the track folder belongs to ("silverstone" for Silverstone and Silverstone National alike); the Setups page groups by it.</param>
/// <param name="CircuitName">The circuit's name, or the track's own name when the catalog does not know it.</param>
/// <param name="Layout">The layout within its circuit ("National"), or the track's own name when the catalog does not know it.</param>
/// <param name="Session">The session it is for: the driver's tag, else what a Bealien name says; null when neither says.</param>
/// <param name="TaggedByDriver">Whether <paramref name="Session"/> and <paramref name="Style"/> are the driver's tag rather than the name's.</param>
/// <param name="Country">Where the track is (ISO 3166-1 alpha-2, "BE"), or null for a track the catalog does not know.</param>
public sealed record SetupListItem(
    string Id,
    string Name,
    string Track,
    string TrackName,
    string CircuitId,
    string CircuitName,
    string Layout,
    string Car,
    string? CarClass,
    string? Season,
    DateTimeOffset SavedAt,
    int Versions,
    SetupSession? Session,
    SetupStyle? Style,
    string? Version,
    bool TaggedByDriver,
    string? Country)
{
    /// <summary>
    /// The class as racing tags it ("HYP", "LMGT3", "LMP2 ELMS"), for the class colour. The season
    /// the file was saved for ("ELMS 2025") says which LMP2 it is: the ELMS and WEC cars are both
    /// the Oreca 07.
    /// </summary>
    public string ClassTag => CarNames.Tag(this.CarClass, CarNames.Name(this.CarClass, this.Season, this.Car));

    /// <summary>The car's make ("Porsche"), for its logo.</summary>
    public string? Make => CarNames.MakeOf(this.Car);

    /// <summary>
    /// The car as laps are filed under it ("LMP2 ELMS", "Hypercar BMW", <see cref="CarNames.Name"/>),
    /// so a session's setups can be told apart; the game's own car name when its class or make is unknown.
    /// </summary>
    public string CarName => CarNames.Name(this.CarClass, this.Season, this.Car) ?? this.Car;
}

/// <summary>One version of a setup: what the file held from <paramref name="SavedAt"/> on.</summary>
/// <param name="IsCurrent">Whether the file holds this version now.</param>
public sealed record SetupVersion(string Id, DateTimeOffset SavedAt, bool IsCurrent);

/// <summary>One version of a setup with every value the driver sets, and the setup's other versions.</summary>
public sealed record SetupSheet(SetupListItem Setup, string VersionId, IReadOnlyList<GameSetupReading> Readings, IReadOnlyList<SetupVersion> Versions);

/// <summary>
/// The setups the game stores, for the Setups pages. Each call looks at the game's folder
/// again, reads only the files that changed since the last look, and keeps every new content
/// as a version (<see cref="SetupCaptureService"/>), so a setup the game overwrote can still be
/// read as it was. Read-only towards the game: versions live in Sprint's own store.
/// </summary>
public sealed class SetupLibrary
{
    private readonly IGameProvider _provider;
    private readonly ISetupSnapshotStore _store;
    private readonly SetupCaptureService _capture;
    private readonly SetupTags? _tags;
    private readonly ILog _log;
    private readonly Lock _gate = new();

    /// <summary>The file each id names, with the version it holds now, from the last look.</summary>
    private readonly Dictionary<string, (GameSetupInfo Info, SetupSnapshot Current)> _files = new(StringComparer.Ordinal);

    /// <summary>Every stored version, by the file it came from. Loaded on the first look.</summary>
    private Dictionary<string, List<SetupSnapshot>>? _versions;

    /// <param name="tags">The driver's own tags on setups; without it, only the names say anything.</param>
    public SetupLibrary(IGameProvider provider, ISetupSnapshotStore store, ILog? log = null, SetupTags? tags = null)
    {
        this._provider = provider ?? throw new ArgumentNullException(nameof(provider));
        this._store = store ?? throw new ArgumentNullException(nameof(store));
        this._tags = tags;
        this._log = log ?? NullLog.Instance;
        this._capture = new SetupCaptureService(store, log: this._log);
    }

    /// <summary>Whether the game stores setups Sprint can read at all.</summary>
    public bool Available => this._provider.Setups is not null;

    /// <summary>The folder Sprint reads setups from, or null when the game stores none.</summary>
    public string? Folder => this._provider.Setups?.WatchRoot;

    /// <summary>Every setup the game stores now, newest first.</summary>
    public IReadOnlyList<SetupListItem> List()
    {
        lock (this._gate)
        {
            if (this._provider.Setups is not { } repository)
            {
                return [];
            }

            this.Refresh(repository);
            return
            [
                .. this._files
                    .Select(entry => this.Item(repository, entry.Key, entry.Value.Info, entry.Value.Current))
                    .OrderByDescending(item => item.SavedAt)
            ];
        }
    }

    /// <summary>
    /// Tags a setup with the session and style the driver says it is for; a null tag takes the
    /// driver's tag off. False, with the reason, when there is no such setup, nowhere to keep tags
    /// or the tags could not be saved.
    /// </summary>
    public bool Tag(string id, SetupTag? tag, out string error)
    {
        lock (this._gate)
        {
            error = "";
            if (this._tags is null)
            {
                error = "setup tags are not kept here";
                return false;
            }

            if (this._provider.Setups is { } repository)
            {
                this.Refresh(repository);
            }

            if (!this._files.ContainsKey(id))
            {
                error = "setup not found";
                return false;
            }

            if (!this._tags.Set(id, tag))
            {
                error = "the setup tags could not be saved";
                return false;
            }

            return true;
        }
    }

    /// <summary>
    /// One setup's values: the version the file holds now, or <paramref name="versionId"/>.
    /// Null when there is no such setup or version.
    /// </summary>
    public SetupSheet? Sheet(string id, string? versionId = null)
    {
        lock (this._gate)
        {
            if (this._provider.Setups is not { } repository)
            {
                return null;
            }

            this.Refresh(repository);
            if (!this._files.TryGetValue(id, out (GameSetupInfo Info, SetupSnapshot Current) file))
            {
                return null;
            }

            List<SetupSnapshot> versions = this.VersionsOf(file.Info.Id);
            SetupSnapshot? shown = versionId is null
                ? file.Current
                : versions.FirstOrDefault(version => string.Equals(version.Id, versionId, StringComparison.Ordinal));
            if (shown is null)
            {
                return null;
            }

            return new SetupSheet(
                this.Item(repository, id, file.Info, file.Current),
                shown.Id,
                [.. shown.Values.Select(value => repository.Describe(new GameSetupValue(value.Section, value.Key, value.RawValue))).OfType<GameSetupReading>()],
                [.. versions.Select(version => new SetupVersion(version.Id, version.SourceLastWriteUtc, version.Id == file.Current.Id))]);
        }
    }

    /// <summary>
    /// The version of setup <paramref name="id"/> a run that started at <paramref name="at"/>
    /// was driven with: the newest one the file held by then, since the game reads the file when
    /// the car leaves the garage. A run older than every version Sprint kept gets the oldest.
    /// Null when there is no such setup.
    /// </summary>
    public RunSetup? VersionAt(string id, DateTimeOffset at)
    {
        lock (this._gate)
        {
            if (this._provider.Setups is not { } repository)
            {
                return null;
            }

            this.Refresh(repository);
            if (!this._files.TryGetValue(id, out (GameSetupInfo Info, SetupSnapshot Current) file))
            {
                return null;
            }

            List<SetupSnapshot> versions = this.VersionsOf(file.Info.Id);
            SetupSnapshot version = versions.FirstOrDefault(candidate => candidate.SourceLastWriteUtc <= at)
                ?? versions.LastOrDefault()
                ?? file.Current;
            return new RunSetup(version.Id, file.Info.Name, id);
        }
    }

    /// <summary>
    /// Looks at the game's folder now, keeping any setup saved since the last look as a version.
    /// Called when the car leaves the garage, so the version driven is kept even if the game
    /// overwrites the file before anyone opens the Setups page.
    /// </summary>
    public void Look()
    {
        lock (this._gate)
        {
            if (this._provider.Setups is { } repository)
            {
                this.Refresh(repository);
            }
        }
    }

    /// <summary>
    /// Looks at the game's folder again. A file whose timestamp has not moved is not read; a
    /// changed one is, and a content Sprint has not seen becomes a new version.
    /// </summary>
    private void Refresh(ISetupRepository repository)
    {
        this._versions ??= this._store.LoadAll()
            .GroupBy(snapshot => snapshot.SourceId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        HashSet<string> listed = new(StringComparer.Ordinal);
        foreach (GameSetupInfo info in repository.ListSetups())
        {
            string id = IdOf(info.Id);
            listed.Add(id);
            if (this._files.TryGetValue(id, out (GameSetupInfo Info, SetupSnapshot Current) known) && known.Info.LastWriteUtc == info.LastWriteUtc)
            {
                continue;
            }

            if (repository.Read(info) is not { } read)
            {
                // The game may be writing it right now; the next look tries again.
                this._log.Warn($"Skipping setup '{info.Id}': it could not be read");
                continue;
            }

            SetupSnapshot current = this._capture.Map(this._provider.Descriptor.Id, read);
            List<SetupSnapshot> versions = this.VersionsOf(info.Id);
            if (versions.FirstOrDefault(version => version.Id == current.Id) is { } stored)
            {
                current = stored;
            }
            else
            {
                this._store.Save(current);
                versions.Add(current);
            }

            this._files[id] = (info, current);
        }

        foreach (string gone in this._files.Keys.Where(id => !listed.Contains(id)).ToList())
        {
            this._files.Remove(gone);
        }
    }

    /// <summary>The versions stored for a file, newest first; the list is the one kept, so adding to it keeps the version.</summary>
    private List<SetupSnapshot> VersionsOf(string sourceId)
    {
        Dictionary<string, List<SetupSnapshot>> versions = this._versions ??= new(StringComparer.OrdinalIgnoreCase);
        if (!versions.TryGetValue(sourceId, out List<SetupSnapshot>? list))
        {
            list = [];
            versions[sourceId] = list;
        }

        list.Sort((a, b) => b.SourceLastWriteUtc.CompareTo(a.SourceLastWriteUtc));
        return list;
    }

    private SetupListItem Item(ISetupRepository repository, string id, GameSetupInfo info, SetupSnapshot current)
    {
        GameSetupVehicle vehicle = current.VehicleDescriptor is { Length: > 0 } descriptor
            ? repository.DescribeVehicle(descriptor)
            : new GameSetupVehicle("Unknown car", null, null);
        SetupNameParts name = SetupNaming.Read(info.Name);
        SetupTag? tag = this._tags?.For(id);
        string track = info.Track ?? "";
        string trackName = track.Length > 0 ? repository.TrackName(track) : "No track";
        string game = this._provider.Descriptor.Id;
        return new SetupListItem(
            id,
            info.Name,
            track,
            trackName,
            GameTrackCatalog.CircuitId(game, trackName),
            GameTrackCatalog.CircuitName(game, trackName),
            GameTrackCatalog.LayoutLabel(game, trackName),
            vehicle.Car,
            vehicle.Class,
            vehicle.Season,
            info.LastWriteUtc,
            Math.Max(1, this.VersionsOf(info.Id).Count),
            tag is null ? name.Session : tag.Session,
            tag is null ? name.Style : tag.Style,
            name.Version,
            tag is not null,
            track.Length > 0 ? GameTrackCatalog.Country(game, trackName) : null);
    }

    /// <summary>
    /// Sprint's key for a setup file: a digest of where it is, so the renderer never handles
    /// a path and the key survives a restart.
    /// </summary>
    private static string IdOf(string sourceId)
    {
        byte[] digest = SHA256.HashData(Encoding.UTF8.GetBytes(sourceId.ToUpperInvariant()));
        return "file-" + Convert.ToHexStringLower(digest.AsSpan(0, 10));
    }
}
