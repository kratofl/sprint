using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;
using Sprint.Contracts;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>A Sprint server that answered on the local network.</summary>
public sealed record DiscoveredServer(string Url, string Version);

/// <summary>
/// Looks for a self-hosted Sprint server on the local network by asking every nearby host for
/// <c>/api/health</c> and keeping the ones that call themselves Sprint
/// (<see cref="HealthStatus.SprintService"/>). No multicast or mDNS: a plain HTTP sweep of this
/// machine's /24 needs nothing from the server or the router, and finishes in a few seconds.
/// </summary>
public sealed class ServerDiscovery(HttpMessageHandler transport)
{
    /// <summary>The API's default port (docker-compose and <c>make dev-api</c>).</summary>
    public const int DefaultPort = 8080;

    private const int Parallelism = 64;
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromMilliseconds(800);

    /// <summary>
    /// Where to look: this machine first, then every other host in the /24 around each private
    /// IPv4 address of this machine. Wider networks are narrowed to that /24 rather than swept
    /// whole; public, loopback and IPv6 addresses are skipped.
    /// </summary>
    public static IReadOnlyList<Uri> Candidates(IEnumerable<(IPAddress Address, int PrefixLength)> interfaces, int port)
    {
        List<Uri> candidates = [new Uri($"http://localhost:{port}/")];
        HashSet<string> own = [];
        HashSet<string> seen = [];
        List<(IPAddress Address, int PrefixLength)> networks = [.. interfaces.Where(item => IsPrivateIPv4(item.Address))];
        foreach ((IPAddress address, _) in networks)
            own.Add(address.ToString());

        foreach ((IPAddress address, _) in networks)
        {
            byte[] bytes = address.GetAddressBytes();
            for (int host = 1; host <= 254; host++)
            {
                string candidate = $"{bytes[0]}.{bytes[1]}.{bytes[2]}.{host}";
                if (own.Contains(candidate) || !seen.Add(candidate))
                    continue;
                candidates.Add(new Uri($"http://{candidate}:{port}/"));
            }
        }

        return candidates;
    }

    /// <summary>This machine's IPv4 addresses on interfaces that are up. The OS boundary of <see cref="Candidates"/>.</summary>
    public static IEnumerable<(IPAddress Address, int PrefixLength)> LocalInterfaces() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Where(nic => nic.OperationalStatus == OperationalStatus.Up && nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(nic => nic.GetIPProperties().UnicastAddresses)
            .Where(unicast => unicast.Address.AddressFamily == AddressFamily.InterNetwork)
            .Select(unicast => (unicast.Address, unicast.PrefixLength));

    /// <summary>Probes every candidate, a few dozen at a time; returns the Sprint servers in candidate order.</summary>
    public async Task<IReadOnlyList<DiscoveredServer>> ScanAsync(IReadOnlyList<Uri> candidates, CancellationToken ct = default)
    {
        using HttpClient http = new(transport, disposeHandler: false) { Timeout = Timeout.InfiniteTimeSpan };
        DiscoveredServer?[] found = new DiscoveredServer?[candidates.Count];
        await Parallel.ForEachAsync(
            Enumerable.Range(0, candidates.Count),
            new ParallelOptions { MaxDegreeOfParallelism = Parallelism, CancellationToken = ct },
            async (index, token) => found[index] = await this.ProbeAsync(http, candidates[index], token).ConfigureAwait(false)).ConfigureAwait(false);
        return [.. found.OfType<DiscoveredServer>()];
    }

    private async Task<DiscoveredServer?> ProbeAsync(HttpClient http, Uri server, CancellationToken ct)
    {
        using CancellationTokenSource timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(ProbeTimeout);
        try
        {
            using HttpResponseMessage response = await http.GetAsync(new Uri(server, "api/health"), timeout.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                return null;
            string body = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
            // Read the raw fields: HealthStatus defaults `service` to Sprint's own name, so
            // deserialising it would count any {"status":"ok"} on the network as a Sprint server.
            using JsonDocument health = JsonDocument.Parse(body);
            JsonElement root = health.RootElement;
            bool isSprint = root.ValueKind == JsonValueKind.Object
                && root.TryGetProperty("service", out JsonElement service)
                && service.ValueKind == JsonValueKind.String
                && service.GetString() == HealthStatus.SprintService;
            string version = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("version", out JsonElement v) && v.ValueKind == JsonValueKind.String
                ? v.GetString() ?? ""
                : "";
            return isSprint ? new DiscoveredServer(server.GetLeftPart(UriPartial.Authority), version) : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or JsonException)
        {
            // Nobody there, too slow, or not a Sprint server: all mean "not found here".
            ct.ThrowIfCancellationRequested();
            return null;
        }
    }

    private static bool IsPrivateIPv4(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork)
            return false;
        byte[] b = address.GetAddressBytes();
        return b[0] == 10 || (b[0] == 172 && b[1] is >= 16 and <= 31) || (b[0] == 192 && b[1] == 168);
    }
}
