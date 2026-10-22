using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace Sprint.Desktop.Features.Peer;

/// <summary>
/// One datagram as it arrived, stamped when the socket read it, so time spent waiting for the
/// link's next step does not count as network time. IPv4 senders are reported as plain IPv4,
/// never IPv4-mapped IPv6.
/// </summary>
public readonly record struct PeerDatagram(byte[] Data, IPEndPoint From, DateTimeOffset ReceivedAt);

/// <summary>The link's UDP socket. The seam between <see cref="PeerLink"/> and the network.</summary>
public interface IPeerSocket : IDisposable
{
    /// <summary>The local port, which every candidate in this PC's code shares.</summary>
    int Port { get; }

    /// <summary>Whether the socket can reach IPv6 addresses as well as IPv4.</summary>
    bool SupportsIpv6 { get; }

    /// <summary>Sends one datagram. UDP is fire and forget: a failure is dropped, never thrown.</summary>
    void Send(byte[] datagram, IPEndPoint to);

    /// <summary>Takes the next received datagram, if any.</summary>
    bool TryReceive(out PeerDatagram datagram);
}

/// <summary>Opens the link's socket on a free port; throws <see cref="SocketException"/> when the OS refuses.</summary>
public delegate IPeerSocket OpenPeerSocket();

/// <summary>The STUN servers to ask, as IPv4 endpoints. An empty list is allowed: the code then has local and IPv6 candidates only.</summary>
public delegate Task<IReadOnlyList<IPEndPoint>> ResolveStunServers(CancellationToken ct);

/// <summary>This PC's own addresses worth putting in a code.</summary>
public delegate IReadOnlyList<IPAddress> LocalAddresses();

/// <summary>The real network behind the link's seams: public STUN servers, the machine's interfaces and a UDP socket.</summary>
public static class PeerNetwork
{
    /// <summary>
    /// Two independent public STUN servers. Two answers also tell whether the router keeps one
    /// public port per socket (direct links work) or picks a new one per destination (they mostly do not).
    /// </summary>
    private static readonly (string Host, int Port)[] StunServers = [("stun.l.google.com", 19302), ("stun.cloudflare.com", 3478)];

    public static async Task<IReadOnlyList<IPEndPoint>> ResolveStunAsync(CancellationToken ct)
    {
        List<IPEndPoint> servers = [];
        foreach ((string host, int port) in StunServers)
        {
            try
            {
                IPAddress[] addresses = await Dns.GetHostAddressesAsync(host, AddressFamily.InterNetwork, ct).ConfigureAwait(false);
                if (addresses.Length > 0)
                    servers.Add(new IPEndPoint(addresses[0], port));
            }
            catch (SocketException)
            {
                // No DNS or no such host: the other server, or local and IPv6 candidates only.
            }
        }

        return servers;
    }

    /// <summary>
    /// Private IPv4 addresses (the same network) and global IPv6 addresses (reachable without NAT)
    /// of interfaces that are up. Loopback, link-local and tunnel adapters are left out.
    /// </summary>
    public static IReadOnlyList<IPAddress> LocalAddresses()
    {
        NetworkInterface[] adapters;
        try
        {
            adapters = NetworkInterface.GetAllNetworkInterfaces();
        }
        catch (NetworkInformationException)
        {
            // The public address from STUN still makes a usable code.
            return [];
        }

        List<IPAddress> addresses = [];
        foreach (NetworkInterface adapter in adapters)
        {
            if (adapter.OperationalStatus != OperationalStatus.Up
                || adapter.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
                continue;

            foreach (UnicastIPAddressInformation unicast in adapter.GetIPProperties().UnicastAddresses)
            {
                IPAddress address = unicast.Address;
                if (PeerAddresses.IsPrivateIpv4(address) || PeerAddresses.IsGlobalIpv6(address))
                    addresses.Add(address);
            }
        }

        return addresses;
    }
}

/// <summary>Address classification shared by candidate gathering and the reported path.</summary>
public static class PeerAddresses
{
    /// <summary>10/8, 172.16/12 and 192.168/16: an address on someone's own network.</summary>
    public static bool IsPrivateIpv4(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork)
            return false;
        byte[] bytes = address.GetAddressBytes();
        return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) || (bytes[0] == 192 && bytes[1] == 168);
    }

    /// <summary>2000::/3, the global unicast range. Excludes link-local, unique-local and the Teredo tunnel.</summary>
    public static bool IsGlobalIpv6(IPAddress address) =>
        address.AddressFamily == AddressFamily.InterNetworkV6
        && (address.GetAddressBytes()[0] & 0xE0) == 0x20
        && !address.IsIPv6Teredo;
}

/// <summary>
/// A dual-stack UDP socket on a free port (IPv4 only where the OS has no IPv6), with a background
/// receive loop feeding a small queue. Received datagrams over the queue's bound are dropped:
/// a stalled worker must not grow memory, and only fresh packets matter.
/// </summary>
public sealed class UdpPeerSocket : IPeerSocket
{
    private const int MaxQueued = 256;
    private const int MaxDatagram = 2048;

    // SIO_UDP_CONNRESET: without it, Windows fails the next receive with ConnectionReset after an
    // ICMP "port unreachable", which probing a stale candidate routinely provokes.
    private const int SioUdpConnReset = unchecked((int)0x9800000C);

    private readonly Socket _socket;
    private readonly ConcurrentQueue<PeerDatagram> _received = new();
    private readonly CancellationTokenSource _stop = new();

    private UdpPeerSocket(Socket socket, bool ipv6)
    {
        this._socket = socket;
        this.SupportsIpv6 = ipv6;
        this.Port = socket.LocalEndPoint is IPEndPoint local ? local.Port : throw new SocketException((int)SocketError.NotConnected);
        _ = Task.Run(() => this.ReceiveLoopAsync(this._stop.Token));
    }

    public int Port { get; }

    public bool SupportsIpv6 { get; }

    /// <summary>An <see cref="OpenPeerSocket"/> on the real network.</summary>
    public static IPeerSocket Open()
    {
        if (Socket.OSSupportsIPv6)
        {
            Socket dual = new(AddressFamily.InterNetworkV6, SocketType.Dgram, ProtocolType.Udp) { DualMode = true };
            try
            {
                Configure(dual);
                dual.Bind(new IPEndPoint(IPAddress.IPv6Any, 0));
                return new UdpPeerSocket(dual, ipv6: true);
            }
            catch (SocketException)
            {
                dual.Dispose();
            }
        }

        Socket socket = new(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        try
        {
            Configure(socket);
            socket.Bind(new IPEndPoint(IPAddress.Any, 0));
            return new UdpPeerSocket(socket, ipv6: false);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    public void Send(byte[] datagram, IPEndPoint to)
    {
        if (to.AddressFamily == AddressFamily.InterNetworkV6 && !this.SupportsIpv6)
            return;
        try
        {
            this._socket.SendTo(datagram, to);
        }
        catch (SocketException)
        {
            // Unreachable network, no route: this candidate simply does not work.
        }
        catch (ObjectDisposedException)
        {
            // Closed while a step was still sending.
        }
    }

    public bool TryReceive(out PeerDatagram datagram) => this._received.TryDequeue(out datagram);

    public void Dispose()
    {
        this._stop.Cancel();
        this._socket.Dispose();
        this._stop.Dispose();
    }

    private static void Configure(Socket socket)
    {
        if (OperatingSystem.IsWindows())
            socket.IOControl(SioUdpConnReset, [0, 0, 0, 0], null);
    }

    private async Task ReceiveLoopAsync(CancellationToken stop)
    {
        byte[] buffer = new byte[MaxDatagram];
        EndPoint any = this.SupportsIpv6 ? new IPEndPoint(IPAddress.IPv6Any, 0) : new IPEndPoint(IPAddress.Any, 0);
        while (!stop.IsCancellationRequested)
        {
            SocketReceiveFromResult result;
            try
            {
                result = await this._socket.ReceiveFromAsync(buffer, SocketFlags.None, any, stop).ConfigureAwait(false);
            }
            catch (SocketException ex) when (ex.SocketErrorCode is SocketError.ConnectionReset or SocketError.MessageSize)
            {
                continue;
            }
            catch (Exception ex) when (ex is OperationCanceledException or ObjectDisposedException or SocketException)
            {
                return;
            }

            if (result.RemoteEndPoint is not IPEndPoint from || this._received.Count >= MaxQueued)
                continue;
            if (from.Address.IsIPv4MappedToIPv6)
                from = new IPEndPoint(from.Address.MapToIPv4(), from.Port);
            this._received.Enqueue(new PeerDatagram(buffer.AsSpan(0, result.ReceivedBytes).ToArray(), from, DateTimeOffset.UtcNow));
        }
    }
}
