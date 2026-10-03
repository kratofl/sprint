using System.Security.Cryptography;
using System.Text;
using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Setup;

/// <summary>
/// Captures the setups a game stores, one version per change (#188).
/// <para>
/// A pass reads every setup the provider's setup capability lists and writes the ones it has
/// not seen before. Identity is the setup's content, so two saves of an unchanged setup cost
/// one snapshot and a real edit costs a second — a driver who saves out of habit does not
/// bury the versions that differ.
/// </para>
/// <para>
/// Capture is a pass, not a watcher: the host decides when to run one (at startup, and when a
/// watcher over <see cref="ISetupRepository.WatchRoot"/> fires). That keeps the rule under
/// test without a filesystem event, and keeps a watcher's lifetime out of this service.
/// </para>
/// </summary>
public sealed class SetupCaptureService
{
    private readonly ISetupSnapshotStore _store;
    private readonly Func<DateTimeOffset> _clock;
    private readonly ILog _log;

    public SetupCaptureService(
        ISetupSnapshotStore store,
        Func<DateTimeOffset>? clock = null,
        ILog? log = null)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _log = log ?? NullLog.Instance;
    }

    /// <summary>
    /// Captures every setup version <paramref name="provider"/> now stores and Sprint has not
    /// seen, and returns those new versions. Empty when nothing changed, and empty for a game
    /// that stores no setups at all — the capability being null is the game saying so.
    /// </summary>
    public IReadOnlyList<SetupSnapshot> Capture(IGameProvider provider)
    {
        ArgumentNullException.ThrowIfNull(provider);

        if (provider.Setups is not { } repository)
        {
            return [];
        }

        // One read of the vault per pass, not per setup: ids are content-addressed, so the ids
        // already stored are the whole deduplication state.
        var known = new HashSet<string>(
            _store.LoadAll().Select(snapshot => snapshot.Id),
            StringComparer.Ordinal);
        var captured = new List<SetupSnapshot>();

        foreach (var info in repository.ListSetups())
        {
            if (repository.Read(info) is not { } read)
            {
                // A setup being written as the pass runs, or one the game wrote in a shape this
                // repository cannot read, must not cost the driver the rest of the folder.
                _log.Warn($"Skipping setup '{info.Id}': it could not be read");
                continue;
            }

            var snapshot = Map(provider.Descriptor.Id, read);
            if (!known.Add(snapshot.Id))
            {
                continue;
            }

            _store.Save(snapshot);
            captured.Add(snapshot);
        }

        return captured;
    }

    /// <summary>
    /// Promotes a captured version into the vault and returns it, or null when no such version
    /// is stored. Only a user action reaches here: capture never promotes, so the vault stays
    /// the set of setups the driver chose to keep rather than a log of everything saved.
    /// </summary>
    public SetupSnapshot? Promote(string snapshotId)
    {
        if (string.IsNullOrEmpty(snapshotId))
        {
            return null;
        }

        var snapshot = _store.LoadAll()
            .FirstOrDefault(stored => string.Equals(stored.Id, snapshotId, StringComparison.Ordinal));
        if (snapshot is null)
        {
            return null;
        }

        // Promoting twice keeps the first answer: the vault entry's age is when the driver
        // decided to keep it, and a second click is not a second decision.
        snapshot.PromotedAt ??= _clock();
        _store.Save(snapshot);
        return snapshot;
    }

    private SetupSnapshot Map(string game, GameSetupSnapshot read) => new()
    {
        Id = ContentId(game, read),
        Game = game,
        SourceId = read.Info.Id,
        Name = read.Info.Name,
        Track = read.Info.Track,
        VehicleDescriptor = read.VehicleDescriptor,
        CapturedAt = _clock(),
        SourceLastWriteUtc = read.Info.LastWriteUtc,
        Values =
        [
            .. read.Values.Select(value => new SetupSnapshotValue
            {
                Section = value.Section,
                Key = value.Key,
                RawValue = value.RawValue,
            })
        ],
    };

    /// <summary>
    /// The id a setup version is stored under: a digest of what it is and what it says.
    /// <para>
    /// The name and track are part of it because a setup copied to a second track is a
    /// different setup to the driver even when the values match, while the file's path and
    /// timestamp are not: a save that changed nothing, a moved folder or a restored backup
    /// must not read as a new version. The digest is over the file's own sections, keys and
    /// raw values, so it moves when — and only when — the setup does.
    /// </para>
    /// </summary>
    private static string ContentId(string game, GameSetupSnapshot read)
    {
        var content = new StringBuilder()
            .Append(game).Append('\n')
            .Append(read.Info.Name).Append('\n')
            .Append(read.Info.Track).Append('\n')
            .Append(read.VehicleDescriptor).Append('\n');

        foreach (var value in read.Values)
        {
            content.Append(value.Section).Append('\0')
                .Append(value.Key).Append('\0')
                .Append(value.RawValue).Append('\n');
        }

        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(content.ToString()));
        return "setup-" + Convert.ToHexStringLower(digest.AsSpan(0, 12));
    }
}
