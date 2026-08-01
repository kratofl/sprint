using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for the Session Planner page (#100). These drive
/// <see cref="SessionPlannerController"/> directly, so the page's behaviour is covered
/// without launching Avalonia. Rendering is covered by the headless shell and visual
/// smoke tests.
/// </summary>
public sealed class SessionPlannerPageTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 31, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void WithNoPlansThePageIsEmptyAndTheSegmentedControlIsHidden()
    {
        Run((controller, _) =>
        {
            Assert.False(controller.HasPlans);
            Assert.Null(controller.PlanInView);
            Assert.False(controller.SegmentedControlVisible);
            Assert.Empty(controller.History);
        });
    }

    [Fact]
    public void TheMostRecentPlanIsInViewWhenNoneIsActive()
    {
        Run((controller, _) =>
        {
            controller.CreatePlan(NewRequest("First"));
            var second = controller.CreatePlan(NewRequest("Second"));

            Assert.True(controller.HasPlans);
            Assert.Equal(second.Id, controller.PlanInView?.Id);
            Assert.True(controller.SegmentedControlVisible);
        });
    }

    [Fact]
    public void TheActivePlanTakesPrecedenceOverTheMostRecentOne()
    {
        Run((controller, _) =>
        {
            var first = controller.CreatePlan(NewRequest("First"));
            controller.CreatePlan(NewRequest("Second"));
            controller.Arm(first.Id);

            Assert.Equal(first.Id, controller.PlanInView?.Id);
        });
    }

    [Fact]
    public void SelectingAPlanFromHistoryPutsItInView()
    {
        Run((controller, _) =>
        {
            var first = controller.CreatePlan(NewRequest("First"));
            controller.CreatePlan(NewRequest("Second"));

            controller.SelectPlan(first.Id);

            Assert.Equal(first.Id, controller.PlanInView?.Id);
        });
    }

    [Fact]
    public void HistoryListsEveryPlanNewestFirstIncludingCompletedOnes()
    {
        Run((controller, _) =>
        {
            var first = controller.CreatePlan(NewRequest("First"));
            var second = controller.CreatePlan(NewRequest("Second"));
            controller.StartNow(first.Id, SegmentKind.Race);
            controller.Stop(first.Id);

            Assert.Equal(new[] { second.Id, first.Id }, controller.History.Select(plan => plan.Id));
            Assert.Equal(PlanStatus.Completed, controller.History[1].Status);
        });
    }

    [Fact]
    public void ASkippedQualifyingTabStaysVisibleButDisabledAndTheRaceTabIsSelected()
    {
        Run((controller, _) =>
        {
            controller.CreatePlan(NewRequest("Race only", qualifyingIncluded: false));

            Assert.True(controller.SegmentedControlVisible);
            Assert.False(controller.QualifyingTabEnabled);
            Assert.Equal("Skipped", controller.QualifyingTabLabel);
            Assert.Equal(PlannerSegmentTab.Race, controller.SelectedTab);
        });
    }

    [Fact]
    public void SelectingADisabledQualifyingTabIsIgnored()
    {
        Run((controller, _) =>
        {
            controller.CreatePlan(NewRequest("Race only", qualifyingIncluded: false));

            controller.SelectTab(PlannerSegmentTab.Qualifying);

            Assert.Equal(PlannerSegmentTab.Race, controller.SelectedTab);
        });
    }

    [Fact]
    public void QualifyingIsSelectableAndDefaultWhenThePlanIncludesIt()
    {
        Run((controller, _) =>
        {
            controller.CreatePlan(NewRequest("Weekend"));

            Assert.True(controller.QualifyingTabEnabled);
            Assert.Equal("Qualifying", controller.QualifyingTabLabel);
            Assert.Equal(PlannerSegmentTab.Qualifying, controller.SelectedTab);

            controller.SelectTab(PlannerSegmentTab.Race);
            Assert.Equal(PlannerSegmentTab.Race, controller.SelectedTab);
        });
    }

    [Fact]
    public void StateChangesRaiseChangedSoTheShellCanRepaint()
    {
        Run((controller, _) =>
        {
            var raised = 0;
            controller.Changed += (_, _) => raised++;

            controller.CreatePlan(NewRequest("One"));
            controller.SelectTab(PlannerSegmentTab.Race);

            Assert.Equal(2, raised);
        });
    }

    [Fact]
    public void PrefillPrefersThePersistedLastSeenContext()
    {
        RunWithContext(
            new PlanContext("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps"),
            (controller, _) =>
            {
                controller.CreatePlan(NewRequest("Older", game: "Old game", track: "Monza"));

                var prefill = controller.Prefill();

                Assert.Equal("Le Mans Ultimate", prefill.Game);
                Assert.Equal("Porsche 963", prefill.Car);
                Assert.Equal("Spa-Francorchamps", prefill.Track);
            });
    }

    [Fact]
    public void PrefillFallsBackToTheMostRecentPlanWhenNoContextIsKnown()
    {
        Run((controller, _) =>
        {
            controller.CreatePlan(NewRequest("Recent", game: "Le Mans Ultimate", track: "Monza"));

            var prefill = controller.Prefill();

            Assert.Equal("Le Mans Ultimate", prefill.Game);
            Assert.Equal("Monza", prefill.Track);
        });
    }

    [Fact]
    public void PrefillIsEmptyWithNoContextAndNoPlans()
    {
        Run((controller, _) => Assert.True(controller.Prefill().IsEmpty));
    }

    [Fact]
    public void TheCreationFlowAsksForManualFuelValuesWhenNoHistoryExists()
    {
        Run((controller, _) =>
            Assert.False(controller.HasFuelHistory(new PlanContext("lmu", "963", "spa"))));
    }

    [Fact]
    public void TheCreationFlowSkipsTheManualFuelQuestionWhenHistoryExists()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var service = new SessionPlannerService(
                new LocalSessionPlanStore(root),
                clock: () => Now,
                idFactory: () => "id-1");
            var controller = new SessionPlannerController(
                service,
                new StubFuelHistory(hasHistory: true),
                () => PlanContext.Empty);

            Assert.True(controller.HasFuelHistory(new PlanContext("lmu", "963", "spa")));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void OnlyOnePlanMayBeActivatedAndTheReasonIsStatedForTheOthers()
    {
        Run((controller, _) =>
        {
            var active = controller.CreatePlan(NewRequest("Active"));
            var other = controller.CreatePlan(NewRequest("Other"));
            controller.Arm(active.Id);

            var availability = controller.CanActivate(other.Id);

            Assert.False(availability.CanActivate);
            Assert.Contains("Active", availability.Reason, StringComparison.Ordinal);
            Assert.True(controller.CanActivate(active.Id).CanActivate);
        });
    }

    [Fact]
    public void EveryPlanIsActivatableWhenTheSlotIsFree()
    {
        Run((controller, _) =>
        {
            var plan = controller.CreatePlan(NewRequest("Free"));

            Assert.True(controller.CanActivate(plan.Id).CanActivate);
            Assert.Equal("", controller.CanActivate(plan.Id).Reason);
        });
    }

    [Fact]
    public void TakeOverReleasesAnArmedHolderBackToDraftAndArmsTheNewPlan()
    {
        Run((controller, _) =>
        {
            var holder = controller.CreatePlan(NewRequest("Holder"));
            var next = controller.CreatePlan(NewRequest("Next"));
            controller.Arm(holder.Id);

            controller.TakeOver(next.Id);

            Assert.Equal(PlanStatus.Draft, holder.Status);
            Assert.Equal(PlanStatus.Armed, next.Status);
            Assert.Equal(next.Id, controller.ActivePlan?.Id);
        });
    }

    [Fact]
    public void TakeOverStopsATrackingHolderAndCompletesIt()
    {
        Run((controller, _) =>
        {
            var holder = controller.CreatePlan(NewRequest("Holder"));
            var next = controller.CreatePlan(NewRequest("Next"));
            controller.StartNow(holder.Id, SegmentKind.Race);

            controller.TakeOver(next.Id);

            Assert.Equal(PlanStatus.Completed, holder.Status);
            Assert.Equal(PlanStatus.Armed, next.Status);
        });
    }

    [Fact]
    public void TakeOverOnAFreeSlotSimplyArmsThePlan()
    {
        Run((controller, _) =>
        {
            var plan = controller.CreatePlan(NewRequest("Only"));

            controller.TakeOver(plan.Id);

            Assert.Equal(PlanStatus.Armed, plan.Status);
        });
    }

    [Fact]
    public void ARaceFormatMismatchWarningIsSurfacedForThePlanInView()
    {
        Run((controller, service) =>
        {
            var plan = controller.CreatePlan(NewRequest("Timed"));
            controller.StartNow(plan.Id, SegmentKind.Race);
            Assert.Null(controller.RaceFormatWarning);

            // Plan says time-based; telemetry reports MaxLaps > 0, i.e. lap-based.
            service.Ingest(new TelemetryFrame
            {
                Session = new SessionInfo { SessionType = SessionType.Race, MaxLaps = 20 },
                Lap = new LapState { CurrentLap = 1 },
            });

            Assert.NotNull(controller.RaceFormatWarning);
            Assert.Contains("LapBased", controller.RaceFormatWarning, StringComparison.Ordinal);
        });
    }

    [Fact]
    public void TimeBasedAndLapBasedPlansBothRoundTripThroughTheController()
    {
        Run((controller, _) =>
        {
            var timed = controller.CreatePlan(NewRequest("Timed"));
            Assert.Equal(RaceLengthFormat.TimeBased, timed.RaceLengthFormat);
            Assert.Equal(60, timed.RaceLengthValue);

            var lapped = controller.CreatePlan(new CreatePlanRequest
            {
                Name = "Lapped",
                RaceLengthFormat = RaceLengthFormat.LapBased,
                RaceLengthValue = 24,
            });
            Assert.Equal(RaceLengthFormat.LapBased, lapped.RaceLengthFormat);
            Assert.Equal(24, lapped.RaceLengthValue);
        });
    }

    [Fact]
    public void ADraftWithAPositiveRaceLengthAndReserveIsValid()
    {
        var draft = new NewPlanDraft
        {
            Name = "Spa",
            RaceLengthFormat = RaceLengthFormat.TimeBased,
            RaceLengthText = "60",
            FuelReserveText = "1",
        };

        Assert.True(draft.TryBuild(out var request, out var error));
        Assert.Equal("", error);
        Assert.Equal(60, request!.RaceLengthValue);
        Assert.Equal(1, request.FuelReserveLaps);
    }

    [Theory]
    [InlineData("0", "1", "Race length must be greater than zero.")]
    [InlineData("-5", "1", "Race length must be greater than zero.")]
    [InlineData("abc", "1", "Race length must be a number.")]
    [InlineData("60", "-1", "Fuel reserve cannot be negative.")]
    [InlineData("60", "abc", "Fuel reserve must be a whole number of laps.")]
    public void AnInvalidDraftReportsTheProblemAndBuildsNothing(
        string raceLength,
        string reserve,
        string expectedError)
    {
        var draft = new NewPlanDraft
        {
            Name = "Spa",
            RaceLengthFormat = RaceLengthFormat.TimeBased,
            RaceLengthText = raceLength,
            FuelReserveText = reserve,
        };

        Assert.False(draft.TryBuild(out var request, out var error));
        Assert.Null(request);
        Assert.Equal(expectedError, error);
    }

    [Fact]
    public void AnEmptyContextIsAllowedBecauseAPlanMayPrecedeDrivingTheCar()
    {
        var draft = new NewPlanDraft
        {
            Name = "Unknown car",
            RaceLengthFormat = RaceLengthFormat.LapBased,
            RaceLengthText = "24",
            FuelReserveText = "1",
        };

        Assert.True(draft.TryBuild(out var request, out _));
        Assert.Equal("", request!.Game);
        Assert.Equal("", request.Car);
        Assert.Equal("", request.Track);
    }

    [Fact]
    public void BlankManualFuelValuesStayUnsetRatherThanBecomingZero()
    {
        var draft = new NewPlanDraft
        {
            Name = "Spa",
            RaceLengthFormat = RaceLengthFormat.TimeBased,
            RaceLengthText = "60",
            FuelReserveText = "1",
            AvgLapTimeText = "",
            FuelPerLapText = "   ",
        };

        Assert.True(draft.TryBuild(out var request, out _));
        Assert.Null(request!.AvgLapTimeSeconds);
        Assert.Null(request.FuelPerLapLiters);
    }

    [Fact]
    public void NonNumericManualFuelValuesStayUnsetRatherThanWritingABogusEstimate()
    {
        var draft = new NewPlanDraft
        {
            Name = "Spa",
            RaceLengthFormat = RaceLengthFormat.TimeBased,
            RaceLengthText = "60",
            FuelReserveText = "1",
            AvgLapTimeText = "two minutes",
            FuelPerLapText = "lots",
        };

        Assert.True(draft.TryBuild(out var request, out _));
        Assert.Null(request!.AvgLapTimeSeconds);
        Assert.Null(request.FuelPerLapLiters);
    }

    [Fact]
    public void AnUnnamedDraftFallsBackToTheTrackAndCarForItsName()
    {
        var draft = new NewPlanDraft
        {
            Name = "",
            Car = "Porsche 963",
            Track = "Spa-Francorchamps",
            RaceLengthFormat = RaceLengthFormat.TimeBased,
            RaceLengthText = "60",
            FuelReserveText = "1",
        };

        Assert.True(draft.TryBuild(out var request, out _));
        Assert.Equal("Spa-Francorchamps – Porsche 963", request!.Name);
    }

    [Fact]
    public void ADraftCarriesItsErrorAndDisclosureStateAcrossAModalRebuild()
    {
        // The modal is torn down and rebuilt on every segmented/disclosure change, so both
        // the validation message and the open fuel section have to live on the draft.
        var draft = new NewPlanDraft { Name = "Spa", RaceLengthText = "", FuelReserveText = "1" };

        Assert.False(draft.TryBuild(out _, out var error));
        draft.Error = error;
        draft.FuelExpanded = true;

        Assert.Equal("Race length must be a number.", draft.Error);
        Assert.True(draft.FuelExpanded);
    }

    private sealed class StubFuelHistory(bool hasHistory) : IFuelHistorySource
    {
        public bool HasHistory(string game, string car, string track) => hasHistory;
    }

    private static CreatePlanRequest NewRequest(
        string name,
        bool qualifyingIncluded = true,
        string game = "Le Mans Ultimate",
        string car = "Porsche 963",
        string track = "Spa-Francorchamps") => new()
    {
        Name = name,
        Game = game,
        Car = car,
        Track = track,
        QualifyingIncluded = qualifyingIncluded,
        RaceLengthFormat = RaceLengthFormat.TimeBased,
        RaceLengthValue = 60,
    };

    private static void Run(Action<SessionPlannerController, SessionPlannerService> body)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var counter = 0;
            var service = new SessionPlannerService(
                new LocalSessionPlanStore(root),
                clock: () => Now,
                idFactory: () => $"id-{++counter}");
            var controller = new SessionPlannerController(
                service,
                NoFuelHistorySource.Instance,
                () => new PlanContext("", "", ""));
            body(controller, service);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static void RunWithContext(
        PlanContext context,
        Action<SessionPlannerController, SessionPlannerService> body)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var counter = 0;
            var service = new SessionPlannerService(
                new LocalSessionPlanStore(root),
                clock: () => Now,
                idFactory: () => $"id-{++counter}");
            var controller = new SessionPlannerController(
                service,
                NoFuelHistorySource.Instance,
                () => context);
            body(controller, service);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
