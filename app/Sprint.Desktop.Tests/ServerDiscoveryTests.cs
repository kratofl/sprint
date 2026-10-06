using System.Net;
using System.Net.Http;
using System.Text;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>Finding a self-hosted Sprint server on the local network, so the driver does not have to type its address.</summary>
public sealed class ServerDiscoveryTests
{
    [Fact]
    public void ThisMachineIsTriedFirstThenEveryOtherHostOnEachLocalNetwork()
    {
        IReadOnlyList<Uri> candidates = ServerDiscovery.Candidates([(IPAddress.Parse("192.168.1.20"), 24)], 8080);

        Assert.Equal(new Uri("http://localhost:8080/"), candidates[0]);
        Assert.Contains(new Uri("http://192.168.1.1:8080/"), candidates);
        Assert.Contains(new Uri("http://192.168.1.254:8080/"), candidates);
        // This machine is already covered by localhost; network and broadcast addresses are no hosts.
        Assert.DoesNotContain(new Uri("http://192.168.1.20:8080/"), candidates);
        Assert.DoesNotContain(new Uri("http://192.168.1.0:8080/"), candidates);
        Assert.DoesNotContain(new Uri("http://192.168.1.255:8080/"), candidates);
        Assert.Equal(1 + 253, candidates.Count);
    }

    [Fact]
    public void AWideNetworkIsOnlySweptAroundThisMachineAndPublicAddressesNotAtAll()
    {
        IReadOnlyList<Uri> candidates = ServerDiscovery.Candidates(
            [(IPAddress.Parse("10.0.5.7"), 16), (IPAddress.Parse("8.8.8.8"), 24), (IPAddress.Parse("127.0.0.1"), 8)],
            8080);

        // A /16 is 65k hosts; a sweep that long is useless, so only this machine's /24 is tried.
        Assert.Equal(1 + 253, candidates.Count);
        Assert.Contains(new Uri("http://10.0.5.1:8080/"), candidates);
        Assert.DoesNotContain(candidates, uri => uri.Host.StartsWith("8.8.8.", StringComparison.Ordinal));
    }

    [Fact]
    public async Task OnlyAServerThatSaysItIsSprintIsFound()
    {
        ServerDiscovery discovery = new(new FakeNetwork(new Dictionary<string, string>
        {
            ["192.168.1.5"] = """{"status":"ok","version":"1.2.0","service":"sprint-api"}""",
            ["192.168.1.6"] = """{"status":"ok"}""",
            ["192.168.1.7"] = "<html>router</html>",
        }));

        IReadOnlyList<DiscoveredServer> found = await discovery.ScanAsync(
            [new Uri("http://192.168.1.5:8080/"), new Uri("http://192.168.1.6:8080/"), new Uri("http://192.168.1.7:8080/"), new Uri("http://192.168.1.8:8080/")]);

        DiscoveredServer server = Assert.Single(found);
        Assert.Equal(new DiscoveredServer("http://192.168.1.5:8080", "1.2.0"), server);
    }

    /// <summary>Answers /api/health for the listed hosts; every other host refuses the connection.</summary>
    private sealed class FakeNetwork(IReadOnlyDictionary<string, string> healthByHost) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Uri uri = request.RequestUri ?? throw new HttpRequestException("no address");
            if (uri.AbsolutePath != "/api/health" || !healthByHost.TryGetValue(uri.Host, out string? body))
                throw new HttpRequestException("Connection refused");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
}
