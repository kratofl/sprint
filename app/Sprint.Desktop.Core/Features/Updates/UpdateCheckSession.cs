namespace Sprint.Desktop.Features.Updates;

/// <summary>
/// Owns the update result for one running app session. Startup and Settings share
/// the same successful check for a version/channel pair; an explicit refresh or a
/// channel change fetches the release feed again.
/// </summary>
public sealed class UpdateCheckSession(
    Func<CancellationToken, Task<IReadOnlyList<ReleaseInfo>>> fetchReleases)
{
    private readonly object _gate = new();
    private Task<UpdateCheckResult>? _cachedCheck;
    private (string CurrentVersion, string Channel)? _cachedKey;
    private int _generation;

    public bool HasCheck(string currentVersion, string channel)
    {
        (string CurrentVersion, string Channel) key = CacheKey(currentVersion, channel);
        lock (this._gate)
        {
            return this._cachedKey == key
                && this._cachedCheck is not null;
        }
    }

    public Task<UpdateCheckResult> CheckAsync(
        string currentVersion,
        string channel,
        bool forceRefresh = false,
        CancellationToken ct = default)
    {
        (string CurrentVersion, string Channel) key = CacheKey(currentVersion, channel);

        lock (this._gate)
        {
            if (!forceRefresh
                && this._cachedKey == key
                && this._cachedCheck is { } cached)
            {
                return cached;
            }

            int generation = ++this._generation;
            Task<UpdateCheckResult> check = this.FetchAndCheckAsync(currentVersion, channel, generation, ct);
            this._cachedKey = key;
            this._cachedCheck = check;
            return check;
        }
    }

    private async Task<UpdateCheckResult> FetchAndCheckAsync(
        string currentVersion,
        string channel,
        int generation,
        CancellationToken ct)
    {
        try
        {
            IReadOnlyList<ReleaseInfo> releases = await fetchReleases(ct).ConfigureAwait(false);
            return UpdateChecker.Check(currentVersion, channel, releases);
        }
        catch
        {
            lock (this._gate)
            {
                if (this._generation == generation)
                {
                    this._cachedKey = null;
                    this._cachedCheck = null;
                }
            }

            throw;
        }
    }

    private static string NormalizeChannel(string? channel) =>
        channel?.Trim().ToLowerInvariant() ?? "";

    private static (string CurrentVersion, string Channel) CacheKey(
        string currentVersion,
        string channel) =>
        (currentVersion.Trim(), NormalizeChannel(channel));
}
