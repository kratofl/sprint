using System.Net.Http;
using Sprint.Contracts;
using Sprint.Desktop.Features.Analysis;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>
/// The cloud half of sharing (#197): sign in, mint a code for a lap, pull somebody else's,
/// withdraw your own.
/// <para>
/// Everything returns a message rather than throwing, because every one of these can fail for a
/// reason the driver has to be told — offline, signed out, unknown code, revoked code — and a
/// page is the wrong place to be catching exceptions.
/// </para>
/// </summary>
public sealed class CloudLapSharing
{
    private readonly CloudSession _session;
    private readonly LapSharingService _files;
    private readonly SharedLapImporter _importer;
    private readonly Func<string, SprintCloudClient> _clientFactory;

    public CloudLapSharing(
        CloudSession session,
        LapSharingService files,
        SharedLapImporter importer,
        Func<string, SprintCloudClient>? clientFactory = null)
    {
        _session = session ?? throw new ArgumentNullException(nameof(session));
        _files = files ?? throw new ArgumentNullException(nameof(files));
        _importer = importer ?? throw new ArgumentNullException(nameof(importer));
        _clientFactory = clientFactory ?? DefaultClient;
    }

    public bool IsSignedIn => _session.IsSignedIn;

    /// <summary>Who the driver is signed in as, for the page's status line.</summary>
    public string Identity => _session.State.DisplayName is { Length: > 0 } name
        ? name
        : _session.State.Email;

    public string ServerUrl => _session.State.ServerUrl;

    public async Task<string> SignInAsync(string serverUrl, string email, string password, bool register)
    {
        if (string.IsNullOrWhiteSpace(serverUrl) || string.IsNullOrWhiteSpace(email))
        {
            return "A server address and an email are needed.";
        }

        var client = _clientFactory(serverUrl);
        var auth = register
            ? await client.RegisterAsync(email, password).ConfigureAwait(false)
            : await client.SignInAsync(email, password).ConfigureAwait(false);

        if (!auth.Ok)
        {
            return auth.Message;
        }

        _session.SignIn(serverUrl, auth.Value!.Token, email);

        // Pull the profile straight away: the display name is what a shared lap is attributed
        // to, and finding out it is blank at share time is too late to be useful.
        var me = await Client().MeAsync().ConfigureAwait(false);
        if (me.Ok)
        {
            _session.SetDisplayName(me.Value!.DisplayName);
        }

        return _session.State.DisplayName.Length > 0
            ? $"Signed in as {_session.State.DisplayName}."
            : "Signed in. Set a display name so shared laps are credited to you.";
    }

    public void SignOut() => _session.SignOut();

    public async Task<string> SetDisplayNameAsync(string displayName)
    {
        var result = await Client().SetDisplayNameAsync(displayName).ConfigureAwait(false);
        if (!result.Ok)
        {
            return result.Message;
        }

        _session.SetDisplayName(result.Value!.DisplayName);
        return $"Shared laps will be credited to {result.Value.DisplayName}.";
    }

    /// <summary>
    /// Uploads one lap and returns its code. Only laps passed here ever leave the machine — the
    /// corpus stays local, and consent is per lap (spec §2.7).
    /// </summary>
    public async Task<string> ShareAsync(CorpusLap lap)
    {
        ArgumentNullException.ThrowIfNull(lap);

        if (_files.Package(lap) is not { } shared)
        {
            return "That lap has no channels to share.";
        }

        using var payload = new MemoryStream();
        SharedLapFile.Write(payload, shared);

        var result = await Client().ShareLapAsync(new ShareLapInput
        {
            Game = lap.Context.Game,
            TrackCourse = lap.Context.TrackCourse,
            CarModel = lap.Context.CarModel,
            LapNumber = lap.LapNumber,
            LapTimeSeconds = lap.LapTimeSeconds,
            DrivenAt = lap.SessionStartedAt,
            PayloadBase64 = Convert.ToBase64String(payload.ToArray()),
        }).ConfigureAwait(false);

        return result.Ok
            ? $"Share code: {result.Value!.ShareCode} — anyone with it can pull this lap."
            : result.Message;
    }

    /// <summary>
    /// Pulls a lap by code and reads it, without filing it. The caller confirms first: a cloud
    /// fetch is held to the same standard as a file import, which is never silent.
    /// </summary>
    public async Task<SharedLapOffer> OfferAsync(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return new SharedLapOffer(null, "Enter a share code.");
        }

        var result = await Client().FetchLapAsync(code.Trim()).ConfigureAwait(false);
        if (!result.Ok)
        {
            return new SharedLapOffer(null, result.Message);
        }

        var dto = result.Value!;
        using var payload = new MemoryStream(Convert.FromBase64String(dto.PayloadBase64));
        var read = SharedLapFile.Read(payload);
        if (!read.Ok)
        {
            return new SharedLapOffer(null, "That lap could not be read: " + read.Message);
        }

        // The server is the authority on who shared it and under which code — the payload was
        // written before either was known.
        var lap = read.Lap! with
        {
            Provenance = read.Lap!.Provenance with
            {
                SourceKind = SharedLapSources.Cloud,
                SharedBy = dto.SharedBy,
                ShareCode = dto.ShareCode,
            },
        };

        return new SharedLapOffer(lap, "");
    }

    /// <summary>Files a pulled lap through the same path a file import uses.</summary>
    public string Accept(SharedLap lap)
    {
        ArgumentNullException.ThrowIfNull(lap);

        var result = _importer.Import(lap);
        return result.Added
            ? $"Added {lap.Attribution}'s {lap.Context.TrackCourse} lap."
            : "You already have that lap.";
    }

    public async Task<(IReadOnlyList<SharedLapSummary> Laps, string Message)> MineAsync()
    {
        var result = await Client().MySharedLapsAsync().ConfigureAwait(false);
        return result.Ok ? (result.Value!, "") : ([], result.Message);
    }

    public async Task<string> RevokeAsync(string code)
    {
        var result = await Client().RevokeAsync(code).ConfigureAwait(false);
        return result.Ok
            ? $"Revoked {code}. Anyone holding it now gets told it was withdrawn."
            : result.Message;
    }

    private SprintCloudClient Client() => _clientFactory(_session.State.ServerUrl);

    private SprintCloudClient DefaultClient(string serverUrl)
    {
        var http = new HttpClient
        {
            BaseAddress = new Uri(serverUrl.TrimEnd('/') + "/"),
            // A lap payload is a few hundred kilobytes over a home connection; the default
            // 100 seconds is generous but a hung request must not hang the page forever.
            Timeout = TimeSpan.FromSeconds(30),
        };

        return new SprintCloudClient(http, () => _session.State.Token);
    }
}
