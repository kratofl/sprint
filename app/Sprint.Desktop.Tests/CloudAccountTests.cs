using System.Net;
using System.Net.Http;
using System.Text;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Signing the desktop in to a Sprint server. The server's rules are tested in Sprint.Api.Tests;
/// what matters here is what the desktop remembers, and that a failed attempt leaves it signed out.
/// </summary>
public sealed class CloudAccountTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "sprint-cloud-account-" + Guid.NewGuid().ToString("N"));

    public CloudAccountTests() => Directory.CreateDirectory(this._root);

    public void Dispose() => Directory.Delete(this._root, recursive: true);

    [Fact]
    public async Task ASignedInAccountIsStillSignedInAfterARestart()
    {
        CloudAccount account = this.Account(FakeServer.Accepting("ada@sprint.gg", "Ada"));

        CloudSignInResult result = await account.SignInAsync("http://localhost:8080", "ada@sprint.gg", "pw");

        Assert.True(result.Ok);
        CloudAccountState restarted = this.Account(FakeServer.Accepting("ada@sprint.gg", "Ada")).State;
        Assert.Equal(new CloudAccountState(true, "http://localhost:8080", "ada@sprint.gg", "Ada"), restarted);
    }

    [Fact]
    public async Task CreatingAnAccountSignsTheDesktopInToIt()
    {
        CloudAccount account = this.Account(new FakeServer(body => body.Contains("register(", StringComparison.Ordinal)
            ? """{"data":{"register":{"token":"tok"}}}"""
            : body.Contains("me{", StringComparison.Ordinal)
                ? """{"data":{"me":{"id":"u1","email":"new@sprint.gg","displayName":"","createdAt":"2026-01-01T00:00:00Z"}}}"""
                : """{"errors":[{"message":"login was not expected"}]}"""));

        CloudSignInResult result = await account.SignInAsync("http://localhost:8080", "new@sprint.gg", "pw123456", createAccount: true);

        Assert.True(result.Ok);
        Assert.Equal(new CloudAccountState(true, "http://localhost:8080", "new@sprint.gg", ""), account.State);
    }

    [Fact]
    public async Task AWrongPasswordLeavesTheDesktopSignedOutAndSaysWhy()
    {
        CloudAccount account = this.Account(FakeServer.Rejecting("Invalid credentials."));

        CloudSignInResult result = await account.SignInAsync("http://localhost:8080", "ada@sprint.gg", "wrong");

        Assert.Equal(CloudSignInResult.Failed("Invalid credentials."), result);
        Assert.False(account.State.SignedIn);
    }

    [Fact]
    public async Task SigningOutForgetsTheAccountButRemembersTheServer()
    {
        CloudAccount account = this.Account(FakeServer.Accepting("ada@sprint.gg", "Ada"));
        await account.SignInAsync("http://localhost:8080", "ada@sprint.gg", "pw");

        account.SignOut();

        CloudAccountState restarted = this.Account(FakeServer.Accepting("ada@sprint.gg", "Ada")).State;
        Assert.Equal(new CloudAccountState(false, "http://localhost:8080", "", ""), restarted);
    }

    [Theory]
    [InlineData("")]
    [InlineData("localhost:8080")]
    [InlineData("ftp://sprint.example")]
    public async Task AServerAddressThatIsNotAWebAddressIsRefusedBeforeAnyRequest(string serverUrl)
    {
        CloudAccount account = this.Account(new FakeServer(_ => throw new InvalidOperationException("no request expected")));

        CloudSignInResult result = await account.SignInAsync(serverUrl, "ada@sprint.gg", "pw");

        Assert.False(result.Ok);
        Assert.Contains("http", result.Error, StringComparison.Ordinal);
    }

    private CloudAccount Account(HttpMessageHandler server) => new(new CloudSession(this._root), server);

    /// <summary>Answers the login and me operations the way the Sprint API does.</summary>
    private sealed class FakeServer(Func<string, string> respond) : HttpMessageHandler
    {
        public static FakeServer Accepting(string email, string displayName) => new(body => body.Contains("login(", StringComparison.Ordinal)
            ? """{"data":{"login":{"token":"tok"}}}"""
            : """{"data":{"me":{"id":"u1","email":""" + Quote(email) + ""","displayName":""" + Quote(displayName) + ""","createdAt":"2026-01-01T00:00:00Z"}}}""");

        public static FakeServer Rejecting(string message) =>
            new(_ => """{"errors":[{"message":""" + Quote(message) + "}]}");

        private static string Quote(string text) => System.Text.Json.JsonSerializer.Serialize(text);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(respond(body), Encoding.UTF8, "application/json"),
            };
        }
    }
}
