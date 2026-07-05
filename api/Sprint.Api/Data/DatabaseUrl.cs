using Npgsql;

namespace Sprint.Api.Data;

/// <summary>
/// Converts a libpq-style <c>DATABASE_URL</c> (e.g.
/// <c>postgres://user:pass@host:5432/db?sslmode=disable</c>) into the keyword
/// connection string Npgsql expects. A value that is already a keyword string
/// (contains <c>=</c>) is passed through unchanged.
/// </summary>
public static class DatabaseUrl
{
    public static string ToNpgsql(string databaseUrl)
    {
        if (string.IsNullOrWhiteSpace(databaseUrl))
            throw new ArgumentException("DATABASE_URL is not set.", nameof(databaseUrl));

        // Already a keyword connection string.
        if (databaseUrl.Contains('=') && !databaseUrl.Contains("://"))
            return databaseUrl;

        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null
        };

        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            if (kv.Length != 2) continue;
            if (kv[0].Equals("sslmode", StringComparison.OrdinalIgnoreCase))
                builder.SslMode = ParseSslMode(kv[1]);
        }

        return builder.ConnectionString;
    }

    private static SslMode ParseSslMode(string value) => value.ToLowerInvariant() switch
    {
        "disable" => SslMode.Disable,
        "allow" => SslMode.Allow,
        "prefer" => SslMode.Prefer,
        "require" => SslMode.Require,
        "verify-ca" => SslMode.VerifyCA,
        "verify-full" => SslMode.VerifyFull,
        _ => SslMode.Prefer
    };
}
