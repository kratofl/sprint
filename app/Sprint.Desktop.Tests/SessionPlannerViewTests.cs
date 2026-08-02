using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.LogicalTree;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// View-level tests for the Session Planner page. Behaviour lives in
/// <see cref="SessionPlannerController"/> and is unit-tested there; these cover what only a
/// rendered page can show.
/// </summary>
public class SessionPlannerViewTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task TheImportEntryPointHidesItselfForAGameThatArchivesNothing()
    {
        await Dispatch(() =>
        {
            // #180's rule: null capability means "this game cannot", and the surface adapts
            // rather than offering an action that can only answer with an apology.
            var withArchive = HeaderLabels(canImportResults: true);
            var without = HeaderLabels(canImportResults: false);

            Assert.Contains("Import results", withArchive);
            Assert.DoesNotContain("Import results", without);
            // The rest of the header is unaffected.
            Assert.Contains("Quick plan", without);
            Assert.Contains("New plan", without);
        });
    }

    private static List<string> HeaderLabels(bool canImportResults)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var controller = new SessionPlannerController(
                new SessionPlannerService(new LocalSessionPlanStore(root), clock: () => Now),
                NoFuelHistorySource.Instance,
                () => PlanContext.Empty);
            var view = new SessionPlannerView(
                controller,
                new SessionPlannerViewCallbacks(
                    () => { },
                    (_, _, _, _, _) => { },
                    () => { },
                    () => { },
                    canImportResults));

            // Header actions are buttons whose Content is the label string, so text blocks
            // alone would miss exactly the thing under test.
            var tree = view.Build().GetLogicalDescendants().ToList();
            return
            [
                .. tree.OfType<TextBlock>().Select(block => block.Text ?? ""),
                .. tree.OfType<Button>().Select(button => button.Content as string ?? ""),
            ];
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task AQuickPlanStaysMarkedAsQuickAfterTheModalCloses()
    {
        await Dispatch(() => WithView(PlanMode.Quick, text =>
        {
            // #102 reads confidence from the mode, so the driver has to be able to see which
            // flow produced the plan they are looking at.
            Assert.Contains("Quick plan", text);
        }));
    }

    [Fact]
    public async Task AFullyPlannedPlanIsNotLabelledWithAModeChip()
    {
        await Dispatch(() => WithView(PlanMode.Planned, text =>
        {
            // Planned is the norm; a chip on every plan would be noise. The header's
            // "Quick plan" button is outside the card, so this is unambiguous.
            Assert.DoesNotContain("Quick plan", text);
        }));
    }

    [Fact]
    public async Task TheTargetSelectorShowsEachScopeWithItsTimeSampleSizeAndTier()
    {
        await Dispatch(() => WithView(PlanMode.Planned, text =>
        {
            // The rendered card has to carry the honest parts of every option: the scope with
            // the qualifying session's timestamp, the resolved times, and the tier.
            Assert.Contains("Qualifying lap-time target", text);
            Assert.Contains("Current Quali · 2026-07-31 18:20", text);
            Assert.Contains("Fastest · 2:11.0", text);
            Assert.Contains("Median · 2:13.0", text);
            Assert.Contains("3 laps", text);
        }, WithCorpus()));
    }

    [Fact]
    public async Task WithNoHistoryTheSelectorSaysSoInsteadOfOfferingNothing()
    {
        await Dispatch(() => WithView(PlanMode.Planned, text =>
        {
            Assert.Contains(PlanTargetChoices.NoHistoryMessage, text);
            Assert.Contains("No target set", text);
            Assert.DoesNotContain("Current Quali", text);
        }));
    }

    [Fact]
    public async Task ALapTimeCannotBeTypedInAnymoreOnlyChosenFromRecordedLaps()
    {
        await Dispatch(() => WithViewCard(PlanMode.Planned, card =>
        {
            // A lap time is something a car did, not something a driver decides at a desk —
            // the free-text entry is gone from the target section.
            var target = card.GetLogicalDescendants()
                .OfType<Border>()
                .First(border => border.Tag as string == SessionPlannerView.TargetSectionTag);
            Assert.Empty(target.GetLogicalDescendants().OfType<TextBox>());
        }, WithCorpus()));
    }

    [Fact]
    public async Task TheStatisticRowOffersSpecificAndOnlyThenShowsTheLapList()
    {
        await Dispatch(() => WithViewCard(PlanMode.Planned, card =>
        {
            // Fastest, Median, Slowest, Specific — the lap list stays out of the way until
            // the driver says they want one specific lap.
            Assert.NotNull(FindButton(card, "Specific"));
            Assert.DoesNotContain(
                card.GetLogicalDescendants().OfType<Border>(),
                border => border.Tag as string == SessionPlannerView.SpecificLapListTag);
            Assert.Empty(card.GetLogicalDescendants().OfType<ComboBox>().Skip(1));
        }, WithCorpus()));
    }

    [Fact]
    public async Task ChoosingSpecificOpensAScrollableListOfEveryRecordedLap()
    {
        await Dispatch(() => WithViewCard(PlanMode.Planned, card =>
        {
            var list = card.GetLogicalDescendants()
                .OfType<Border>()
                .First(border => border.Tag as string == SessionPlannerView.SpecificLapListTag);

            // The corpus can hold hundreds of laps for a context, so this is a list that
            // scrolls, never a dropdown that would grow past the screen.
            Assert.NotEmpty(list.GetLogicalDescendants().OfType<ScrollViewer>());
            var rows = list.GetLogicalDescendants()
                .OfType<Button>()
                .Select(ButtonLabel)
                .ToList();
            Assert.Equal(3, rows.Count);
            Assert.Contains(rows, row => row.Contains("2:11.0"));
            Assert.Contains(rows, row => row.Contains("2:18.0"));
        }, WithCorpus(), specificOpen: true));
    }

    [Fact]
    public async Task ATargetEditedDuringALiveSessionSaysItAppliesFromTheNextLap()
    {
        await Dispatch(() => WithView(PlanMode.Planned, text =>
        {
            // Targets latch at the start/finish line (#189). Without the notice, a driver who
            // retargets on lap 12 would read lap 12's delta as being against the new target.
            Assert.Contains("Applies from the next lap", text);
        }, WithCorpus(), tracking: true));
    }

    [Fact]
    public async Task ATargetEditedBeforeTheSessionStartsCarriesNoNextLapNotice()
    {
        await Dispatch(() => WithView(PlanMode.Planned, text =>
        {
            Assert.DoesNotContain("Applies from the next lap", text);
        }, WithCorpus()));
    }

    [Fact]
    public async Task ThePageLandsOnAnOverviewOfOpenAndCompletedPlansWithThumbnails()
    {
        await Dispatch(() => WithOverview((controller, page, _) =>
        {
            var text = PageText(page);

            // Landing shows the shelf, not the inside of a plan.
            Assert.DoesNotContain(
                page.GetLogicalDescendants().OfType<Border>(),
                border => border.Tag as string == SessionPlannerView.PlanCardTag);
            Assert.Contains("Open plans", text);
            Assert.Contains("Completed", text);
            Assert.Contains("Second", text);
            Assert.Contains("First", text);

            // Every collapsed plan row carries a thumbnail.
            var thumbs = page.GetLogicalDescendants()
                .OfType<Border>()
                .Count(border => border.Tag as string == SessionPlannerView.PlanThumbnailTag);
            Assert.Equal(2, thumbs);

            // Opening a collapsed plan selects it; the shell repaint then shows the card.
            FindButton(page, "Open")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
            Assert.NotNull(controller.PlanInView);
        }));
    }

    [Fact]
    public async Task EveryCollapsedPlanCanBeDeletedBehindADangerConfirm()
    {
        await Dispatch(() => WithOverview((controller, page, confirm) =>
        {
            // Two plans, two delete affordances — completed plans are deletable too.
            var deletes = page.GetLogicalDescendants()
                .OfType<Button>()
                .Where(button => ToolTip.GetTip(button) as string == "Delete plan")
                .ToList();
            Assert.Equal(2, deletes.Count);

            // The click asks first, wearing the destructive tone; nothing is deleted yet.
            deletes[0].RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
            Assert.NotNull(confirm.Title);
            Assert.Contains("Delete", confirm.Title);
            Assert.Equal(ButtonTone.Danger, confirm.Tone);
            Assert.Equal(2, controller.History.Count);

            confirm.Accept!();
            Assert.Single(controller.History);
        }));
    }

    [Fact]
    public async Task AnOpenPlanCarriesAWayBackToTheOverview()
    {
        await Dispatch(() => WithOverview((controller, _, _) =>
        {
            controller.SelectPlan("id-1");
            var page = BuildPage(controller);

            Assert.Contains(
                page.GetLogicalDescendants().OfType<Border>(),
                border => border.Tag as string == SessionPlannerView.PlanCardTag);

            FindButton(page, "All plans")!.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
            Assert.Null(controller.PlanInView);
        }));
    }

    private static void WithOverview(Action<SessionPlannerController, Control, CapturedConfirm> assert)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var counter = 0;
            var service = new SessionPlannerService(
                new LocalSessionPlanStore(root),
                clock: () => Now,
                idFactory: () => $"id-{++counter}");
            service.CreatePlan(new CreatePlanRequest
            {
                Name = "First",
                RaceLengthFormat = RaceLengthFormat.TimeBased,
                RaceLengthValue = 360,
            });
            service.CreatePlan(new CreatePlanRequest
            {
                Name = "Second",
                RaceLengthFormat = RaceLengthFormat.TimeBased,
                RaceLengthValue = 60,
            });
            service.StartTracking("id-1", SegmentKind.Race);
            service.StopTracking("id-1");

            var controller = new SessionPlannerController(
                service,
                NoFuelHistorySource.Instance,
                () => PlanContext.Empty,
                clock: () => Now);

            var confirm = new CapturedConfirm();
            assert(controller, BuildPage(controller, confirm), confirm);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static Control BuildPage(SessionPlannerController controller, CapturedConfirm? confirm = null) =>
        new SessionPlannerView(
                controller,
                new SessionPlannerViewCallbacks(
                    () => { },
                    (title, _, _, tone, accept) =>
                    {
                        if (confirm is not null)
                        {
                            confirm.Title = title;
                            confirm.Tone = tone;
                            confirm.Accept = accept;
                        }
                    },
                    () => { },
                    () => { },
                    true))
            .Build();

    private static string PageText(Control page) => string.Join(
        " | ",
        page.GetLogicalDescendants()
            .OfType<TextBlock>()
            .Select(block => block.Text ?? "")
            .Concat(page.GetLogicalDescendants()
                .OfType<Button>()
                .Select(ButtonLabel)));

    [Fact]
    public async Task OnlyTheNextStepIsAPrimaryStartAndSkippingQualifyingNeedsAConfirm()
    {
        await Dispatch(() => WithPlannerPage(qualifyingIncluded: true, (service, card, confirm) =>
        {
            var qualifying = FindButton(card, "Start Qualifying now");
            var race = FindButton(card, "Start Race now");
            Assert.NotNull(qualifying);
            Assert.NotNull(race);

            // One primary action per card: the next step draws the eye, the skip does not.
            Assert.Equal(Graphite.AccentBrush, qualifying!.Background);
            Assert.NotEqual(Graphite.AccentBrush, race!.Background);

            // Starting the race now would skip the planned qualifying, so the click asks
            // instead of acting; nothing starts until the confirm is answered.
            race.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
            Assert.Equal(PlanStatus.Draft, service.Find("id-1")!.Status);
            Assert.NotNull(confirm.Title);
            Assert.Contains("qualifying", confirm.Title, StringComparison.OrdinalIgnoreCase);

            confirm.Accept!();
            var plan = service.Find("id-1")!;
            Assert.Equal(PlanStatus.Tracking, plan.Status);
            Assert.Equal(SegmentKind.Race, plan.Segments[^1].Kind);
        }));
    }

    [Fact]
    public async Task ARaceOnlyPlanOffersNoQualifyingStartAndTheRaceStartsWithoutAConfirm()
    {
        await Dispatch(() => WithPlannerPage(qualifyingIncluded: false, (service, card, confirm) =>
        {
            // An action whose only possible answer is "this plan has no qualifying" is not
            // offered at all, and the race is the next step — primary, no warning.
            Assert.Null(FindButton(card, "Start Qualifying now"));
            var race = FindButton(card, "Start Race now");
            Assert.NotNull(race);
            Assert.Equal(Graphite.AccentBrush, race!.Background);

            race.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
            Assert.Null(confirm.Title);
            Assert.Equal(PlanStatus.Tracking, service.Find("id-1")!.Status);
        }));
    }

    private sealed class CapturedConfirm
    {
        public string? Title { get; set; }

        public ButtonTone Tone { get; set; }

        public Action? Accept { get; set; }
    }

    private static void WithPlannerPage(
        bool qualifyingIncluded,
        Action<SessionPlannerService, Border, CapturedConfirm> assert)
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
                () => PlanContext.Empty,
                clock: () => Now);
            controller.CreatePlan(new CreatePlanRequest
            {
                Name = "Spa 6h",
                Track = "Spa-Francorchamps",
                Car = "Porsche 963",
                QualifyingIncluded = qualifyingIncluded,
                RaceLengthFormat = RaceLengthFormat.TimeBased,
                RaceLengthValue = 360,
            });

            var confirm = new CapturedConfirm();
            var card = new SessionPlannerView(
                    controller,
                    new SessionPlannerViewCallbacks(
                        () => { },
                        (title, _, _, _, accept) =>
                        {
                            confirm.Title = title;
                            confirm.Accept = accept;
                        },
                        () => { },
                        () => { },
                        true))
                .Build()
                .GetLogicalDescendants()
                .OfType<Border>()
                .First(border => border.Tag as string == SessionPlannerView.PlanCardTag);

            assert(service, card, confirm);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    /// <summary>Finds a button by its visible label, whether the content is a plain string or
    /// a panel carrying an icon beside a text block.</summary>
    private static Button? FindButton(Control root, string label) =>
        root.GetLogicalDescendants()
            .OfType<Button>()
            .FirstOrDefault(button => ButtonLabel(button) == label);

    private static string ButtonLabel(Button button) => button.Content switch
    {
        string text => text,
        TextBlock block => block.Text ?? "",
        Control content => string.Concat(
            content.GetLogicalDescendants()
                .OfType<TextBlock>()
                .Select(block => block.Text)
                .Prepend((content as TextBlock)?.Text)),
        _ => "",
    };

    /// <summary>
    /// A qualifying session on 31 Jul with laps [131, 133, 138] for the test plan's context.
    /// </summary>
    private static ILapHistoryStore WithCorpus() => new FakeLapHistoryStore(
    [
        new LapHistorySession
        {
            Id = "hs-q",
            Kind = HistorySessionKind.Qualifying,
            StartedAt = new DateTimeOffset(2026, 7, 31, 18, 20, 0, TimeSpan.Zero),
            Context = new LapHistoryContext { TrackCourse = "Spa-Francorchamps", CarModel = "Porsche 963" },
            Laps =
            [
                .. new double[] { 131, 133, 138 }.Select((time, index) => new LapHistoryRecord
                {
                    LapNumber = index + 1,
                    LapTimeSeconds = time,
                    ReferenceCurve = new LapReferenceCurve { TimesSeconds = [0, time] },
                }),
            ],
        },
    ]);

    private sealed class FakeLapHistoryStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => sessions;

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }

    private static void WithView(
        PlanMode mode,
        Action<string> assert,
        ILapHistoryStore? corpus = null,
        bool tracking = false) =>
        WithViewCard(
            mode,
            card =>
                // Segmented options are button content and scopes are combo items, so neither
                // shows up as a TextBlock: the target selector is only visible if all are read.
                assert(string.Join(
                    " | ",
                    card.GetLogicalDescendants()
                        .OfType<TextBlock>()
                        .Select(block => block.Text ?? "")
                        .Concat(card.GetLogicalDescendants()
                            .OfType<Button>()
                            .Select(ButtonLabel))
                        .Concat(card.GetLogicalDescendants()
                            .OfType<ComboBox>()
                            .SelectMany(combo => (combo.ItemsSource ?? Array.Empty<string>())
                                .Cast<object?>()
                                .Select(item => item as string ?? ""))))),
            corpus,
            tracking);

    private static void WithViewCard(
        PlanMode mode,
        Action<Border> assert,
        ILapHistoryStore? corpus = null,
        bool tracking = false,
        bool specificOpen = false)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var counter = 0;
            var service = new SessionPlannerService(
                new LocalSessionPlanStore(root),
                clock: () => Now,
                idFactory: () => $"id-{++counter}");
            service.CreatePlan(new CreatePlanRequest
            {
                Name = "Spa 6h",
                Track = "Spa-Francorchamps",
                Car = "Porsche 963",
                Mode = mode,
                RaceLengthFormat = RaceLengthFormat.TimeBased,
                RaceLengthValue = 360,
            });

            if (tracking)
            {
                service.StartTracking("id-1", SegmentKind.Qualifying);
            }

            var controller = new SessionPlannerController(
                service,
                NoFuelHistorySource.Instance,
                () => PlanContext.Empty,
                corpus,
                () => Now);
            // The page lands on the overview; these tests are about the opened plan card.
            controller.SelectPlan("id-1");
            if (specificOpen)
            {
                controller.OpenSpecificLapPicker();
            }

            // The header carries a "Quick plan" button, so assert against the plan card only.
            var card = new SessionPlannerView(
                    controller,
                    new SessionPlannerViewCallbacks(() => { }, (_, _, _, _, _) => { }, () => { }, () => { }, true))
                .Build()
                .GetLogicalDescendants()
                .OfType<Border>()
                .First(border => border.Tag as string == SessionPlannerView.PlanCardTag);

            assert(card);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static Task Dispatch(Action body) =>
        HeadlessUnitTestSession
            .GetOrStartForAssembly(typeof(SessionPlannerViewTests).Assembly)
            .Dispatch(body, CancellationToken.None);
}
