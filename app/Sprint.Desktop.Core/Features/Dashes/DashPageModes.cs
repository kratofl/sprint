using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// One of the driver's own modes ("Fuel save", "Wet"): app-wide, not per dash, so a wheel's
/// multi-dial position can switch it on whatever dash is showing. Kept in
/// <c>AppSettings.DashModes</c>; pages opt in through <see cref="DashPage.ShowIn"/>.
/// </summary>
public sealed record DashMode
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("name")]
    public string Name { get; init; } = "";
}

/// <summary>
/// Which pages of a dash the wheel cycles. Sessions switch by themselves from telemetry; the
/// driver's own modes are on while a multi-dial sits on a position set to one, and then only
/// that mode's pages cycle. Pure: <see cref="DashPageCycle"/> holds the state it is applied to.
/// </summary>
public static class DashPageModes
{
    public const string Practice = "practice";
    public const string Qualifying = "qualifying";
    public const string Race = "race";

    /// <summary>The session ids a page can be shown in, in the order the designer lists them.</summary>
    public static IReadOnlyList<string> Sessions { get; } = [Practice, Qualifying, Race];

    /// <summary>The longest name a mode takes.</summary>
    public const int MaxNameLength = 24;

    /// <summary>The session id the wheel follows for <paramref name="session"/>; warm-up counts as practice. Null outside a known session.</summary>
    public static string? SessionOf(SessionType session) => session switch
    {
        SessionType.Practice or SessionType.Warmup => Practice,
        SessionType.Qualify => Qualifying,
        SessionType.Race => Race,
        _ => null,
    };

    /// <summary>
    /// The pages the wheel cycles, in dash order. With one of the driver's modes on
    /// (<paramref name="modeId"/>): the pages shown in it. Otherwise, or when no page is: the pages
    /// shown in <paramref name="session"/> -- every page left on "every session" among them. Never
    /// empty while the dash has pages: when nothing matches, every page.
    /// </summary>
    public static IReadOnlyList<DashPage> CyclePages(DashLayout layout, string? modeId, SessionType session)
    {
        ArgumentNullException.ThrowIfNull(layout);
        if (modeId is not null)
        {
            List<DashPage> inMode = layout.Pages.Where(page => Includes(page, modeId)).ToList();
            if (inMode.Count > 0)
            {
                return inMode;
            }
        }

        if (SessionOf(session) is not { } sessionId)
        {
            return layout.Pages;
        }

        List<DashPage> inSession = layout.Pages.Where(page => page.ShowIn is not { Count: > 0 } || Includes(page, sessionId)).ToList();
        return inSession.Count > 0 ? inSession : layout.Pages;
    }

    /// <summary>
    /// Validates a new mode's name, or the new name of mode <paramref name="renaming"/>: trimmed,
    /// non-empty, not too long, not a session's name and not another mode's (any casing).
    /// </summary>
    public static bool TryValidateName(string? name, IEnumerable<DashMode> modes, string? renaming, out string trimmed, out string error)
    {
        trimmed = name?.Trim() ?? "";
        error = "";
        if (trimmed.Length == 0) { error = "mode name is required"; return false; }
        if (trimmed.Length > MaxNameLength) { error = $"mode name is longer than {MaxNameLength} characters"; return false; }

        string candidate = trimmed;
        if (Sessions.Any(session => string.Equals(session, candidate, StringComparison.OrdinalIgnoreCase))) { error = $"\"{trimmed}\" is a session"; return false; }
        if (modes.Any(mode => mode.Id != renaming && string.Equals(mode.Name, candidate, StringComparison.OrdinalIgnoreCase)))
        {
            error = $"a mode named \"{trimmed}\" already exists";
            return false;
        }

        return true;
    }

    /// <summary>
    /// Drops from each page's picks (its variants' pages too) every id that is neither a session nor one of
    /// <paramref name="modes"/> (a mode deleted since, or brought back by the designer's undo); a
    /// page left with none shows in every session again. True when anything changed.
    /// </summary>
    public static bool ForgetUnknownPicks(DashLayout layout, IReadOnlyCollection<DashMode> modes)
    {
        ArgumentNullException.ThrowIfNull(layout);
        bool changed = false;
        foreach (DashPage page in layout.Pages.Concat((layout.Variants ?? []).SelectMany(variant => variant.Layout.Pages)))
        {
            if (page.ShowIn is not { } showIn)
            {
                continue;
            }

            List<string> known = showIn.Where(id => Sessions.Contains(id) || modes.Any(mode => mode.Id == id)).ToList();
            if (known.Count != showIn.Count)
            {
                page.ShowIn = known.Count > 0 ? known : null;
                changed = true;
            }
        }

        return changed;
    }

    /// <summary>A mode id the designer made up: lowercase letters, digits and dashes, not a session's id.</summary>
    public static bool IsValidId(string id) =>
        id.Length is > 0 and <= 64
        && id.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-')
        && !Sessions.Contains(id);

    private static bool Includes(DashPage page, string id) =>
        page.ShowIn?.Any(entry => string.Equals(entry, id, StringComparison.OrdinalIgnoreCase)) == true;
}

/// <summary>
/// Spots the moments a page can jump on (<see cref="DashPageJump"/>) in the player's telemetry:
/// leaving the pit lane starts the out lap; the lap count going up on track -- the line at the end
/// of the out lap, and every lap after -- starts a flying lap. A lap counted in the pit lane (the
/// line runs through it at many tracks) is not one. Feed it every new frame, on one thread.
/// </summary>
public sealed class DashLapWatch
{
    private bool? _inPitLane;
    private int? _lap;
    private SessionType _session = SessionType.Unknown;

    /// <summary>What <paramref name="frame"/> starts, if anything.</summary>
    public DashPageJump? Next(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (!frame.Session.InCar || frame.Session.SessionType != this._session)
        {
            // Out of the car or a new session: nothing to compare against until the next frame.
            this._session = frame.Session.SessionType;
            this._inPitLane = frame.Session.InCar ? frame.Car.InPitLane : null;
            this._lap = frame.Session.InCar ? frame.Lap.CurrentLap : null;
            return null;
        }

        bool inPitLane = frame.Car.InPitLane ?? false;
        int lap = frame.Lap.CurrentLap;
        bool leftPits = this._inPitLane == true && !inPitLane;
        bool crossedLine = this._lap is { } before && lap > before && !inPitLane;
        this._inPitLane = inPitLane;
        this._lap = lap;
        return leftPits ? DashPageJump.OutLap : crossedLine ? DashPageJump.FlyingLap : null;
    }
}
