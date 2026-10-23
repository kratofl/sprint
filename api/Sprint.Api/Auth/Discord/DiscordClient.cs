using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Api.Auth.Discord;

/// <summary>The Discord application credentials. Discord sign-in is on iff both are set.</summary>
public sealed record DiscordOptions(string ClientId, string ClientSecret)
{
    public static readonly DiscordOptions Disabled = new("", "");

    public bool Enabled => this.ClientId.Length > 0 && this.ClientSecret.Length > 0;

    public static DiscordOptions FromConfig(IConfiguration config) =>
        new((config["DISCORD_CLIENT_ID"] ?? "").Trim(), (config["DISCORD_CLIENT_SECRET"] ?? "").Trim());
}

/// <summary>Who Discord says signed in. Only the <c>identify</c> scope is asked for, so there is no email.</summary>
public sealed record DiscordIdentity(string Id, string Username, string? GlobalName, string? AvatarHash)
{
    public string DisplayName => string.IsNullOrWhiteSpace(this.GlobalName) ? this.Username : this.GlobalName;

    public string? AvatarUrl => string.IsNullOrEmpty(this.AvatarHash)
        ? null
        : $"https://cdn.discordapp.com/avatars/{Uri.EscapeDataString(this.Id)}/{Uri.EscapeDataString(this.AvatarHash)}.png";
}

/// <summary>The two Discord calls of the OAuth code flow. The seam tests fake.</summary>
public interface IDiscordClient
{
    /// <summary>Exchanges an authorization code for the signed-in Discord user. Throws <see cref="DiscordException"/> on any failure.</summary>
    Task<DiscordIdentity> IdentifyAsync(string code, string redirectUri, CancellationToken ct);
}

/// <summary>A Discord call failed. The message is safe to show the user.</summary>
public sealed class DiscordException(string message) : Exception(message);

/// <summary>Discord's OAuth2 token endpoint and <c>/users/@me</c>, over an HttpClient from the factory per call.</summary>
public sealed class DiscordHttpClient(IHttpClientFactory httpFactory, DiscordOptions options) : IDiscordClient
{
    public const string AuthorizeUrl = "https://discord.com/oauth2/authorize";
    private const string TokenUrl = "https://discord.com/api/oauth2/token";
    private const string MeUrl = "https://discord.com/api/users/@me";

    public async Task<DiscordIdentity> IdentifyAsync(string code, string redirectUri, CancellationToken ct)
    {
        using FormUrlEncodedContent form = new(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["client_id"] = options.ClientId,
            ["client_secret"] = options.ClientSecret,
        });
        TokenResponse token = await this.SendAsync<TokenResponse>(new HttpRequestMessage(HttpMethod.Post, TokenUrl) { Content = form }, ct);
        if (string.IsNullOrEmpty(token.AccessToken))
            throw new DiscordException("Discord did not return an access token.");

        HttpRequestMessage me = new(HttpMethod.Get, MeUrl);
        me.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        MeResponse user = await this.SendAsync<MeResponse>(me, ct);
        if (string.IsNullOrEmpty(user.Id) || string.IsNullOrEmpty(user.Username))
            throw new DiscordException("Discord did not say who signed in.");

        return new DiscordIdentity(user.Id, user.Username, user.GlobalName, user.Avatar);
    }

    private async Task<T> SendAsync<T>(HttpRequestMessage request, CancellationToken ct)
    {
        using HttpRequestMessage owned = request;
        try
        {
            HttpClient http = httpFactory.CreateClient(nameof(DiscordHttpClient));
            using HttpResponseMessage response = await http.SendAsync(owned, ct);
            if (!response.IsSuccessStatusCode)
                throw new DiscordException($"Discord refused the sign-in ({(int)response.StatusCode}).");
            return await response.Content.ReadFromJsonAsync<T>(ct)
                ?? throw new DiscordException("Discord sent an empty answer.");
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new DiscordException("Discord could not be reached. Try again.");
        }
    }

    private sealed record TokenResponse([property: JsonPropertyName("access_token")] string? AccessToken);

    private sealed record MeResponse(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("username")] string? Username,
        [property: JsonPropertyName("global_name")] string? GlobalName,
        [property: JsonPropertyName("avatar")] string? Avatar);
}
