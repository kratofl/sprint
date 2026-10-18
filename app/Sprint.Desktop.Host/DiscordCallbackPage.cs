using System.Net;

namespace Sprint.Desktop.Host;

/// <summary>
/// The page the system browser shows when Discord sign-in comes back to this host: it only tells
/// the driver to return to Sprint, where the result is shown. Self-contained (no assets, system
/// colours) because it is served from the loopback host, outside the app.
/// </summary>
public static class DiscordCallbackPage
{
    /// <summary>The loopback route, outside <c>/api</c> because it is the one route without the bearer token.</summary>
    public const string Path = "/auth/discord/callback";

    /// <param name="taken">Whether the answer belonged to the sign-in in flight.</param>
    /// <param name="error">The server's error, when it refused the sign-in.</param>
    public static string Render(bool taken, string? error)
    {
        (string title, string message) = (taken, error) switch
        {
            (false, _) => ("This sign-in link is no longer valid", "It was already used, cancelled or timed out. Return to Sprint and try again."),
            (true, { Length: > 0 }) => ("Sign-in didn’t work", error),
            // Sprint redeems the ticket after this page is served, so it cannot say "signed in" yet.
            _ => ("Return to Sprint", "Sprint is finishing your sign-in. You can close this tab."),
        };

        return $$"""
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light dark">
            <title>Sprint</title>
            <style>
              body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 15px/1.5 system-ui, sans-serif; background: Canvas; color: CanvasText; }
              main { max-width: 28rem; padding: 2rem; text-align: center; }
              h1 { font-size: 1.4rem; font-weight: 600; margin: 0 0 .5rem; }
              p { margin: 0; opacity: .75; }
            </style>
            </head>
            <body><main><h1>{{WebUtility.HtmlEncode(title)}}</h1><p>{{WebUtility.HtmlEncode(message)}}</p></main></body>
            </html>
            """;
    }
}
