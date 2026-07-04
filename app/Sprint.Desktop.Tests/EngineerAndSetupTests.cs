using System.Text.Json;
using Sprint.Desktop.Api.Engineer;
using Sprint.Desktop.Features.Engineer;
using Sprint.Desktop.Features.Setup;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class EngineerAndSetupTests
{
    private static List<EngineerControl> Controls() =>
    [
        new EngineerControl { Key = "tc", Label = "TC", CarValue = 4, StagedValue = 4 },
        new EngineerControl { Key = "abs", Label = "ABS", CarValue = 3, StagedValue = 5 },
    ];

    [Fact]
    public void DiffFlagsOnlyChangedControlsAsDirty()
    {
        var changes = EngineerStageService.Diff(Controls());
        Assert.Equal(2, changes.Count);
        Assert.False(changes.Single(c => c.Key == "tc").IsDirty);
        Assert.True(changes.Single(c => c.Key == "abs").IsDirty);

        var dirty = EngineerStageService.DirtyChanges(Controls());
        Assert.Equal("abs", Assert.Single(dirty).Key);
    }

    [Fact]
    public void PushAppliesStagedOntoCarAndRevertDiscards()
    {
        var controls = Controls();
        var applied = EngineerStageService.Push(controls);
        Assert.Equal("abs", Assert.Single(applied).Key);
        Assert.Equal(5, controls.Single(c => c.Key == "abs").CarValue);
        Assert.Equal(0, EngineerStageService.DirtyCount(controls));

        controls[1].StagedValue = 9;
        EngineerStageService.Revert(controls);
        Assert.Equal(5, controls[1].StagedValue); // staged reset to car
    }

    [Fact]
    public void SetTargetLapCommandRoundTripsThroughContractJson()
    {
        var command = EngineerStageService.SetTargetLap(82.531, lapNumber: 12, from: "engineer-1", timestampMs: 1000);
        Assert.Equal(EngineerCommandType.SetTargetLap, command.Type);

        var json = JsonSerializer.Serialize(command);
        Assert.Contains("\"type\":\"set_target_lap\"", json);
        Assert.Contains("\"lapTime\":82.531", json);

        using var doc = JsonDocument.Parse(json);
        Assert.Equal("engineer-1", doc.RootElement.GetProperty("from").GetString());
        Assert.Equal(1000, doc.RootElement.GetProperty("timestamp").GetInt64());
    }

    [Fact]
    public void SendNoteCommandCarriesText()
    {
        var command = EngineerStageService.SendNote("Box this lap", "engineer-1", 2000);
        var payload = Assert.IsType<NotePayload>(command.Payload);
        Assert.Equal("Box this lap", payload.Text);
        Assert.Equal(EngineerCommandType.SendNote, command.Type);
    }

    [Fact]
    public void SetupCompareReturnsZeroForIdenticalPrograms()
    {
        var a = new SetupProgram { Id = "a", Name = "A", Values = { ["fuelLoad"] = 40, ["rearWing"] = 6 } };
        var b = new SetupProgram { Id = "b", Name = "B", Values = { ["fuelLoad"] = 40, ["rearWing"] = 6 } };

        var prediction = SetupComparison.Compare(a, b);
        Assert.Equal(0, prediction.LapDeltaSeconds);
        Assert.Empty(prediction.Contributions);
    }

    [Fact]
    public void SetupCompareMorefuelPredictsSlowerCandidate()
    {
        var baseline = new SetupProgram { Id = "a", Name = "A", Values = { ["fuelLoad"] = 40 } };
        var heavy = new SetupProgram { Id = "b", Name = "B", Values = { ["fuelLoad"] = 60 } };

        var prediction = SetupComparison.Compare(baseline, heavy);
        Assert.True(prediction.LapDeltaSeconds > 0, "More fuel should predict a slower (positive delta) candidate.");
        Assert.Equal("fuelLoad", Assert.Single(prediction.Contributions).Key);
    }
}
