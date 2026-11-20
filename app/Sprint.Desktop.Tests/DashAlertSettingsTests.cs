using System.Text.Json;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>The app-wide alert settings: read leniently from settings.json, and stamped onto a copy of a dash.</summary>
public sealed class DashAlertSettingsTests
{
    // As DesktopRuntime reads and writes settings.json.
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true, WriteIndented = true };

    [Fact]
    public void ASettingsFileWithoutAlertsHasEveryTypeAtItsDefaultInOrder()
    {
        AppSettings settings = Read("{}");

        Assert.Equal(
            ["tc_change", "abs_change", "bias_change", "enginemap_change", "migration_change", "arb_change", "dial_change",
             "pit_limiter", "launch", "flag", "penalty", "damage", "engine_warning", "fuel_low", "pit_now", "lift_now", "lap_summary"],
            settings.DashAlerts.Alerts.Select(alert => alert.Type));
        Assert.Equal(DashAlertTypes.Defaults, settings.DashAlerts.Alerts);
        Assert.Equal(DashAlertTypes.Defaults, Read("""{"dashAlerts":null}""").DashAlerts.Alerts);
        Assert.Equal(DashAlertTypes.Defaults, Read("""{"dashAlerts":"nonsense"}""").DashAlerts.Alerts);

        // Each type's own numbers at their defaults, and no other type's.
        AppDashAlerts alerts = settings.DashAlerts;
        Assert.Equal((2, 4), (alerts.Of("fuel_low").LapsLeft, alerts.Of("fuel_low").WarningLapsLeft));
        DashAlertSettings launch = alerts.Of("launch");
        Assert.Equal((50, 10, 5000, 6000, 20, 30), (launch.ClutchPercent, launch.SpeedKmh, launch.RpmFrom, launch.RpmTo, launch.ThrottleFrom, launch.ThrottleTo));
        Assert.Equal(220, alerts.Of("lift_now").LiftPoint);
        Assert.Equal(new DashAlertSettings("pit_now", true, DashAlertSize.Strip, false, 5, true), alerts.Of("pit_now"));
    }

    [Fact]
    public void StoredAlertsAreReadLenientlyAndClampedIntoRange()
    {
        AppSettings settings = Read("""
            {"dashAlerts":{"alerts":[
              {"type":"future_alert","enabled":false},
              {"type":"penalty","enabled":false,"size":"huge","invertColors":"yes","durationSeconds":99,"untilAck":false},
              {"type":"lap_summary","durationSeconds":20},
              {"type":"flag","durationSeconds":0},
              {"type":"fuel_low","lapsLeft":42},
              {"type":"launch","rpmFrom":7000,"rpmTo":3000,"clutchPercent":0,"liftPoint":100},
              {"type":"tc_change","size":"strip","lapsLeft":3},
              {"type":"penalty","enabled":true}
            ]}}
            """);

        AppDashAlerts alerts = settings.DashAlerts;
        Assert.Equal(DashAlertTypes.Defaults.Count, alerts.Alerts.Count);
        Assert.DoesNotContain(alerts.Alerts, alert => alert.Type == "future_alert");
        // The first entry of a type wins; a field of the wrong kind keeps its default.
        Assert.Equal(new DashAlertSettings("penalty", false, DashAlertSize.Full, true, 30, false), alerts.Of("penalty"));
        Assert.Equal(15, alerts.Of("lap_summary").DurationSeconds);
        Assert.Equal(1, alerts.Of("flag").DurationSeconds);
        Assert.Equal((9, 9), (alerts.Of("fuel_low").LapsLeft, alerts.Of("fuel_low").WarningLapsLeft));
        DashAlertSettings launch = alerts.Of("launch");
        Assert.Equal((5, 7000, 7000, (int?)null), (launch.ClutchPercent, launch.RpmFrom, launch.RpmTo, launch.LiftPoint));
        Assert.Equal(new DashAlertSettings("tc_change", true, DashAlertSize.Strip, false, 2, false), alerts.Of("tc_change"));
        Assert.Equal(DashAlertTypes.DefaultOf("abs_change"), alerts.Of("abs_change"));
    }

    [Fact]
    public void WrittenAlertsReadBackTheSame()
    {
        AppSettings settings = new()
        {
            DashAlerts = AppDashAlerts.Default
                .With(new DashAlertSettings("fuel_low", true, DashAlertSize.Full, true, 7.5, false, 4))
                .With(new DashAlertSettings("arb_change", true, DashAlertSize.Strip, false, 2, true))
                .With(new DashAlertSettings("launch", true, DashAlertSize.Full, false, 5, true, RpmFrom: 4500, RpmTo: 6500)),
        };

        string written = JsonSerializer.Serialize(settings, Json);
        AppSettings reread = Read(written);

        Assert.Equal(settings.DashAlerts.Alerts, reread.DashAlerts.Alerts);
        Assert.Contains("\"size\": \"full\"", written, StringComparison.Ordinal);
        Assert.Contains("\"lapsLeft\": 4", written, StringComparison.Ordinal);
        Assert.Contains("\"rpmTo\": 6500", written, StringComparison.Ordinal);
    }

    [Fact]
    public void StampingGivesACopyEveryAlertAndLeavesTheDashAlone()
    {
        DashAlertConfig ownConfig = new() { DisplayMode = "center", DurationSeconds = 9 };
        DashAlert ownAlert = new() { Id = "mine", Type = "tc_change", DisplayMode = "center" };
        DashLayout layout = new()
        {
            Id = "dash",
            Pages = [new DashPage { Id = "main" }],
            Alerts = [ownAlert],
            AlertConfig = ownConfig,
        };
        AppDashAlerts alerts = AppDashAlerts.Default.With(new DashAlertSettings("fuel_low", true, DashAlertSize.Strip, false, 3, true, 5));

        DashLayout stamped = alerts.Stamp(layout);

        Assert.NotSame(layout, stamped);
        Assert.Same(layout.Pages, stamped.Pages);
        Assert.Null(stamped.AlertConfig);
        Assert.Equal(DashAlertTypes.Defaults.Select(alert => alert.Type), stamped.Alerts.Select(alert => alert.Type));
        Assert.All(stamped.Alerts, alert => Assert.Equal(alert.Type, alert.Id));
        DashAlert fuel = stamped.Alerts.Single(alert => alert.Type == "fuel_low");
        Assert.Equal(("strip", true, 5, 3.0), (fuel.DisplayMode, fuel.UntilAck, fuel.LapsLeft, fuel.DurationSeconds));
        DashAlert penalty = stamped.Alerts.Single(alert => alert.Type == "penalty");
        Assert.Equal(("full", true, true, (int?)null), (penalty.DisplayMode, penalty.InvertColors, penalty.UntilAck, penalty.LapsLeft));
        Assert.False(stamped.Alerts.Single(alert => alert.Type == "arb_change").Enabled);

        // The stored dash keeps its own alerts and config.
        Assert.Same(ownAlert, Assert.Single(layout.Alerts));
        Assert.Same(ownConfig, layout.AlertConfig);

        // What the renderer reads: the new fields by name, untilAck and lapsLeft left out where unset.
        string json = JsonSerializer.Serialize(stamped);
        Assert.Contains("\"lapsLeft\":5,\"warningLapsLeft\":5", json, StringComparison.Ordinal);
        Assert.Contains("\"liftPoint\":220", json, StringComparison.Ordinal);
        Assert.Contains("\"clutchPercent\":50,\"speedKmh\":10,\"rpmFrom\":5000,\"rpmTo\":6000,\"throttleFrom\":20,\"throttleTo\":30", json, StringComparison.Ordinal);
        Assert.Equal(7, json.Split("\"untilAck\":true").Length - 1);
        Assert.DoesNotContain("\"untilAck\":false", json, StringComparison.Ordinal);
    }

    private static AppSettings Read(string json) =>
        JsonSerializer.Deserialize<AppSettings>(json, Json) ?? throw new InvalidOperationException("no settings");
}
