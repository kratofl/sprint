using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.LogicalTree;
using Sprint.Desktop;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// View-level tests for the New Session Plan modal (#178). These build the real dialog under
/// a headless Avalonia session, because the behaviour under test is exactly what a pure test
/// cannot see: where the name field sits, what it is labelled, and that its placeholder
/// tracks typing without the modal being rebuilt underneath the caret.
/// </summary>
public class NewPlanDialogViewTests
{
    [Fact]
    public async Task TheNameFieldFollowsTheContextSectionAndSaysItIsOptional()
    {
        await Dispatch(() =>
        {
            var built = BuildDialog(new NewPlanDraft());
            var labels = built.Root
                .GetLogicalDescendants()
                .OfType<TextBlock>()
                .Select(block => block.Text ?? "")
                .ToList();

            var context = labels.IndexOf("Context");
            var name = labels.IndexOf("Name (optional)");

            Assert.True(context >= 0, "the Context section label is missing");
            Assert.True(name >= 0, "the name field is not labelled as optional");
            // Presented first and unlabelled, drivers treated the name as required.
            Assert.True(name > context, $"the name field must follow Context (context={context}, name={name})");
        });
    }

    [Fact]
    public async Task ThePlaceholderPreviewsTheDerivedNameAsTrackAndCarAreTyped()
    {
        await Dispatch(() =>
        {
            var built = BuildDialog(new NewPlanDraft());
            var window = Show(built.Root);

            // Empty context: the placeholder is the generic default the plan would really get.
            Assert.Equal("New Session Plan", built.NameBox.PlaceholderText);

            Type(window, built.TrackBox, "Spa-Francorchamps");
            Assert.Equal("Spa-Francorchamps", built.NameBox.PlaceholderText);

            Type(window, built.CarBox, "Porsche 963");
            Assert.Equal("Spa-Francorchamps – Porsche 963", built.NameBox.PlaceholderText);

            // Clearing the context walks the preview back rather than stranding a stale one.
            Clear(window, built.TrackBox);
            Assert.Equal("Porsche 963", built.NameBox.PlaceholderText);
        });
    }

    [Fact]
    public async Task TypingContextDoesNotRebuildTheModalOrDisturbTheNameBox()
    {
        await Dispatch(() =>
        {
            var built = BuildDialog(new NewPlanDraft());
            var window = Show(built.Root);

            Type(window, built.NameBox, "Sunday race");
            built.NameBox.CaretIndex = 6;

            Type(window, built.TrackBox, "Spa-Francorchamps");
            Type(window, built.CarBox, "Porsche 963");

            // A rebuild would discard these controls, losing the caret and the typed value.
            Assert.Equal(0, built.Rebuilds);
            Assert.Equal("Sunday race", built.NameBox.Text);
            Assert.Equal(6, built.NameBox.CaretIndex);
            // A typed name is kept, and the preview underneath it still updates.
            Assert.Equal("Spa-Francorchamps – Porsche 963", built.NameBox.PlaceholderText);
        });
    }

    [Fact]
    public async Task ANameLeftBlankCreatesThePlanUnderTheDerivedName()
    {
        await Dispatch(() =>
        {
            CreatePlanRequest? created = null;
            var built = BuildDialog(new NewPlanDraft { RaceLengthText = "60" }, request => created = request);
            var window = Show(built.Root);

            Type(window, built.TrackBox, "Spa-Francorchamps");
            Type(window, built.CarBox, "Porsche 963");
            Submit(built.Root);

            Assert.NotNull(created);
            Assert.Equal("Spa-Francorchamps – Porsche 963", created!.Name);
        });
    }

    [Fact]
    public async Task QuickModeShowsDetectedContextReadOnlyAndAsksNothingWhenAllIsKnown()
    {
        await Dispatch(() =>
        {
            var detection = new PlanDetection(
                new PlanContext("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps"),
                RaceLengthFormat.LapBased,
                31,
                HasFuelHistory: true);
            var root = new QuickPlanDialog(new NewPlanDraft(), detection, _ => { }, () => { }).Build();
            var text = AllText(root);

            // Detected context is rendered, not typed.
            Assert.Empty(root.GetLogicalDescendants().OfType<TextBox>());
            Assert.Contains("Porsche 963", text);
            Assert.Contains("Spa-Francorchamps", text);
            Assert.Contains("31 laps", text);
            Assert.Contains("Create", text);
        });
    }

    [Fact]
    public async Task QuickModeAsksOnlyForTheRaceLengthItCouldNotDetect()
    {
        await Dispatch(() =>
        {
            var detection = new PlanDetection(
                new PlanContext("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps"),
                RaceLengthFormat.Unknown,
                0,
                HasFuelHistory: true);
            var root = new QuickPlanDialog(new NewPlanDraft(), detection, _ => { }, () => { }).Build();

            // One gap, one input — not the whole sheet.
            var box = Assert.Single(root.GetLogicalDescendants().OfType<TextBox>());
            Assert.Equal(QuickPlanDialog.RaceLengthInputName, box.Name);
        });
    }

    [Fact]
    public async Task QuickModeAsksForFuelValuesOnlyWithNoHistory()
    {
        await Dispatch(() =>
        {
            var detection = new PlanDetection(
                new PlanContext("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps"),
                RaceLengthFormat.TimeBased,
                90,
                HasFuelHistory: false);
            var root = new QuickPlanDialog(new NewPlanDraft(), detection, _ => { }, () => { }).Build();
            var names = root.GetLogicalDescendants().OfType<TextBox>().Select(box => box.Name).ToList();

            Assert.Contains(QuickPlanDialog.AvgLapTimeInputName, names);
            Assert.Contains(QuickPlanDialog.FuelPerLapInputName, names);
            Assert.DoesNotContain(QuickPlanDialog.RaceLengthInputName, names);
            Assert.Contains("90 minutes", AllText(root));
        });
    }

    [Fact]
    public async Task QuickModeDoesNotListAsDetectedTheThingsItIsAskingFor()
    {
        await Dispatch(() =>
        {
            // Nothing detected: the sheet must not print "unknown" directly above an input
            // asking for that same value.
            var detection = new PlanDetection(PlanContext.Empty, RaceLengthFormat.Unknown, 0, HasFuelHistory: false);
            var root = new QuickPlanDialog(new NewPlanDraft(), detection, _ => { }, () => { }).Build();
            var text = AllText(root);

            Assert.DoesNotContain("unknown", text);
            Assert.DoesNotContain("Detected", text);
            Assert.Contains("Sprint needs", text);
        });
    }

    [Fact]
    public async Task QuickModeListsOnlyTheDetectedPartsWhenSomeContextIsKnown()
    {
        await Dispatch(() =>
        {
            // The lobby case: track known, car not yet.
            var detection = new PlanDetection(
                new PlanContext("Le Mans Ultimate", "", "Spa-Francorchamps"),
                RaceLengthFormat.LapBased,
                31,
                HasFuelHistory: true);
            var root = new QuickPlanDialog(new NewPlanDraft(), detection, _ => { }, () => { }).Build();
            var text = AllText(root);

            Assert.Contains("Detected", text);
            Assert.Contains("Spa-Francorchamps", text);
            Assert.Contains("31 laps", text);
            Assert.DoesNotContain("unknown", text);

            // Only the car is asked for.
            var box = Assert.Single(root.GetLogicalDescendants().OfType<TextBox>());
            Assert.Equal(QuickPlanDialog.CarInputName, box.Name);
        });
    }

    [Fact]
    public async Task CreatingFromQuickModeMarksThePlanQuickAndCarriesTheDetectedValues()
    {
        await Dispatch(() =>
        {
            CreatePlanRequest? created = null;
            var detection = new PlanDetection(
                new PlanContext("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps"),
                RaceLengthFormat.LapBased,
                31,
                HasFuelHistory: true);
            var root = new QuickPlanDialog(new NewPlanDraft(), detection, request => created = request, () => { })
                .Build();

            Submit(root);

            Assert.NotNull(created);
            Assert.Equal(PlanMode.Quick, created!.Mode);
            Assert.Equal("Le Mans Ultimate", created.Game);
            Assert.Equal("Porsche 963", created.Car);
            Assert.Equal("Spa-Francorchamps", created.Track);
            Assert.Equal(RaceLengthFormat.LapBased, created.RaceLengthFormat);
            Assert.Equal(31, created.RaceLengthValue);
            Assert.Equal("Spa-Francorchamps – Porsche 963", created.Name);
        });
    }

    [Fact]
    public async Task QuickModeWillNotCreateAPlanWithARaceLengthTheUserHasNotSupplied()
    {
        await Dispatch(() =>
        {
            CreatePlanRequest? created = null;
            var detection = new PlanDetection(
                new PlanContext("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps"),
                RaceLengthFormat.Unknown,
                0,
                HasFuelHistory: true);
            var draft = new NewPlanDraft();
            var dialog = new QuickPlanDialog(draft, detection, request => created = request, () => { });
            var root = dialog.Build();

            Submit(root);

            Assert.Null(created);
            Assert.NotEmpty(draft.Error);
        });
    }

    private static string AllText(Control root) =>
        string.Join(
            " | ",
            root.GetLogicalDescendants().OfType<TextBlock>().Select(block => block.Text ?? ""));

    // Real typing: the placeholder preview hangs off TextChanged, which Avalonia raises for
    // user input but not for a programmatic Text assignment on a detached control.
    private static void Type(Window window, TextBox box, string text)
    {
        box.Focus();
        window.KeyTextInput(text);
    }

    // Select-all then Backspace, the way a driver actually wipes a field.
    private static void Clear(Window window, TextBox box)
    {
        box.Focus();
        box.SelectAll();
        window.KeyPressQwerty(Avalonia.Input.PhysicalKey.Backspace, Avalonia.Input.RawInputModifiers.None);
        window.KeyReleaseQwerty(Avalonia.Input.PhysicalKey.Backspace, Avalonia.Input.RawInputModifiers.None);
    }

    private static Window Show(Control root)
    {
        var window = new Window { Width = 600, Height = 800, Content = root };
        window.Show();
        return window;
    }

    private static void Submit(Control root)
    {
        var create = root
            .GetLogicalDescendants()
            .OfType<Button>()
            .First(button => ButtonText(button) == "Create");
        create.RaiseEvent(new Avalonia.Interactivity.RoutedEventArgs(Button.ClickEvent));
    }

    private static string ButtonText(Button button) => button.Content switch
    {
        string text => text,
        StackPanel panel => string.Concat(panel.Children.OfType<TextBlock>().Select(block => block.Text)),
        TextBlock block => block.Text ?? "",
        _ => "",
    };

    private static BuiltDialog BuildDialog(
        NewPlanDraft draft,
        Action<CreatePlanRequest>? create = null)
    {
        var rebuilds = 0;
        var dialog = new NewPlanDialog(
            draft,
            hasFuelHistory: true,
            create ?? (_ => { }),
            cancel: () => { },
            rebuild: () => rebuilds++);
        var root = dialog.Build();
        var boxes = root.GetLogicalDescendants().OfType<TextBox>().ToList();

        return new BuiltDialog(
            root,
            Box(boxes, NewPlanDialog.NameInputName),
            Box(boxes, NewPlanDialog.TrackInputName),
            Box(boxes, NewPlanDialog.CarInputName),
            () => rebuilds);
    }

    private static TextBox Box(List<TextBox> boxes, string name) =>
        boxes.FirstOrDefault(box => box.Name == name)
        ?? throw new InvalidOperationException($"the modal has no text box named '{name}'");

    private sealed record BuiltDialog(
        Control Root,
        TextBox NameBox,
        TextBox TrackBox,
        TextBox CarBox,
        Func<int> RebuildCount)
    {
        public int Rebuilds => RebuildCount();
    }

    private static Task Dispatch(Action body) =>
        HeadlessUnitTestSession
            .GetOrStartForAssembly(typeof(NewPlanDialogViewTests).Assembly)
            .Dispatch(body, CancellationToken.None);
}
