using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Sprint.Api.Auth;

/// <summary>
/// Short-lived, single-use random tokens that each stand for a value, held in memory. Used for
/// the OAuth <c>state</c> of a sign-in in progress and for the sign-in tickets it ends with.
/// In memory on purpose: both live for seconds to minutes, and a restart only means "sign in again".
/// </summary>
public sealed class OneTimeTokens<T>(TimeSpan ttl, TimeProvider time) where T : notnull
{
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    /// <summary>Mints a token for <paramref name="value"/>.</summary>
    public string Issue(T value)
    {
        this.Sweep();
        string token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        this._entries[token] = new Entry(value, time.GetUtcNow().Add(ttl));
        return token;
    }

    /// <summary>The token's value, once: a second redeem, an unknown or an expired token all give null.</summary>
    public T? Redeem(string? token)
    {
        if (string.IsNullOrEmpty(token) || !this._entries.TryRemove(token, out Entry? entry))
            return default;
        return entry.ExpiresAt > time.GetUtcNow() ? entry.Value : default;
    }

    private void Sweep()
    {
        DateTimeOffset now = time.GetUtcNow();
        foreach (KeyValuePair<string, Entry> pair in this._entries)
        {
            if (pair.Value.ExpiresAt <= now)
                this._entries.TryRemove(pair.Key, out _);
        }
    }

    private sealed record Entry(T Value, DateTimeOffset ExpiresAt);
}
