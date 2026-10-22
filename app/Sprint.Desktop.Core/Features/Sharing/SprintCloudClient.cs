using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Contracts;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>Why a cloud call did not produce an answer. Distinct, because the fixes differ.</summary>
public enum CloudFailure
{
    None,

    /// <summary>The server could not be reached at all.</summary>
    Unreachable,

    /// <summary>Not signed in, or the token is no longer accepted.</summary>
    NotSignedIn,

    /// <summary>No lap exists for that code.</summary>
    UnknownCode,

    /// <summary>The code existed and its owner withdrew it.</summary>
    Revoked,

    /// <summary>The server said no, for a reason it stated.</summary>
    Rejected,
}

/// <summary>An answer, or the reason there is not one.</summary>
public sealed record CloudResult<T>(T? Value, CloudFailure Failure, string Message)
{
    public bool Ok => Failure == CloudFailure.None && Value is not null;

    public static CloudResult<T> Success(T value) => new(value, CloudFailure.None, "");

    public static CloudResult<T> Failed(CloudFailure failure, string message) =>
        new(default, failure, message);
}

/// <summary>
/// The desktop's first cloud client (#197). Before this, the only outbound HTTP in the app was
/// the GitHub release check.
/// <para>
/// A hand-rolled GraphQL POST rather than a client library: there are six operations, the
/// contracts are already shared through <c>Sprint.Contracts</c>, and a codegen pipeline for the
/// desktop would be a build dependency earning almost nothing.
/// </para>
/// </summary>
public sealed class SprintCloudClient
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _http;
    private readonly Func<string?> _token;

    public SprintCloudClient(HttpClient http, Func<string?> token)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _token = token ?? throw new ArgumentNullException(nameof(token));
    }

    /// <summary>
    /// Every operation this client sends, by response field.
    /// <para>
    /// Exposed so a test can check them against the committed <c>web/schema.graphql</c>. A typo
    /// in a variable's type name is invisible to a stubbed transport and only shows up against
    /// a real server, which is the worst place to find it.
    /// </para>
    /// </summary>
    public static IReadOnlyDictionary<string, string> Operations { get; } =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["register"] = "mutation($e:String!,$p:String!){register(input:{email:$e,password:$p}){token}}",
            ["login"] = "mutation($e:String!,$p:String!){login(input:{email:$e,password:$p}){token}}",
            ["me"] = "{me{id email displayName createdAt}}",
            ["setDisplayName"] = "mutation($n:String!){setDisplayName(displayName:$n){id email displayName createdAt}}",
            ["shareLap"] = "mutation($i:ShareLapInput!){shareLap(input:$i){id shareCode game trackCourse carModel lapNumber lapTimeSeconds revoked createdAt}}",
            ["revokeSharedLap"] = "mutation($c:String!){revokeSharedLap(code:$c){id shareCode game trackCourse carModel lapNumber lapTimeSeconds revoked createdAt}}",
            ["mySharedLaps"] = "{mySharedLaps{id shareCode game trackCourse carModel lapNumber lapTimeSeconds revoked createdAt}}",
            ["sharedLap"] = "query($c:String!){sharedLap(code:$c){shareCode sharedBy game trackCourse carModel lapNumber lapTimeSeconds drivenAt payloadBase64}}",
            ["saveSession"] = "mutation($i:SaveSessionInput!){saveSession(input:$i){id}}",
            ["saveSetup"] = "mutation($i:SaveSetupInput!){saveSetup(input:$i){id}}",
            ["saveLayout"] = "mutation($i:SaveLayoutInput!){saveLayout(input:$i){id}}",
            ["sessions"] = "{sessions{id game track car sessionType startedAt data createdAt}}",
            ["setups"] = "{setups{id name data createdAt updatedAt}}",
            ["layouts"] = "{layouts{id name data createdAt updatedAt}}",
        };

    public Task<CloudResult<AuthResponse>> RegisterAsync(string email, string password, CancellationToken ct = default) =>
        CallAsync<AuthResponse>("register", new { e = email, p = password }, ct);

    public Task<CloudResult<AuthResponse>> SignInAsync(string email, string password, CancellationToken ct = default) =>
        CallAsync<AuthResponse>("login", new { e = email, p = password }, ct);

    public Task<CloudResult<UserProfile>> MeAsync(CancellationToken ct = default) =>
        CallAsync<UserProfile>("me", null, ct);

    public Task<CloudResult<UserProfile>> SetDisplayNameAsync(string name, CancellationToken ct = default) =>
        CallAsync<UserProfile>("setDisplayName", new { n = name }, ct);

    public Task<CloudResult<SharedLapSummary>> ShareLapAsync(ShareLapInput input, CancellationToken ct = default) =>
        CallAsync<SharedLapSummary>("shareLap", new { i = input }, ct);

    public Task<CloudResult<SharedLapSummary>> RevokeAsync(string code, CancellationToken ct = default) =>
        CallAsync<SharedLapSummary>("revokeSharedLap", new { c = code }, ct);

    public Task<CloudResult<List<SharedLapSummary>>> MySharedLapsAsync(CancellationToken ct = default) =>
        CallAsync<List<SharedLapSummary>>("mySharedLaps", null, ct);

    public Task<CloudResult<SharedLapDto>> FetchLapAsync(string code, CancellationToken ct = default) =>
        CallAsync<SharedLapDto>("sharedLap", new { c = code }, ct);

    public Task<CloudResult<SessionSummary>> SaveSessionAsync(SaveSessionInput input, CancellationToken ct = default) =>
        CallAsync<SessionSummary>("saveSession", new { i = input }, ct);

    public Task<CloudResult<SetupSummary>> SaveSetupAsync(SaveSetupInput input, CancellationToken ct = default) =>
        CallAsync<SetupSummary>("saveSetup", new { i = input }, ct);

    public Task<CloudResult<LayoutSummary>> SaveLayoutAsync(SaveLayoutInput input, CancellationToken ct = default) =>
        CallAsync<LayoutSummary>("saveLayout", new { i = input }, ct);

    public Task<CloudResult<List<SessionSummary>>> SessionsAsync(CancellationToken ct = default) =>
        CallAsync<List<SessionSummary>>("sessions", null, ct);

    public Task<CloudResult<List<SetupSummary>>> SetupsAsync(CancellationToken ct = default) =>
        CallAsync<List<SetupSummary>>("setups", null, ct);

    public Task<CloudResult<List<LayoutSummary>>> LayoutsAsync(CancellationToken ct = default) =>
        CallAsync<List<LayoutSummary>>("layouts", null, ct);

    private async Task<CloudResult<T>> CallAsync<T>(
        string field,
        object? variables,
        CancellationToken ct)
    {
        var query = Operations[field];
        using var request = new HttpRequestMessage(HttpMethod.Post, "graphql")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { query, variables }, Json),
                Encoding.UTF8,
                "application/json"),
        };

        if (_token() is { Length: > 0 } token)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        string body;
        try
        {
            using var response = await _http.SendAsync(request, ct).ConfigureAwait(false);
            body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized
                or System.Net.HttpStatusCode.Forbidden)
            {
                return CloudResult<T>.Failed(CloudFailure.NotSignedIn, "Sign in to Sprint cloud first.");
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException)
        {
            // Deliberately not the exception's own text: "No such host is known" is not
            // something to put in front of a driver.
            return CloudResult<T>.Failed(
                CloudFailure.Unreachable,
                "Could not reach Sprint cloud. Check your connection and the server address.");
        }

        GraphQLResponse<T>? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<GraphQLResponse<T>>(body, Json);
        }
        catch (JsonException)
        {
            return CloudResult<T>.Failed(CloudFailure.Rejected, "Sprint cloud returned something unreadable.");
        }

        if (parsed?.Errors is { Count: > 0 } errors)
        {
            return CloudResult<T>.Failed(Classify(errors[0].Message), errors[0].Message);
        }

        var value = parsed?.Data is { } data && data.TryGetValue(field, out var element)
            ? element.Deserialize<T>(Json)
            : default;

        return value is null
            ? CloudResult<T>.Failed(CloudFailure.Rejected, "Sprint cloud returned no answer.")
            : CloudResult<T>.Success(value);
    }

    /// <summary>
    /// Maps the server's message onto the three outcomes a driver can act on. Matching on text
    /// is fragile in general; here the two messages are asserted by the API's own tests, and
    /// the alternative — an error-code enum across the GraphQL boundary — is more machinery
    /// than three cases justify.
    /// </summary>
    private static CloudFailure Classify(string message) => message switch
    {
        _ when message.Contains("revoked", StringComparison.OrdinalIgnoreCase) => CloudFailure.Revoked,
        _ when message.Contains("No lap exists", StringComparison.OrdinalIgnoreCase) => CloudFailure.UnknownCode,
        _ when message.Contains("authoriz", StringComparison.OrdinalIgnoreCase)
            || message.Contains("authenticat", StringComparison.OrdinalIgnoreCase) => CloudFailure.NotSignedIn,
        _ => CloudFailure.Rejected,
    };

    private sealed record GraphQLResponse<T>(
        [property: JsonPropertyName("data")] Dictionary<string, JsonElement>? Data,
        [property: JsonPropertyName("errors")] List<GraphQLError>? Errors);

    private sealed record GraphQLError([property: JsonPropertyName("message")] string Message);
}
