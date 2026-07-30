using System.Globalization;
using System.Xml.Linq;

namespace Sprint.Games.LeMansUltimate.Results;

/// <summary>Thrown when an LMU result document is not well-formed or lacks the expected root.</summary>
public sealed class LmuResultParseException : Exception
{
    public LmuResultParseException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// Parses a Le Mans Ultimate / rFactor 2 result XML (<c>rFactorXML/RaceResults</c>) into the
/// game-native <see cref="LmuSessionResult"/> model. Pure and side-effect free: it takes XML
/// text and returns data, so it is fully unit-testable without touching the filesystem.
/// </summary>
public static class LmuResultsParser
{
    /// <summary>Parse a result document from its XML text.</summary>
    /// <exception cref="LmuResultParseException">The XML is malformed or missing the expected root.</exception>
    public static LmuSessionResult Parse(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
        {
            throw new LmuResultParseException("LMU result XML is empty.");
        }

        XDocument doc;
        try
        {
            doc = XDocument.Parse(xml);
        }
        catch (System.Xml.XmlException ex)
        {
            throw new LmuResultParseException("LMU result XML is not well-formed.", ex);
        }

        // Root is <rFactorXML><RaceResults>...; tolerate the RaceResults element appearing
        // either as the root itself or (normally) directly beneath rFactorXML.
        var raceResults = doc.Root?.Name.LocalName == "RaceResults"
            ? doc.Root
            : doc.Root?.Element("RaceResults");

        if (raceResults is null)
        {
            throw new LmuResultParseException("LMU result XML has no <RaceResults> element.");
        }

        // The session element is named after the session type (Race / Qualify / Practice1 / ...),
        // so identify it structurally as the child that actually holds <Driver> entries rather
        // than hard-coding every possible name.
        var sessionElement = raceResults.Elements().FirstOrDefault(e => e.Element("Driver") is not null);

        var rawSessionName = sessionElement?.Name.LocalName ?? "";
        var drivers = sessionElement is null
            ? []
            : sessionElement.Elements("Driver").Select(ParseDriver).ToList();

        return new LmuSessionResult
        {
            TrackVenue = raceResults.Element("TrackVenue")?.Value.Trim() ?? "",
            TrackCourse = raceResults.Element("TrackCourse")?.Value.Trim() ?? "",
            TrackLengthMeters = ParseNumber(raceResults.Element("TrackLength")?.Value),
            SessionType = ClassifySession(rawSessionName),
            RawSessionName = rawSessionName,
            SessionTimeUtc = ParseUnixSeconds(raceResults.Element("DateTime")?.Value),
            TimeString = raceResults.Element("TimeString")?.Value.Trim() ?? "",
            GameVersion = raceResults.Element("GameVersion")?.Value.Trim() ?? "",
            RaceLaps = (int)(ParseNumber(raceResults.Element("RaceLaps")?.Value) ?? 0),
            RaceTimeMinutes = ParseNumber(raceResults.Element("RaceTime")?.Value) ?? 0,
            Drivers = drivers,
        };
    }

    private static LmuDriverResult ParseDriver(XElement driver)
    {
        // Laps are direct <Lap> children of <Driver>. Note the sibling <Laps> element is a
        // scalar lap COUNT (e.g. <Laps>6</Laps>), not a wrapper, so it must not be descended into.
        var laps = driver
            .Elements("Lap")
            .Select(ParseLap)
            .ToList();

        return new LmuDriverResult
        {
            Name = driver.Element("Name")?.Value.Trim() ?? "",
            TeamName = driver.Element("TeamName")?.Value.Trim() ?? "",
            CarNumber = ParseInt(driver.Element("CarNumber")?.Value),
            CarClass = driver.Element("CarClass")?.Value.Trim() ?? "",
            CarType = driver.Element("CarType")?.Value.Trim() ?? "",
            Category = driver.Element("Category")?.Value.Trim() ?? "",
            VehicleName = driver.Element("VehName")?.Value.Trim() ?? "",
            IsPlayer = ParseInt(driver.Element("isPlayer")?.Value) == 1,
            GridPosition = ParseInt(driver.Element("GridPos")?.Value),
            FinishPosition = ParseInt(driver.Element("Position")?.Value),
            ClassGridPosition = ParseInt(driver.Element("ClassGridPos")?.Value),
            ClassPosition = ParseInt(driver.Element("ClassPosition")?.Value),
            BestLapTimeSeconds = ParseTime(driver.Element("BestLapTime")?.Value),
            PitStops = ParseInt(driver.Element("Pitstops")?.Value),
            FinishStatus = driver.Element("FinishStatus")?.Value.Trim() ?? "",
            Laps = laps,
        };
    }

    private static LmuLapResult ParseLap(XElement lap)
    {
        return new LmuLapResult
        {
            LapNumber = ParseInt(lap.Attribute("num")?.Value) ?? 0,
            Position = ParseInt(lap.Attribute("p")?.Value),
            LapTimeSeconds = ParseTime(lap.Value),
            ElapsedTimeSeconds = ParseTime(lap.Attribute("et")?.Value),
            Sector1Seconds = ParseTime(lap.Attribute("s1")?.Value),
            Sector2Seconds = ParseTime(lap.Attribute("s2")?.Value),
            Sector3Seconds = ParseTime(lap.Attribute("s3")?.Value),
            TopSpeedKph = ParseNumber(lap.Attribute("topspeed")?.Value),
            FrontCompound = ParseCompound(lap.Attribute("fcompound")?.Value),
            RearCompound = ParseCompound(lap.Attribute("rcompound")?.Value),
        };
    }

    private static LmuSessionType ClassifySession(string rawName)
    {
        // Names carry a trailing index (Practice1, Qualify2, ...), so match on prefix.
        if (rawName.StartsWith("Practice", StringComparison.OrdinalIgnoreCase)) return LmuSessionType.Practice;
        if (rawName.StartsWith("Qualify", StringComparison.OrdinalIgnoreCase)) return LmuSessionType.Qualifying;
        if (rawName.StartsWith("Warmup", StringComparison.OrdinalIgnoreCase)) return LmuSessionType.Warmup;
        if (rawName.StartsWith("Race", StringComparison.OrdinalIgnoreCase)) return LmuSessionType.Race;
        if (rawName.StartsWith("TestDay", StringComparison.OrdinalIgnoreCase)) return LmuSessionType.TestDay;
        return LmuSessionType.Unknown;
    }

    /// <summary>Parse a plain invariant-culture number, treating dash placeholders as absent.</summary>
    private static double? ParseNumber(string? raw)
    {
        if (IsBlankOrPlaceholder(raw)) return null;
        return double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    /// <summary>
    /// Parse a lap/sector/best time. The sim writes <c>--.----</c> (any run of '-' and '.')
    /// when no time exists; those and any non-positive value are treated as "no time".
    /// </summary>
    private static double? ParseTime(string? raw)
    {
        var value = ParseNumber(raw);
        return value is > 0 ? value : null;
    }

    private static int? ParseInt(string? raw)
    {
        if (IsBlankOrPlaceholder(raw)) return null;
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private static DateTimeOffset? ParseUnixSeconds(string? raw)
    {
        if (IsBlankOrPlaceholder(raw)) return null;
        return long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds)
            ? DateTimeOffset.FromUnixTimeSeconds(seconds)
            : null;
    }

    /// <summary>Compound attributes are "index,name" (e.g. "0,Medium"); return the name.</summary>
    private static string? ParseCompound(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var comma = raw.LastIndexOf(',');
        var name = (comma >= 0 ? raw[(comma + 1)..] : raw).Trim();
        return name.Length == 0 ? null : name;
    }

    /// <summary>True for null/whitespace or the sim's dash placeholders like <c>--.----</c>.</summary>
    private static bool IsBlankOrPlaceholder(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return true;
        foreach (var ch in raw)
        {
            if (ch != '-' && ch != '.' && !char.IsWhiteSpace(ch))
            {
                return false;
            }
        }

        return true;
    }
}
