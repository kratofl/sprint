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
             "pit_limiter", "flag", "penalty", "damage", "engine_warning", "fuel_low", "lap_summary"],
            settings.DashAlerts.Alerts.Select(alert => alert.Type));
        Assert.Equal(DashAlertTypes.Defaults, settings.DashAlerts.Alerts);
        Assert.Equal(DashAlertTypes.Defaults, Read("""{"dashAlerts":null}""").DashAlerts.Alerts);
        Assert.Equal(DashAlertTypes.Defaults, Read("""{"dashAlerts":"nonsense"}""").DashAlerts.Alerts);
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
        Assert.Equal(9, alerts.Of("fuel_low").LapsLeft);
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
                .With(new DashAlertSettings("arb_change", true, DashAlertSize.Strip, false, 2, true)),
        };

        string written = JsonSerializer.Serialize(settings, Json);
        AppSettings reread = Read(written);

        Assert.Equal(settings.DashAlerts.Alerts, reread.DashAlerts.Alerts);
        Assert.Contains("\"size\": \"full\"", written, StringComparison.Ordinal);
        Assert.Contains("\"lapsLeft\": 4", written, StringComparison.Ordinal);
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
        Assert.Contains("\"lapsLeft\":5", json, StringComparison.Ordinal);
        Assert.Equal(4, json.Split("\"untilAck\":true").Length - 1);
        Assert.DoesNotContain("\"untilAck\":false", json, StringComparison.Ordinal);
    }

    private static AppSettings Read(string json) =>
        JsonSerializer.Deserialize<AppSettings>(json, Json) ?? throw new InvalidOperationException("no settings");
}
