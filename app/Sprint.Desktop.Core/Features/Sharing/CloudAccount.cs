using System.Net.Http;
using Sprint.Contracts;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>What the desktop shows about its Sprint account. <c>ServerUrl</c> survives sign-out to prefill the next sign-in.</summary>
public sealed record CloudAccountState(bool SignedIn, string ServerUrl, string Email, string DisplayName);

/// <summary>The outcome of a sign-in attempt: success, or the message to show the driver.</summary>
public sealed record CloudSignInResult(bool Ok, string Error)
{
    public static CloudSignInResult Success { get; } = new(true, "");

    public static CloudSignInResult Failed(string error) => new(false, error);
}

/// <summary>
/// Signs the desktop in to a Sprint server and remembers it in <see cref="CloudSession"/>.
/// The server is chosen per sign-in (Sprint is self-hosted), so each attempt gets a client for
/// that address over the one shared <paramref name="transport"/>.
/// </summary>
public sealed class CloudAccount(CloudSession session, HttpMessageHandler transport)
{
    public CloudAccountState State => session.IsSignedIn
        ? new CloudAccountState(true, session.State.ServerUrl, session.State.Email, session.State.DisplayName)
        : new CloudAccountState(false, session.State.ServerUrl, "", "");

    /// <summary>
    /// Logs in — or, with <paramref name="createAccount"/>, registers — then reads the profile so
    /// the account shows the user's display name.
    /// </summary>
    public async Task<CloudSignInResult> SignInAsync(string serverUrl, string email, string password, bool createAccount = false, CancellationToken ct = default)
    {
        if (!Uri.TryCreate(serverUrl.Trim().TrimEnd('/') + "/", UriKind.Absolute, out Uri? server)
            || server.Scheme is not ("http" or "https"))
            return CloudSignInResult.Failed("Enter the server address, starting with https:// or http://.");

        using HttpClient http = new(transport, disposeHandler: false) { BaseAddress = server };
        string? token = null;
        SprintCloudClient client = new(http, () => token);

        CloudResult<AuthResponse> login = createAccount
            ? await client.RegisterAsync(email, password, ct).ConfigureAwait(false)
            : await client.SignInAsync(email, password, ct).ConfigureAwait(false);
        if (!login.Ok || login.Value is null)
            return CloudSignInResult.Failed(login.Message);

        token = login.Value.Token;
        session.SignIn(server.ToString(), token, email);
        CloudResult<UserProfile> me = await client.MeAsync(ct).ConfigureAwait(false);
        if (me.Value is { } profile)
            session.SetDisplayName(profile.DisplayName);
        return CloudSignInResult.Success;
    }

    /// <summary><c>server|email</c>: what the sync ledger is scoped to. Empty when signed out.</summary>
    public string AccountKey => session.IsSignedIn ? $"{session.State.ServerUrl}|{session.State.Email}" : "";

    /// <summary>
    /// Runs <paramref name="call"/> with a client for the signed-in account, or returns
    /// <paramref name="signedOut"/> without calling anything when nobody is signed in.
    /// </summary>
    public async Task<T> WithClientAsync<T>(Func<SprintCloudClient, Task<T>> call, T signedOut)
    {
        if (!session.IsSignedIn)
            return signedOut;
        using HttpClient http = new(transport, disposeHandler: false) { BaseAddress = new Uri(session.State.ServerUrl.TrimEnd('/') + "/") };
        string token = session.State.Token;
        return await call(new SprintCloudClient(http, () => token)).ConfigureAwait(false);
    }

    /// <summary>Forgets the token and profile; the server address stays for the next sign-in.</summary>
    public void SignOut() => session.SignOut();
}
