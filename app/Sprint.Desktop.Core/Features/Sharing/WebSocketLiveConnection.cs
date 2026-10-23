using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Sprint.Contracts;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>
/// The live ingest WebSocket (<c>GET /api/live/ingest</c>, bearer token in the upgrade request).
/// The boundary: every socket failure leaves here as a <see cref="LiveConnectionException"/> with
/// a message fit for Settings. The server sends nothing but its close, which is read so a refusal
/// (1008 with a reason) can be shown.
/// </summary>
public sealed class WebSocketLiveConnection : ILiveConnection
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan CloseTimeout = TimeSpan.FromSeconds(2);

    private readonly ClientWebSocket _socket;
    private readonly CancellationTokenSource _receiving = new();
    private readonly Task _receive;
    private string? _closedBecause;

    private WebSocketLiveConnection(ClientWebSocket socket)
    {
        this._socket = socket;
        this._receive = this.ReceiveAsync(this._receiving.Token);
    }

    /// <summary>A <see cref="LiveConnect"/> over a real WebSocket.</summary>
    public static async Task<ILiveConnection> ConnectAsync(Uri ingest, string token, CancellationToken ct)
    {
        ClientWebSocket socket = new();
        socket.Options.SetRequestHeader("Authorization", $"Bearer {token}");
        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(15);
        socket.Options.CollectHttpResponseDetails = true;
        using CancellationTokenSource timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(ConnectTimeout);
        try
        {
            await socket.ConnectAsync(ingest, timeout.Token).ConfigureAwait(false);
            return new WebSocketLiveConnection(socket);
        }
        catch (Exception ex) when (ex is WebSocketException or HttpRequestException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            HttpStatusCode status = socket.HttpStatusCode;
            socket.Dispose();
            throw new LiveConnectionException(
                status is HttpStatusCode.Unauthorized
                    ? "Sprint web no longer accepts this sign-in. Sign out and sign in again."
                    : "Could not reach Sprint web.",
                ex);
        }
        catch
        {
            // The caller's own cancellation, or anything unexpected: still not handed off, so ours to dispose.
            socket.Dispose();
            throw;
        }
    }

    /// <summary>The message as the server reads it: camelCase, with its <c>type</c>.</summary>
    internal static string Serialize(LiveIngestMessage message) =>
        // As the base type: System.Text.Json writes the "type" discriminator only then.
        JsonSerializer.Serialize<LiveIngestMessage>(message);

    public async Task SendAsync(LiveIngestMessage message, CancellationToken ct)
    {
        if (this._socket.State != WebSocketState.Open)
            throw this.Gone(null);
        try
        {
            await this._socket.SendAsync(Encoding.UTF8.GetBytes(Serialize(message)), WebSocketMessageType.Text, endOfMessage: true, ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is WebSocketException or IOException or ObjectDisposedException)
        {
            throw this.Gone(ex);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (this._socket.State == WebSocketState.Open)
        {
            using CancellationTokenSource timeout = new(CloseTimeout);
            try
            {
                await this._socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", timeout.Token).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is WebSocketException or IOException or OperationCanceledException)
            {
                // Closing is a courtesy; the socket is disposed either way.
            }
        }

        await this._receiving.CancelAsync().ConfigureAwait(false);
        this._socket.Dispose();
        await this._receive.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        this._receiving.Dispose();
    }

    private LiveConnectionException Gone(Exception? inner) =>
        new(this._closedBecause is { Length: > 0 } reason ? $"Sprint web closed the live session: {reason}" : "The connection to Sprint web dropped.", inner);

    /// <summary>Drains what the server sends (only its close) so the close handshake and its reason are seen.</summary>
    private async Task ReceiveAsync(CancellationToken ct)
    {
        byte[] buffer = new byte[1024];
        try
        {
            while (!ct.IsCancellationRequested)
            {
                WebSocketReceiveResult result = await this._socket.ReceiveAsync(buffer, ct).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    this._closedBecause = this._socket.CloseStatusDescription;
                    return;
                }
            }
        }
        catch (Exception ex) when (ex is WebSocketException or IOException or OperationCanceledException or ObjectDisposedException)
        {
            // The next send reports the connection as gone.
        }
    }
}
