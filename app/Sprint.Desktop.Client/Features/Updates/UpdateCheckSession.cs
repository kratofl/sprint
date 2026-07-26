namespace Sprint.Desktop.Features.Updates;

/// <summary>
/// Owns the update result for one running app session. Startup and Settings share
/// the same successful check for a version/channel pair; an explicit refresh or a
/// channel change fetches the release feed again.
/// </summary>
internal sealed class UpdateCheckSession(
    Func<CancellationToken, Task<IReadOnlyList<ReleaseInfo>>> fetchReleases)
{
    private readonly object _gate = new();
    private Task<UpdateCheckResult>? _cachedCheck;
    private (string CurrentVersion, string Channel)? _cachedKey;
    private int _generation;

    public bool HasCheck(string currentVersion, string channel)
    {
        var key = CacheKey(currentVersion, channel);
        lock (_gate)
        {
            return _cachedKey == key
                && _cachedCheck is not null;
        }
    }

    public Task<UpdateCheckResult> CheckAsync(
        string currentVersion,
        string channel,
        bool forceRefresh = false,
        CancellationToken ct = default)
    {
        var key = CacheKey(currentVersion, channel);

        lock (_gate)
        {
            if (!forceRefresh
                && _cachedKey == key
                && _cachedCheck is { } cached)
            {
                return cached;
            }

            var generation = ++_generation;
            var check = FetchAndCheckAsync(currentVersion, channel, generation, ct);
            _cachedKey = key;
            _cachedCheck = check;
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
            var releases = await fetchReleases(ct).ConfigureAwait(false);
            return UpdateChecker.Check(currentVersion, channel, releases);
        }
        catch
        {
            lock (_gate)
            {
                if (_generation == generation)
                {
                    _cachedKey = null;
                    _cachedCheck = null;
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
