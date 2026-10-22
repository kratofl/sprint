using System.Net.WebSockets;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Sprint.Contracts;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// The live uplink's WebSocket against a real loopback socket: the bearer token rides on the
/// upgrade, messages arrive as the server reads them, and a refusal reaches Settings as words.
/// </summary>
public sealed class WebSocketLiveConnectionTests : IAsyncLifetime
{
    private readonly WebApplication _server;
    private readonly List<string> _received = [];
    private readonly TaskCompletionSource _gotTwo = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public WebSocketLiveConnectionTests()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        this._server = builder.Build();
        this._server.UseWebSockets();
        this._server.Map("/api/live/ingest", this.IngestAsync);
    }

    private Uri Ingest => LiveUplinkRules.IngestUri(this._server.Urls.First());

    public Task InitializeAsync() => this._server.StartAsync();

    public async Task DisposeAsync() => await this._server.DisposeAsync();

    [Fact]
    public async Task MessagesArriveWithTheirTypeAndARefusalIsShownWithItsReason()
    {
        ILiveConnection connection = await WebSocketLiveConnection.ConnectAsync(this.Ingest, "tok", CancellationToken.None);
        await using (connection)
        {
            await connection.SendAsync(new LiveStartMessage { SessionKey = "s1" }, CancellationToken.None);
            await connection.SendAsync(new LiveEndMessage(), CancellationToken.None);
            await this._gotTwo.Task.WaitAsync(TimeSpan.FromSeconds(5));

            Assert.StartsWith("""{"type":"start","sessionKey":"s1",""", this._received[0], StringComparison.Ordinal);
            Assert.Equal("""{"type":"end"}""", this._received[1]);

            // The server has closed with 1008 by now; the next send says why.
            LiveConnectionException refused = await Assert.ThrowsAsync<LiveConnectionException>(async () =>
            {
                for (int attempt = 0; attempt < 50; attempt++)
                {
                    await connection.SendAsync(new LiveEndMessage(), CancellationToken.None);
                    await Task.Delay(20);
                }
            });
            Assert.Contains("This session is live for another driver.", refused.Message, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task ATokenTheServerNoLongerAcceptsAsksTheDriverToSignInAgain()
    {
        LiveConnectionException refused = await Assert.ThrowsAsync<LiveConnectionException>(
            () => WebSocketLiveConnection.ConnectAsync(this.Ingest, "expired", CancellationToken.None));

        Assert.Contains("sign in again", refused.Message, StringComparison.Ordinal);
    }

    /// <summary>A stand-in for the API's ingest: checks the token, keeps two messages, then refuses.</summary>
    private async Task IngestAsync(HttpContext context)
    {
        if (context.Request.Headers.Authorization != "Bearer tok")
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        using WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
        byte[] buffer = new byte[4096];
        while (this._received.Count < 2)
        {
            WebSocketReceiveResult result = await socket.ReceiveAsync(buffer, CancellationToken.None);
            this._received.Add(Encoding.UTF8.GetString(buffer, 0, result.Count));
        }

        this._gotTwo.TrySetResult();
        await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "This session is live for another driver.", CancellationToken.None);
    }
}
