using System.Diagnostics.CodeAnalysis;

namespace Sprint.Api.Auth.Discord;

/// <summary>
/// The browser half of Discord sign-in:
/// <list type="bullet">
/// <item><c>GET /api/auth/discord/start?client=web&amp;next=/path</c></item>
/// <item><c>GET /api/auth/discord/start?client=desktop&amp;redirect=http://127.0.0.1:port/path&amp;state=nonce</c></item>
/// <item><c>GET /api/auth/discord/callback</c> — Discord's redirect URI; ends at the caller with <c>ticket</c> or <c>error</c>.</item>
/// </list>
/// The OAuth state is held on the server and also set as a cookie on <c>/start</c>, and the
/// callback needs both to match: a callback link somebody else started cannot sign this browser
/// in as them. The cookie must therefore be set on the callback's host, so a <c>/start</c> reached
/// some other way (a desktop that found the server on the LAN) first sends the browser on to
/// <c>${SPRINT_PUBLIC_API_URL}</c>.
/// </summary>
public static class DiscordEndpoints
{
    private const string StateCookie = "sprint_discord_state";
    private const string CookiePath = "/api/auth/discord";
    private const int MaxNonceLength = 200;

    /// <summary>Marks a <c>/start</c> already sent on to the public API host, so a proxy that hides the real host cannot loop it.</summary>
    private const string HoppedParam = "hopped";

    public static void MapDiscordEndpoints(this WebApplication app)
    {
        app.MapGet("/api/auth/discord/start", Start);
        app.MapGet("/api/auth/discord/callback", CallbackAsync);
    }

    /// <summary>Who to send the ticket to, from <c>/start</c>'s query; null when the request is not acceptable.</summary>
    public static SignInTarget? TargetFrom(string? client, string? next, string? redirect, string? state, PublicUrls urls) => client switch
    {
        "web" when urls.Web is not null && SignInRedirects.SafeNext(next) is { } safe => new WebSignIn(safe),
        "desktop" when SignInRedirects.TryLoopback(redirect, out Uri? loopback) && IsNonce(state) => new DesktopSignIn(loopback, state),
        _ => null,
    };

    private static IResult Start(HttpContext http, DiscordSignIn signIn, PublicUrls urls, string? client, string? next, string? redirect, string? state)
    {
        if (!signIn.Enabled)
            return Results.Text("Discord sign-in is not set up on this server.", statusCode: StatusCodes.Status404NotFound);
        SignInTarget? target = TargetFrom(client, next, redirect, state, urls);
        if (target is null)
            return Results.Text("This sign-in request is not valid.", statusCode: StatusCodes.Status400BadRequest);

        if (PublicStartUrl(http, urls) is { } publicStart)
            return Results.Redirect(publicStart.AbsoluteUri);

        Uri callback = CallbackUrl(http, urls);
        (string oauthState, Uri authorize) = signIn.Start(target, callback.AbsoluteUri);
        http.Response.Cookies.Append(StateCookie, oauthState, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = callback.Scheme == Uri.UriSchemeHttps,
            Path = CookiePath,
            MaxAge = TimeSpan.FromMinutes(10),
        });
        return Results.Redirect(authorize.AbsoluteUri);
    }

    private static async Task<IResult> CallbackAsync(HttpContext http, DiscordSignIn signIn, PublicUrls urls, string? code, string? state, string? error, CancellationToken ct)
    {
        string? cookie = http.Request.Cookies[StateCookie];
        http.Response.Cookies.Delete(StateCookie, new CookieOptions { Path = CookiePath });
        if (string.IsNullOrEmpty(state) || cookie != state)
            return Results.Text("This sign-in did not start in this browser. Start again from Sprint.", statusCode: StatusCodes.Status400BadRequest);

        Uri? back = await signIn.CompleteAsync(state, code, error, CallbackUrl(http, urls).AbsoluteUri, ct);
        return back is null
            ? Results.Text("This sign-in has expired. Start again from Sprint.", statusCode: StatusCodes.Status400BadRequest)
            : Results.Redirect(back.AbsoluteUri);
    }

    /// <summary>
    /// This same <c>/start</c> on <c>${SPRINT_PUBLIC_API_URL}</c> when the browser came in on another
    /// origin, so the state cookie lands where the callback can read it; null when it is already
    /// there, when no public URL is set, or when it was sent on once already.
    /// </summary>
    public static Uri? PublicStartUrl(HttpContext http, PublicUrls urls)
    {
        if (urls.Api is not { } api || http.Request.Query.ContainsKey(HoppedParam))
            return null;
        string origin = api.GetLeftPart(UriPartial.Authority);
        if (string.Equals(origin, $"{http.Request.Scheme}://{http.Request.Host}", StringComparison.OrdinalIgnoreCase))
            return null;

        string query = http.Request.QueryString.Add(HoppedParam, "1").Value ?? "";
        return new Uri($"{api.ToString().TrimEnd('/')}/api/auth/discord/start{query}");
    }

    /// <summary>
    /// Discord's redirect URI, which must equal one registered with the Discord application:
    /// <c>${SPRINT_PUBLIC_API_URL}/api/auth/discord/callback</c>, or this request's own origin
    /// when that is unset (local development).
    /// </summary>
    private static Uri CallbackUrl(HttpContext http, PublicUrls urls)
    {
        string origin = urls.Api?.ToString().TrimEnd('/') ?? $"{http.Request.Scheme}://{http.Request.Host}{http.Request.PathBase}";
        return new Uri($"{origin}/api/auth/discord/callback");
    }

    private static bool IsNonce([NotNullWhen(true)] string? state) =>
        state is { Length: > 0 and <= MaxNonceLength } && state.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.' or '~');
}
