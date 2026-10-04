using System.Net;
using System.Net.Http;
using System.Text;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The desktop's cloud client (#197). The server's own rules are tested in Sprint.Api.Tests;
/// what matters here is that a driver is told which of the failures happened, because the fix
/// differs for each.
/// </summary>
public sealed class CloudSharingTests
{
    [Fact]
    public async Task AnUnreachableServerIsNotReportedAsARejection()
    {
        var client = Client(_ => throw new HttpRequestException("No such host is known."));

        var result = await client.FetchLapAsync("ABC");

        Assert.Equal(CloudFailure.Unreachable, result.Failure);
        // The driver gets something actionable, not the socket layer's wording.
        Assert.DoesNotContain("host", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("connection", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AnUnknownCodeAndARevokedCodeAreDifferentAnswers()
    {
        var unknown = await Client(Errors("No lap exists for that code.")).FetchLapAsync("NOPE");
        var revoked = await Client(Errors("That share code has been revoked by its owner.")).FetchLapAsync("OLD");

        Assert.Equal(CloudFailure.UnknownCode, unknown.Failure);
        Assert.Equal(CloudFailure.Revoked, revoked.Failure);
    }

    [Fact]
    public async Task BeingSignedOutIsItsOwnAnswer()
    {
        var client = Client(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("{}"),
        });

        var result = await client.FetchLapAsync("ABC");

        Assert.Equal(CloudFailure.NotSignedIn, result.Failure);
        Assert.Contains("Sign in", result.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AFetchedLapCarriesItsPayloadAndAttribution()
    {
        var client = Client(Data("""
            {"sharedLap":{"shareCode":"ABC","sharedBy":"Ada","game":"Le Mans Ultimate",
            "trackCourse":"Spa-Francorchamps","carModel":"Porsche 963","lapNumber":4,
            "lapTimeSeconds":101.5,"drivenAt":null,"payloadBase64":"AQID"}}
            """));

        var result = await client.FetchLapAsync("ABC");

        Assert.True(result.Ok);
        Assert.Equal("Ada", result.Value!.SharedBy);
        Assert.Equal([1, 2, 3], Convert.FromBase64String(result.Value.PayloadBase64));
    }

    [Fact]
    public async Task TheTokenIsSentAsABearerHeaderWhenThereIsOne()
    {
        HttpRequestMessage? seen = null;
        var client = new SprintCloudClient(
            Http(request =>
            {
                seen = request;
                return Data("""{"me":{"id":"1","email":"a@b.c","displayName":"Ada","createdAt":"2026-01-01T00:00:00Z"}}""")(request);
            }),
            () => "tok123");

        await client.MeAsync();

        Assert.Equal("Bearer", seen!.Headers.Authorization!.Scheme);
        Assert.Equal("tok123", seen.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task NoTokenMeansNoAuthorizationHeaderRatherThanAnEmptyOne()
    {
        HttpRequestMessage? seen = null;
        var client = new SprintCloudClient(
            Http(request =>
            {
                seen = request;
                return Data("""{"login":{"token":"t"}}""")(request);
            }),
            () => null);

        await client.SignInAsync("a@b.c", "pw");

        Assert.Null(seen!.Headers.Authorization);
    }

    [Fact]
    public void ASessionRoundTripsAndSignOutForgetsTheToken()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var session = new CloudSession(root);
            session.SignIn("https://sprint.example/", "tok", "a@b.c");
            session.SetDisplayName("Ada");

            var reloaded = new CloudSession(root);
            Assert.True(reloaded.IsSignedIn);
            Assert.Equal("https://sprint.example", reloaded.State.ServerUrl);
            Assert.Equal("Ada", reloaded.Attribution);

            reloaded.SignOut();
            Assert.False(new CloudSession(root).IsSignedIn);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void ADriverWithNoDisplayNameIsCreditedNeutrallyNotByEmail()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var session = new CloudSession(root);
            session.SignIn("https://sprint.example", "tok", "alex@example.com");

            Assert.Equal("Unknown driver", session.Attribution);
            Assert.DoesNotContain('@', session.Attribution);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void ACorruptSessionFileReadsAsSignedOutRatherThanFailingToStart()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            File.WriteAllText(Path.Combine(root, "cloud-session.json"), "{ not json");

            Assert.False(new CloudSession(root).IsSignedIn);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void EveryOperationNamesAFieldTheCommittedSchemaActuallyHas()
    {
        // A stubbed transport answers whatever it is asked, so a wrong field name is invisible
        // in every other test here and only surfaces against a real server.
        var schema = File.ReadAllText(Path.Combine(TestEnv.RepoRoot, "web", "schema.graphql"));

        foreach (var field in SprintCloudClient.Operations.Keys)
        {
            // An argument-less field is declared as "me: UserProfile", one with arguments as
            // "sharedLap(code: ...)".
            Assert.True(
                schema.Contains($"  {field}(", StringComparison.Ordinal)
                || schema.Contains($"  {field}:", StringComparison.Ordinal),
                $"The schema declares no field '{field}'.");
        }
    }

    [Fact]
    public void EveryVariableTypeIsOneTheCommittedSchemaDeclares()
    {
        // This is the check that catches "ShareLapInputInput" — HotChocolate names the input
        // type from the CLR type, and guessing that name wrong compiles and stubs fine.
        var schema = File.ReadAllText(Path.Combine(TestEnv.RepoRoot, "web", "schema.graphql"));

        foreach (var (field, query) in SprintCloudClient.Operations)
        {
            foreach (var type in System.Text.RegularExpressions.Regex
                .Matches(query, @"\$\w+\s*:\s*(\w+)")
                .Select(match => match.Groups[1].Value)
                .Distinct(StringComparer.Ordinal))
            {
                if (type is "String" or "Int" or "Float" or "Boolean" or "ID")
                {
                    continue;
                }

                Assert.True(
                    schema.Contains($"input {type} ", StringComparison.Ordinal)
                    || schema.Contains($"type {type} ", StringComparison.Ordinal)
                    || schema.Contains($"scalar {type}", StringComparison.Ordinal),
                    $"{field} names a type '{type}' the schema does not declare.");
            }
        }
    }

    private static SprintCloudClient Client(Func<HttpRequestMessage, HttpResponseMessage> respond) =>
        new(Http(respond), () => "token");

    private static HttpClient Http(Func<HttpRequestMessage, HttpResponseMessage> respond) =>
        new(new StubHandler(respond)) { BaseAddress = new Uri("https://sprint.example/") };

    private static Func<HttpRequestMessage, HttpResponseMessage> Data(string json) =>
        _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent($$"""{"data":{{json}}}""", Encoding.UTF8, "application/json"),
        };

    private static Func<HttpRequestMessage, HttpResponseMessage> Errors(string message) =>
        _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                $$"""{"errors":[{"message":{{System.Text.Json.JsonSerializer.Serialize(message)}}}]}""",
                Encoding.UTF8,
                "application/json"),
        };

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(respond(request));
    }
}
