using System.Net;
using System.Net.Http;
using System.Text;
using System.Collections.Specialized;
using System.Web;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Signing in with Discord: the browser leg runs outside Sprint, and its answer comes back to the
/// host's loopback callback. What matters is that only the answer to this attempt is taken, once.
/// </summary>
public sealed class DiscordSignInTests : IDisposable
{
    private static readonly Uri Callback = new("http://127.0.0.1:51234/auth/discord/callback");
    private readonly string _root = Path.Combine(Path.GetTempPath(), "sprint-discord-" + Guid.NewGuid().ToString("N"));
    private readonly CloudAccount _account;
    private readonly DiscordSignIn _signIn;

    public DiscordSignInTests()
    {
        Directory.CreateDirectory(this._root);
        this._account = new CloudAccount(new CloudSession(this._root), new RedeemingServer());
        this._signIn = new DiscordSignIn(this._account);
    }

    public void Dispose() => Directory.Delete(this._root, recursive: true);

    [Fact]
    public void TheBrowserIsSentToTheServersDiscordStartWithThisHostAsTheRedirect()
    {
        DiscordSignInStart start = this._signIn.Begin("http://localhost:8080/", Callback);

        Uri url = Assert.IsType<Uri>(start.AuthorizeUrl);
        Assert.Equal("http://localhost:8080/api/auth/discord/start", url.GetLeftPart(UriPartial.Path));
        NameValueCollection query = HttpUtility.ParseQueryString(url.Query);
        Assert.Equal("desktop", query["client"]);
        Assert.Equal(Callback.ToString(), query["redirect"]);
        Assert.Matches("^[A-Za-z0-9_-]{16,200}$", query["state"] ?? "");
    }

    [Fact]
    public async Task TheTicketFromTheCallbackSignsTheDesktopIn()
    {
        string state = StateOf(this._signIn.Begin("http://localhost:8080", Callback));

        Assert.True(this._signIn.Complete(state, "ticket-1", null));
        DiscordSignInResult result = await this._signIn.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(DiscordSignInOutcome.SignedIn, result.Outcome);
        Assert.Equal(new CloudAccountState(true, "http://localhost:8080", "", "Ada"), this._account.State);
    }

    [Fact]
    public async Task ACallbackCarryingAnotherStateIsRefusedAndTheAttemptTimesOut()
    {
        this._signIn.Begin("http://localhost:8080", Callback);

        Assert.False(this._signIn.Complete("forged", "ticket-1", null));
        DiscordSignInResult result = await this._signIn.WaitAsync(TimeSpan.FromMilliseconds(50));

        Assert.Equal(DiscordSignInOutcome.TimedOut, result.Outcome);
        Assert.False(this._account.State.SignedIn);
    }

    [Fact]
    public void TheCallbackIsTakenOnlyOnce()
    {
        string state = StateOf(this._signIn.Begin("http://localhost:8080", Callback));

        Assert.True(this._signIn.Complete(state, "ticket-1", null));
        Assert.False(this._signIn.Complete(state, "ticket-2", null));
    }

    [Fact]
    public async Task AnErrorFromTheServerIsShownAndNothingIsSignedIn()
    {
        string state = StateOf(this._signIn.Begin("http://localhost:8080", Callback));

        this._signIn.Complete(state, null, "Registration is closed on this server.");
        DiscordSignInResult result = await this._signIn.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(new DiscordSignInResult(DiscordSignInOutcome.Failed, "Registration is closed on this server."), result);
        Assert.False(this._account.State.SignedIn);
    }

    [Fact]
    public async Task CancellingEndsTheWaitAndALateCallbackIsRefused()
    {
        string state = StateOf(this._signIn.Begin("http://localhost:8080", Callback));
        Task<DiscordSignInResult> waiting = this._signIn.WaitAsync(TimeSpan.FromMinutes(1));

        this._signIn.Cancel();

        Assert.Equal(DiscordSignInOutcome.Cancelled, (await waiting).Outcome);
        Assert.False(this._signIn.Complete(state, "ticket-1", null));
    }

    [Fact]
    public async Task StartingAgainReplacesTheFirstAttempt()
    {
        string first = StateOf(this._signIn.Begin("http://localhost:8080", Callback));
        Task<DiscordSignInResult> firstWait = this._signIn.WaitAsync(TimeSpan.FromMinutes(1));

        string second = StateOf(this._signIn.Begin("http://localhost:8080", Callback));

        Assert.Equal(DiscordSignInOutcome.Cancelled, (await firstWait).Outcome);
        Assert.False(this._signIn.Complete(first, "ticket-1", null));
        Assert.True(this._signIn.Complete(second, "ticket-2", null));
    }

    [Fact]
    public void AServerAddressThatIsNotAWebAddressIsRefused()
    {
        DiscordSignInStart start = this._signIn.Begin("localhost:8080", Callback);

        Assert.Null(start.AuthorizeUrl);
        Assert.Contains("http", start.Error, StringComparison.Ordinal);
    }

    private static string StateOf(DiscordSignInStart start) =>
        HttpUtility.ParseQueryString(Assert.IsType<Uri>(start.AuthorizeUrl).Query)["state"] ?? "";

    /// <summary>Redeems any ticket and answers <c>me</c> for a Discord account with no email.</summary>
    private sealed class RedeemingServer : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            string json = body.Contains("redeemSignInTicket(", StringComparison.Ordinal)
                ? """{"data":{"redeemSignInTicket":{"token":"tok"}}}"""
                : """{"data":{"me":{"id":"u1","email":"","displayName":"Ada","createdAt":"2026-01-01T00:00:00Z"}}}""";
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
    }
}
