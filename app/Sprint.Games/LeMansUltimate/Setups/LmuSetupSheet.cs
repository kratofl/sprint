using System.Text;
using System.Text.RegularExpressions;
using Sprint.Desktop.Api.Games;

namespace Sprint.Games.LeMansUltimate.Setups;

/// <summary>
/// How Le Mans Ultimate's setup values read on Sprint's setup page: which tab and block each
/// <c>.svm</c> key belongs on, what it is called, and the readable value the game wrote beside
/// its index (<c>CamberSetting=30//-1.0 deg</c>).
/// </summary>
internal static partial class LmuSetupSheet
{
    /// <summary>
    /// What the game writes beside a setting the car cannot change. "N/V" is the German UI's
    /// "N/A": the label is in whatever language the game ran in when it saved.
    /// </summary>
    private static readonly HashSet<string> NotAdjustable = new(StringComparer.OrdinalIgnoreCase)
    {
        "N/A",
        "N/V",
        "Non-adjustable",
    };

    /// <summary>Per-corner sections, named as the setup page names the corner.</summary>
    private static readonly Dictionary<string, string> Corners = new(StringComparer.OrdinalIgnoreCase)
    {
        ["FRONTLEFT"] = "Front left",
        ["FRONTRIGHT"] = "Front right",
        ["REARLEFT"] = "Rear left",
        ["REARRIGHT"] = "Rear right",
    };

    /// <summary>Names for keys whose own name reads badly, without the trailing "Setting".</summary>
    private static readonly Dictionary<string, string> Labels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Fuel"] = "Fuel ratio",
        ["FuelCapacity"] = "Fuel",
        ["NumPitstops"] = "Pit stops",
        ["Pitstop1"] = "Pit stop 1",
        ["Pitstop2"] = "Pit stop 2",
        ["Pitstop3"] = "Pit stop 3",
        ["CGHeight"] = "Centre of gravity height",
        ["CGRight"] = "Centre of gravity sideways",
        ["CGRear"] = "Centre of gravity rearward",
        ["FW"] = "Front wing",
        ["RW"] = "Rear wing",
        ["BrakeDuct"] = "Front brake ducts",
        ["BrakeDuctRear"] = "Rear brake ducts",
        ["AntiSway"] = "Anti-roll bar",
        ["ToeIn"] = "Toe",
        ["3rdPacker"] = "Third packer",
        ["3rdSpring"] = "Third spring",
        ["3rdTenderSpring"] = "Third tender spring",
        ["3rdTenderTravel"] = "Third tender travel",
        ["3rdSlowBump"] = "Third slow bump",
        ["3rdFastBump"] = "Third fast bump",
        ["3rdSlowRebound"] = "Third slow rebound",
        ["3rdFastRebound"] = "Third fast rebound",
        ["SteerLock"] = "Steering lock",
        ["RearBrake"] = "Brake bias",
        ["TC"] = "Traction control",
        ["ABS"] = "ABS",
        ["TractionControlMap"] = "TC map",
        ["TCPowerCutMap"] = "TC power cut",
        ["TCSlipAngleMap"] = "TC slip angle",
        ["AntilockBrakeSystemMap"] = "ABS map",
        ["RegenerationMap"] = "Regen level",
        ["ElectricMotorMap"] = "Electric motor",
        ["EngineMixture"] = "Mixture",
        ["EngineBrakingMap"] = "Engine braking",
        ["RatioSet"] = "Gear set",
        ["RearSplit"] = "Torque split",
        ["GearAutoUpShift"] = "Auto upshift",
        ["GearAutoDownShift"] = "Auto downshift",
        ["Pressure"] = "Tyre pressure",
        ["Packer"] = "Packers",
        ["BrakePad"] = "Brake pads",
        ["HandfrontbrakePress"] = "Front handbrake",
        ["HandbrakePress"] = "Handbrake",
    };

    /// <summary>Folder names the game runs together, as the track is called.</summary>
    private static readonly Dictionary<string, string> Tracks = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Lemans"] = "Le Mans",
        ["Paulricard"] = "Paul Ricard",
        ["Lagunaseca"] = "Laguna Seca",
        ["Longbeach"] = "Long Beach",
    };

    /// <summary>The classes a vehicle descriptor can name; anything else in it is the car or season.</summary>
    private static readonly Dictionary<string, string> Classes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Hypercar"] = "Hypercar",
        ["LMP2"] = "LMP2",
        ["LMP2_ELMS"] = "LMP2",
        ["LMP3"] = "LMP3",
        ["GT3"] = "GT3",
        ["LMGT3"] = "GT3",
        ["GTE"] = "GTE",
    };

    public static GameSetupReading? Describe(GameSetupValue value)
    {
        // A setting is `<index>//<readable value>`; a line without the pair (the car header,
        // notes, the symmetric flag, the BASIC sliders) is not one the driver sets.
        int separator = value.RawValue.IndexOf("//", StringComparison.Ordinal);
        if (separator < 0 || value.Section.Equals("BASIC", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        string display = value.RawValue[(separator + 2)..].Trim();
        if (display.Length == 0 || NotAdjustable.Contains(display))
        {
            return null;
        }

        int? step = int.TryParse(value.RawValue[..separator].Trim(), out int parsed) ? parsed : null;
        string key = value.Key.EndsWith("Setting", StringComparison.Ordinal) ? value.Key[..^"Setting".Length] : value.Key;
        (SetupTab tab, string group, string name) = Place(value.Section, key);
        return new GameSetupReading(value.Section, value.Key, tab, group, name, display, step);
    }

    public static GameSetupVehicle DescribeVehicle(string vehicleDescriptor)
    {
        string? carClass = null;
        string? season = null;
        List<string> car = [];
        foreach (string token in vehicleDescriptor.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (carClass is null && Classes.TryGetValue(token, out string? named))
            {
                carClass = named;
            }
            else if (season is null && SeasonPattern().Match(token) is { Success: true } match)
            {
                season = $"{match.Groups[1].Value} {match.Groups[2].Value}";
            }
            else
            {
                car.Add(token.Replace('_', ' '));
            }
        }

        return new GameSetupVehicle(car.Count > 0 ? string.Join(' ', car) : vehicleDescriptor, carClass, season);
    }

    public static string TrackName(string track) =>
        Tracks.TryGetValue(track, out string? name) ? name : track.Replace('_', ' ');

    /// <summary>The tab, block and name a key is shown under, from the section the game filed it in.</summary>
    private static (SetupTab Tab, string Group, string Label) Place(string section, string key)
    {
        if (Corners.TryGetValue(section, out string? corner))
        {
            SetupTab tab = key switch
            {
                "Pressure" or "Compound" or "BrakeDisc" or "BrakePad" => SetupTab.WheelsAndBrakes,
                _ when IsDamper(key) => SetupTab.Dampers,
                _ => SetupTab.Suspension,
            };
            return (tab, corner, Label(key));
        }

        return section.ToUpperInvariant() switch
        {
            "GENERAL" when key.StartsWith("Fuel", StringComparison.Ordinal)
                || key.StartsWith("Pitstop", StringComparison.Ordinal)
                || key is "VirtualEnergy" or "NumPitstops" => (SetupTab.Power, "Fuel and energy", Label(key)),
            "GENERAL" => (SetupTab.ChassisAndAero, "Chassis", Label(key)),
            "LEFTFENDER" => (SetupTab.ChassisAndAero, "Bodywork", "Left fender flare"),
            "RIGHTFENDER" => (SetupTab.ChassisAndAero, "Bodywork", "Right fender flare"),
            "FRONTWING" or "REARWING" => (SetupTab.ChassisAndAero, "Aero", Label(key)),
            "BODYAERO" => (SetupTab.ChassisAndAero, "Cooling", Label(key)),
            "SUSPENSION" => PlaceSuspension(key),
            "CONTROLS" when key is "SteerLock" => (SetupTab.ChassisAndAero, "Steering", Label(key)),
            "CONTROLS" when key.StartsWith("TC", StringComparison.Ordinal) || key.StartsWith("Traction", StringComparison.Ordinal) =>
                (SetupTab.Power, "Electronics", Label(key)),
            "CONTROLS" => (SetupTab.WheelsAndBrakes, "Brakes", Label(key)),
            "ENGINE" when key is "RegenerationMap" or "ElectricMotorMap" => (SetupTab.Power, "Hybrid", Label(key)),
            "ENGINE" => (SetupTab.Power, "Engine", Label(key)),
            // The block already says differential, so its rows are "Power", "Coast", "Preload".
            "DRIVELINE" when key.StartsWith("FrontDiff", StringComparison.Ordinal) =>
                (SetupTab.Power, "Front differential", Label(key["FrontDiff".Length..])),
            "DRIVELINE" when key.StartsWith("Diff", StringComparison.Ordinal) => (SetupTab.Power, "Differential", Label(key["Diff".Length..])),
            "DRIVELINE" when key is "RearSplit" => (SetupTab.Power, "Differential", Label(key)),
            "DRIVELINE" => (SetupTab.Power, "Gearbox", Label(key)),
            _ => (SetupTab.ChassisAndAero, "Other", Label(key)),
        };
    }

    /// <summary>
    /// The SUSPENSION section mixes both axles, both sides and the dampers of the third
    /// elements: the key's own prefix says which.
    /// </summary>
    private static (SetupTab Tab, string Group, string Label) PlaceSuspension(string key)
    {
        if (key.StartsWith("ChassisAdj", StringComparison.Ordinal))
        {
            return (SetupTab.ChassisAndAero, "Chassis", $"Chassis adjuster {key["ChassisAdj".Length..]}");
        }

        foreach ((string prefix, string group) in new[] { ("Front", "Front"), ("Rear", "Rear"), ("Left", "Front left"), ("Right", "Front right") })
        {
            if (key.StartsWith(prefix, StringComparison.Ordinal))
            {
                string rest = key[prefix.Length..];
                return (IsDamper(rest) ? SetupTab.Dampers : SetupTab.Suspension, group, Label(rest));
            }
        }

        return (SetupTab.Suspension, "Chassis", Label(key));
    }

    private static bool IsDamper(string key) =>
        key.EndsWith("SlowBump", StringComparison.Ordinal) || key.EndsWith("FastBump", StringComparison.Ordinal)
        || key.EndsWith("SlowRebound", StringComparison.Ordinal) || key.EndsWith("FastRebound", StringComparison.Ordinal);

    /// <summary>A key's name: from <see cref="Labels"/>, or its words in sentence case ("RideHeight" → "Ride height").</summary>
    private static string Label(string key)
    {
        if (Labels.TryGetValue(key, out string? label))
        {
            return label;
        }

        StringBuilder words = new(key.Length + 4);
        for (int index = 0; index < key.Length; index++)
        {
            char c = key[index];
            bool startsWord = index > 0 && char.IsUpper(c) && !char.IsUpper(key[index - 1]);
            bool startsNumber = index > 0 && char.IsDigit(c) && !char.IsDigit(key[index - 1]);
            if (startsWord || startsNumber)
            {
                words.Append(' ');
            }

            words.Append(index == 0 ? c : startsWord ? char.ToLowerInvariant(c) : c);
        }

        return words.ToString();
    }

    [GeneratedRegex("^(WEC|ELMS)(\\d{4})$", RegexOptions.IgnoreCase)]
    private static partial Regex SeasonPattern();
}
