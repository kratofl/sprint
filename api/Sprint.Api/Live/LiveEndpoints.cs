using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Sprint.Contracts;

namespace Sprint.Api.Live;

/// <summary>
/// The live telemetry HTTP surface. Both endpoints take the JWT as <c>Authorization: Bearer</c>.
/// <list type="bullet">
/// <item><c>GET /api/live/ingest</c> — WebSocket; the desktop sends <see cref="LiveIngestMessage"/> JSON text frames.</item>
/// <item><c>GET /api/live/sessions/{sessionKey}/stream</c> — SSE for viewers: <c>snapshot</c>, <c>samples</c>, <c>lap</c>, then <c>ended</c> or <c>revoked</c>.</item>
/// </list>
/// SSE rather than a socket for viewers: the stream is one-way, it passes through the web's
/// Next route handler as a plain response, and the browser's EventSource reconnects on its own.
/// </summary>
public static class LiveEndpoints
{
    private const int MaxMessageBytes = 512 * 1024;
    private static readonly TimeSpan KeepAlive = TimeSpan.FromSeconds(15);

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        // The desktop may write "type" anywhere in the object.
        AllowOutOfOrderMetadataProperties = true,
    };

    public static void MapLiveEndpoints(this WebApplication app)
    {
        app.Map("/api/live/ingest", IngestAsync).RequireAuthorization();
        app.MapGet("/api/live/sessions/{sessionKey}/stream", StreamAsync).RequireAuthorization();
    }

    /// <summary>Parses one ingest message; null when it is not a valid one.</summary>
    public static LiveIngestMessage? Parse(string text)
    {
        try
        {
            return JsonSerializer.Deserialize<LiveIngestMessage>(text, Json);
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            return null;
        }
    }

    /// <summary>One stream event as SSE text: <c>event: name</c> and a single <c>data:</c> line of JSON.</summary>
    public static string Format(LiveStreamEvent item)
    {
        (string name, string data) = item switch
        {
            StreamSnapshot e => ("snapshot", JsonSerializer.Serialize(e.Payload, Json)),
            StreamSamples e => ("samples", JsonSerializer.Serialize(e.Payload, Json)),
            StreamLap e => ("lap", JsonSerializer.Serialize(e.Payload, Json)),
            StreamEnded e => ("ended", JsonSerializer.Serialize(e.Payload, Json)),
            StreamRevoked e => ("revoked", JsonSerializer.Serialize(e.Payload, Json)),
            _ => throw new InvalidOperationException("Unknown live event."),
        };
        return $"event: {name}\ndata: {data}\n\n";
    }

    private static async Task IngestAsync(
        HttpContext http,
        LiveHub hub,
        CatalogService catalog,
        ITelemetryStore store,
        IDbContextFactory<SprintDbContext> dbFactory,
        TimeProvider time,
        CancellationToken ct)
    {
        if (!http.WebSockets.IsWebSocketRequest)
        {
            http.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        string? userId = http.User.UserId();
        UserEntity? user = null;
        if (userId is not null)
        {
            await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
            user = await db.Users.FindAsync([userId], ct);
        }

        if (user is null)
        {
            http.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        using WebSocket socket = await http.WebSockets.AcceptWebSocketAsync();
        LiveIngestConnection connection = new(EngineerService.Summary(user), hub, catalog, store, time);
        try
        {
            while (await ReceiveTextAsync(socket, ct) is { } text)
            {
                string? problem = Parse(text) is { } message
                    ? await connection.HandleAsync(message, ct)
                    : "Not a live telemetry message.";
                if (problem is not null)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, problem, ct);
                    return;
                }
            }

            if (socket.State == WebSocketState.CloseReceived)
                await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", ct);
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            // The desktop vanished; Disconnected below lets it come back.
        }
        finally
        {
            connection.Disconnected();
        }
    }

    /// <summary>The next whole text message, or null once the socket closes. Oversized messages close it.</summary>
    private static async Task<string?> ReceiveTextAsync(WebSocket socket, CancellationToken ct)
    {
        byte[] buffer = new byte[16 * 1024];
        using MemoryStream message = new();
        while (true)
        {
            WebSocketReceiveResult result = await socket.ReceiveAsync(buffer, ct);
            if (result.MessageType == WebSocketMessageType.Close)
                return null;
            message.Write(buffer, 0, result.Count);
            if (message.Length > MaxMessageBytes)
            {
                await socket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "Message too large.", ct);
                return null;
            }

            if (result.EndOfMessage)
            {
                if (result.MessageType == WebSocketMessageType.Text)
                    return Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                message.SetLength(0);
            }
        }
    }

    private static async Task StreamAsync(HttpContext http, string sessionKey, EngineerService engineers, CancellationToken ct)
    {
        string? viewerId = http.User.UserId();
        if (viewerId is null)
        {
            http.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        LiveWatch watch = await engineers.WatchAsync(viewerId, sessionKey, ct);
        if (watch is not Watching watching)
        {
            http.Response.StatusCode = watch is NotAllowed ? StatusCodes.Status403Forbidden : StatusCodes.Status404NotFound;
            return;
        }

        using LiveSubscription subscription = watching.Subscription;
        http.Response.ContentType = "text/event-stream";
        http.Response.Headers.CacheControl = "no-cache";
        http.Response.Headers["X-Accel-Buffering"] = "no";
        http.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        try
        {
            Task<bool> waiting = subscription.Events.WaitToReadAsync(ct).AsTask();
            while (true)
            {
                if (await Task.WhenAny(waiting, Task.Delay(KeepAlive, ct)) != waiting)
                {
                    await WriteAsync(http, ": keepalive\n\n", ct);
                    continue;
                }

                if (!await waiting)
                    return;
                while (subscription.Events.TryRead(out LiveStreamEvent? item))
                {
                    await WriteAsync(http, Format(item), ct);
                    if (item is StreamEnded or StreamRevoked)
                        return;
                }

                waiting = subscription.Events.WaitToReadAsync(ct).AsTask();
            }
        }
        catch (OperationCanceledException)
        {
            // The viewer went away.
        }
    }

    private static async Task WriteAsync(HttpContext http, string text, CancellationToken ct)
    {
        await http.Response.WriteAsync(text, ct);
        await http.Response.Body.FlushAsync(ct);
    }
}
