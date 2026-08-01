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

    private static void WithView(PlanMode mode, Action<string> assert)
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
                () => PlanContext.Empty);
            // The header carries a "Quick plan" button, so assert against the plan card only.
            var card = new SessionPlannerView(
                    controller,
                    new SessionPlannerViewCallbacks(() => { }, (_, _, _, _) => { }, () => { }))
                .Build()
                .GetLogicalDescendants()
                .OfType<Border>()
                .First(border => border.Tag as string == SessionPlannerView.PlanCardTag);

            assert(string.Join(
                " | ",
                card.GetLogicalDescendants().OfType<TextBlock>().Select(block => block.Text ?? "")));
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
