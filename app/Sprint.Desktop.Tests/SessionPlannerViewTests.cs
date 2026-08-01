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
    public async Task WithNoHistoryTheSelectorAsksForTheTimeInsteadOfOfferingNothing()
    {
        await Dispatch(() => WithView(PlanMode.Planned, text =>
        {
            Assert.Contains(PlanTargetChoices.NoHistoryMessage, text);
            Assert.Contains("No target set", text);
            Assert.DoesNotContain("Current Quali", text);
        }));
    }

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

    private static void WithView(PlanMode mode, Action<string> assert, ILapHistoryStore? corpus = null)
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

            var controller = new SessionPlannerController(
                service,
                NoFuelHistorySource.Instance,
                () => PlanContext.Empty,
                corpus,
                () => Now);
            // The header carries a "Quick plan" button, so assert against the plan card only.
            var card = new SessionPlannerView(
                    controller,
                    new SessionPlannerViewCallbacks(() => { }, (_, _, _, _) => { }, () => { }))
                .Build()
                .GetLogicalDescendants()
                .OfType<Border>()
                .First(border => border.Tag as string == SessionPlannerView.PlanCardTag);

            // Segmented options are button content and scopes are combo items, so neither shows
            // up as a TextBlock: the target selector is only visible if all three are read.
            assert(string.Join(
                " | ",
                card.GetLogicalDescendants()
                    .OfType<TextBlock>()
                    .Select(block => block.Text ?? "")
                    .Concat(card.GetLogicalDescendants()
                        .OfType<Button>()
                        .Select(button => button.Content as string ?? ""))
                    .Concat(card.GetLogicalDescendants()
                        .OfType<ComboBox>()
                        .SelectMany(combo => (combo.ItemsSource ?? Array.Empty<string>())
                            .Cast<object?>()
                            .Select(item => item as string ?? "")))));
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
