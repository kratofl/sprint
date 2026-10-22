namespace Sprint.Api;

/// <summary>
/// The public base URLs the API builds links with: <c>SPRINT_PUBLIC_API_URL</c> (the Discord
/// redirect URI) and <c>SPRINT_PUBLIC_WEB_URL</c> (invite links, the web's post-sign-in page).
/// Either may be unset in local development.
/// </summary>
public sealed record PublicUrls(Uri? Api, Uri? Web)
{
    public static PublicUrls FromConfig(IConfiguration config) =>
        new(Parse(config["SPRINT_PUBLIC_API_URL"]), Parse(config["SPRINT_PUBLIC_WEB_URL"]));

    /// <summary>An absolute web URL for <paramref name="path"/> (which starts with <c>/</c>), or the path alone when the web URL is unset.</summary>
    public string WebLink(string path) => this.Web is null ? path : this.Web.ToString().TrimEnd('/') + path;

    private static Uri? Parse(string? value) =>
        Uri.TryCreate(value?.Trim(), UriKind.Absolute, out Uri? uri) && uri.Scheme is "http" or "https" ? uri : null;
}
