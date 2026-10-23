using Sprint.Api.Auth.Discord;

namespace Sprint.Api.Tests;

/// <summary>Discord, faked: hands out whichever identity the test set for a code.</summary>
internal sealed class FakeDiscord : IDiscordClient
{
    public Dictionary<string, DiscordIdentity> Identities { get; } = [];

    public Task<DiscordIdentity> IdentifyAsync(string code, string redirectUri, CancellationToken ct) =>
        this.Identities.TryGetValue(code, out DiscordIdentity? identity)
            ? Task.FromResult(identity)
            : throw new DiscordException("Discord refused the sign-in (400).");
}
