using System.Diagnostics.CodeAnalysis;

namespace Sprint.Api.Auth;

/// <summary>Where a sign-in may send the browser back to. Everything here is input from a URL, so it is strict.</summary>
public static class SignInRedirects
{
    private const int MaxLength = 1024;

    /// <summary>
    /// The desktop's redirect: plain http to this machine (127.0.0.1, localhost or [::1]) on any
    /// port. Anything else would hand a sign-in ticket to another host.
    /// </summary>
    public static bool TryLoopback(string? redirect, [NotNullWhen(true)] out Uri? uri)
    {
        uri = null;
        if (string.IsNullOrWhiteSpace(redirect) || redirect.Length > MaxLength)
            return false;
        if (!Uri.TryCreate(redirect, UriKind.Absolute, out Uri? parsed))
            return false;
        bool loopbackHost = parsed.Host is "127.0.0.1" or "localhost" or "[::1]";
        if (parsed.Scheme != Uri.UriSchemeHttp || !loopbackHost || parsed.UserInfo.Length > 0 || parsed.Fragment.Length > 0)
            return false;
        uri = parsed;
        return true;
    }

    /// <summary>
    /// The web's <c>next</c>: a path on the web app itself. Missing means <c>/</c>; anything that a
    /// browser could read as another origin (<c>//host</c>, <c>/\host</c>, a scheme) is null.
    /// </summary>
    public static string? SafeNext(string? next)
    {
        if (string.IsNullOrEmpty(next))
            return "/";
        if (next.Length > MaxLength || next[0] != '/' || next.StartsWith("//", StringComparison.Ordinal))
            return null;
        if (next.Contains('\\') || next.Any(char.IsControl))
            return null;
        return next;
    }

    /// <summary><paramref name="target"/> with the given query parameters appended (escaped).</summary>
    public static Uri WithQuery(Uri target, params (string Name, string Value)[] parameters)
    {
        string query = string.Join('&', parameters.Select(p => $"{Uri.EscapeDataString(p.Name)}={Uri.EscapeDataString(p.Value)}"));
        UriBuilder builder = new(target);
        string existing = builder.Query.TrimStart('?');
        builder.Query = existing.Length == 0 ? query : $"{existing}&{query}";
        return builder.Uri;
    }
}
