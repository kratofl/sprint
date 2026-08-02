using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;
using Sprint.Desktop.Features.Updates;
using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

internal static class AgentUiReviewHarness
{
    public static async Task<AgentUiReviewResult> GenerateAsync()
    {
        var artifactRoot = Path.Combine(TestEnv.RepoRoot, "app", "Sprint.Desktop.Tests", "artifacts", "ui-review", "latest");
        if (Directory.Exists(artifactRoot))
        {
            Directory.Delete(artifactRoot, recursive: true);
        }

        Directory.CreateDirectory(artifactRoot);

        var frames = new List<AgentUiReviewFrame>();
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(AgentUiReviewHarness).Assembly);
        var dataRoot = TestEnv.NewTempDataRoot();

        try
        {
            await session.Dispatch(() =>
            {
                var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
                if (runtime.Catalog.Count > 0)
                {
                    runtime.AddDevice(runtime.Catalog[0]);
                }

                // A known screen device, assigned to the default dash, so the review frames
                // exercise the size-aware surfaces: the Devices card resolution (US33) and an
                // enabled Apply-to-screen in the editor toolbar (US34).
                runtime.Devices.Add(new Sprint.Desktop.Features.Devices.SavedDevice
                {
                    Id = "review-screen",
                    Name = "Review Screen",
                    Type = "screen",
                    Driver = "vocore",
                    Serial = "REV1",
                    Width = 800,
                    Height = 480,
                    DashId = runtime.DashLayouts.FirstOrDefault(dash => dash.IsDefault)?.Id
                        ?? runtime.DashLayouts.FirstOrDefault()?.Id
                        ?? "default",
                });

                var defaultDash = runtime.DashLayouts.First(dash => dash.IsDefault);
                using (var painter = new DashPainter(800, 480, DashPalette.FromLayout(defaultDash)))
                {
                    foreach (var page in defaultDash.Pages)
                    {
                        var pageSlug = page.Name.ToLowerInvariant();
                        var imagePath = Path.Combine(artifactRoot, $"default-dash-{pageSlug}-800x480.png");
                        File.WriteAllBytes(imagePath, painter.RenderPng(
                            defaultDash,
                            DashPreviewFrames.For(DashPreviewState.MidLap),
                            runtime.Settings,
                            pageId: page.Id));
                        using var bitmap = new Bitmap(imagePath);
                        var failure = ValidateImage(bitmap);
                        frames.Add(new AgentUiReviewFrame(
                            $"default-dash-{pageSlug}-800x480",
                            imagePath,
                            [$"{page.Name} page", "gear and shift state remain visible"],
                            failure is null ? [] : [failure]));
                    }

                    // The vehicle page again, this time with an active plan behind it (#189).
                    // Compared against its unplanned twin above, this is the whole feature:
                    // FUEL TARGET reads the planned figure instead of "--".
                    var plannedPath = Path.Combine(artifactRoot, "default-dash-vehicle-plan-targets-800x480.png");
                    File.WriteAllBytes(plannedPath, painter.RenderPng(
                        defaultDash,
                        DashPreviewFrames.For(DashPreviewState.MidLap),
                        runtime.Settings,
                        new DashTargets { LapTimeSeconds = 131, FuelPerLapLiters = 3.4 },
                        pageId: defaultDash.Pages.First(page => page.Name.Equals("Vehicle", StringComparison.OrdinalIgnoreCase)).Id));
                    using var plannedBitmap = new Bitmap(plannedPath);
                    var plannedFailure = ValidateImage(plannedBitmap);
                    frames.Add(new AgentUiReviewFrame(
                        "default-dash-vehicle-plan-targets-800x480",
                        plannedPath,
                        ["fuel target shows the planned 3.40 L/lap, not the current burn"],
                        plannedFailure is null ? [] : [plannedFailure]));

                    var alertImagePath = Path.Combine(artifactRoot, "default-dash-adjustment-overlay-800x480.png");
                    File.WriteAllBytes(alertImagePath, painter.RenderPng(
                        defaultDash,
                        DashPreviewFrames.For(DashPreviewState.MidLap),
                        runtime.Settings,
                        pageId: "driving-default",
                        banner: new DashAlertBanner("TRACTION CONTROL", "5", DashPalette.Default.Accent)));
                    using var alertBitmap = new Bitmap(alertImagePath);
                    var alertFailure = ValidateImage(alertBitmap);
                    frames.Add(new AgentUiReviewFrame(
                        "default-dash-adjustment-overlay-800x480",
                        alertImagePath,
                        ["temporary adjustment overlay", "previous and current values"],
                        alertFailure is null ? [] : [alertFailure]));
                }

                var catalogDash = WidgetCatalogDash();
                Assert.True(DashLayoutValidator.IsValid(catalogDash), "The visual catalog must contain every widget in a valid non-overlapping layout.");
                using (var painter = new DashPainter(1200, 720))
                {
                    var imagePath = Path.Combine(artifactRoot, "widget-catalog-1200x720.png");
                    File.WriteAllBytes(imagePath, painter.RenderPng(
                        catalogDash,
                        DashPreviewFrames.For(DashPreviewState.MidLap),
                        runtime.Settings));
                    using var bitmap = new Bitmap(imagePath);
                    var failure = ValidateImage(bitmap);
                    frames.Add(new AgentUiReviewFrame(
                        "widget-catalog-1200x720",
                        imagePath,
                        DashWidgetCatalog.All.Select(widget => widget.Name).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
                        failure is null ? [] : [failure]));
                }

                using var telemetry = new RecordingTelemetrySource();
                var window = new MainWindow(runtime, new ShellState(), telemetry)
                {
                    Width = 1440,
                    Height = 900
                };

                window.Show();
                try
                {
                    frames.Add(Capture(window, artifactRoot, "home-runtime-overview", "Home", "Your dashes", "Connected screens", "Review devices", "Review Screen"));

                    // The standing update hint: toolbar pill + Settings rail badge, shown
                    // without touching the network, then cleared so later frames are clean.
                    window.ApplyUpdateAvailability(new ReleaseInfo("9.9.9", "stable", "https://example.test/9.9.9"));
                    frames.Add(Capture(window, artifactRoot, "home-update-available", "Home", "Update v9.9.9"));
                    window.ApplyUpdateAvailability(null);

                    // Session Planner (#100): the empty state and both creation entry points
                    // (#183 — Quick plan as the ember primary, the full sheet beside it).
                    Click(window, "Session Planner");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-empty",
                        "No session plans yet",
                        "Quick plan",
                        "New plan",
                        // #185's permanent manual entry point, always available even after
                        // the startup offer has been declined.
                        "Import results"));

                    // Quick plan (#183): detected context read-only, inputs only for the gaps.
                    // Nothing is detected in the harness, so this is the widest form it shows.
                    Click(window, "Quick plan");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-quick-plan-dialog",
                        "Quick plan",
                        // The harness's fake source reports no session, so this is the widest
                        // form Quick mode ever shows: every field is a gap.
                        "The game has not reported this session yet — fill in what you know.",
                        "Sprint needs",
                        "Race length",
                        "Create"));
                    Click(window, "Cancel");

                    Click(window, "New plan");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-new-plan-dialog",
                        "New Session Plan",
                        // Three short steps rather than one form that has to be scrolled.
                        "Step 1 of 3 · Where and what",
                        "Game",
                        "Car",
                        "Track",
                        // #178: the name follows the context fields and says it is optional.
                        "Name (optional)",
                        "Next"));

                    // Step 1 → 2. The name box placeholders the derived name, which is the
                    // generic default while track and car are empty (#178).
                    TaggedPlaceholderTextBox(window, "New Session Plan").Text = "Spa 6h";
                    Click(window, "Next");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-new-plan-sessions-step",
                        "New Session Plan",
                        "Step 2 of 3 · Which sessions, and how long",
                        "Qualifying",
                        "Race length",
                        "Back",
                        "Next"));

                    // Leaving a step with a value its own fields cannot satisfy states the
                    // problem beside those fields rather than two steps later.
                    Click(window, "Next");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-new-plan-invalid",
                        "New Session Plan",
                        "Race length must be a number.",
                        "Next"));

                    TaggedPlaceholderTextBox(window, "60").Text = "60";
                    Click(window, "Next");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-new-plan-fuel-step",
                        "New Session Plan",
                        "Step 3 of 3 · Fuel",
                        "Reserve (laps)",
                        "Create"));

                    // Commit, so the populated page — the segmented control, the plan card and
                    // plan history — is reviewable too.
                    Click(window, "Create");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-plan-created",
                        "Spa 6h",
                        "Qualifying",
                        "Race",
                        "Arm auto-start",
                        "Plan history",
                        // #186: a fresh install has no corpus, so the selector shows its
                        // manual fallback rather than an empty scope list.
                        "Qualifying lap-time target",
                        PlanTargetChoices.NoHistoryMessage));

                    // #185's startup offer. Driven directly because the real path is gated on a
                    // desktop lifetime and on the sim having archived sessions on this machine.
                    window.PromptForArchivedSessions(
                        new ReviewResultsImporter(),
                        new ResultsImportProposal(
                            [new Sprint.Desktop.Api.Games.ResultsArchiveEntry("race.xml", 2048, DateTimeOffset.UnixEpoch)],
                            new Dictionary<HistorySessionKind, int>
                            {
                                [HistorySessionKind.Practice] = 9,
                                [HistorySessionKind.Qualifying] = 3,
                                [HistorySessionKind.Race] = 2,
                            }));
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "session-planner-import-prompt",
                        "Import archived sessions",
                        // The per-kind breakdown is the point of the prompt — a blind yes/no is
                        // what it replaces — so the whole sentence is pinned, not just a word.
                        "Sprint found Practice 9, Qualifying 3, Race 2 in the Le Mans Ultimate results folder. "
                            + "Importing them gives fuel and lap-time estimates something to work from "
                            + "straight away. Nothing is imported until you choose to.",
                        "Import"));
                    Click(window, "Not now");

                    // Every other state of the import sheet. Rendered standalone because they
                    // are driven by the dialog's own controller, and the shell only reaches
                    // them with a real archive on this machine.
                    CaptureImportResultsStates(frames, artifactRoot);

                    // #186 with a corpus behind it. Rendered on its own window because the
                    // shell's page reads the real lap-history store, which is empty here.
                    CapturePlanTargetSelector(frames, artifactRoot, dataRoot);

                    // #187 has no host yet — placement is deliberately undecided — so the
                    // stack is reviewed on its own window rather than wired into a page.
                    CaptureChartStack(frames, artifactRoot);

                    Click(window, "Devices");
                    frames.Add(Capture(window, artifactRoot, "devices-overview", "Devices", "Add device", "Gallery", "List", runtime.Devices[0].Name, "Review Screen"));

                    Click(window, "Add device");
                    frames.Add(Capture(window, artifactRoot, "add-device-preset-dialog", "Add device", "Preset", "Generic", "Hardware presets", "BavarianSimTec Omega PRO V2"));
                    Click(window, "Generic");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "add-device-generic-dialog",
                        "Add device",
                        "Preset",
                        "Generic",
                        "Generic screens",
                        "Generic VoCore Screen",
                        "Generic USBD480 NX Screen",
                        // Custom wheel builder (issue #49).
                        "Custom wheel",
                        "Name",
                        "Screen type",
                        "Resolution",
                        "Add wheel"));
                    Click(window, "Close");

                    Click(window, runtime.Devices[0].Name);
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail",
                        "Back to devices",
                        "Command bindings",
                        "Screen alignment",
                        "This screen is used for",
                        "Show a customizable racing dashboard.",
                        "Screen performance",
                        "Screen output FPS",
                        runtime.Devices[0].Name));
                    Click(window, "Add binding");
                    Click(window, "Listen");
                    ScrollToEnd(window);
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-binding-listening",
                        "Command bindings",
                        "Listening for Next dash page",
                        "Wheel input is unavailable. Press a keyboard key, or Esc to cancel.",
                        "Cancel"));
                    Click(window, "Cancel");
                    window.Width = 1120;
                    window.Height = 720;
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-1120x720",
                        "This screen is used for",
                        "Dashboard",
                        "Screen performance",
                        "Screen alignment"));
                    window.Width = 1440;
                    window.Height = 900;

                    // Device purposes (issues #53/#41): focused displays render
                    // immediately without a dashboard selector; rear-view stays in an
                    // honest setup state until its transparent selector is confirmed.
                    var purposeCombo = TaggedComboBox(window, "device-purpose");
                    purposeCombo.SelectedItem = "Flag display";
                    using (window.CaptureRenderedFrame())
                    {
                    }
                    var flagPreview = window.GetVisualDescendants()
                        .OfType<ComboBox>()
                        .Single(combo => string.Equals(combo.SelectedItem?.ToString(), "Live / demo", StringComparison.Ordinal));
                    flagPreview.SelectedItem = "Yellow flag";
                    using (window.CaptureRenderedFrame())
                    {
                    }

                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-flag-display",
                        "This screen is used for",
                        "Flag display",
                        "Show the active marshalling flag at maximum glanceability.",
                        "Screen performance",
                        "Screen output FPS",
                        "Screen alignment",
                        "Yellow flag"));
                    window.Width = 1120;
                    window.Height = 720;
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-flag-display-1120x720",
                        "This screen is used for",
                        "Flag display",
                        "Screen performance",
                        "Screen alignment",
                        "Yellow flag"));
                    window.Width = 1440;
                    window.Height = 900;
                    var lapTimerPurpose = TaggedComboBox(window, "device-purpose");
                    lapTimerPurpose.SelectedItem = "Lap timer";
                    using (window.CaptureRenderedFrame())
                    {
                    }
                    var lapPreview = window.GetVisualDescendants()
                        .OfType<ComboBox>()
                        .Single(combo => string.Equals(combo.SelectedItem?.ToString(), "Yellow flag", StringComparison.Ordinal));
                    lapPreview.SelectedItem = "Mid-lap";
                    using (window.CaptureRenderedFrame())
                    {
                    }

                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-lap-timer",
                        "This screen is used for",
                        "Lap timer",
                        "Show current, last, and best lap times with a live delta.",
                        "Screen performance",
                        "Screen output FPS",
                        "Screen alignment",
                        "Mid-lap"));
                    window.Width = 1120;
                    window.Height = 720;
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-lap-timer-1120x720",
                        "This screen is used for",
                        "Lap timer",
                        "Screen performance",
                        "Screen alignment",
                        "Mid-lap"));
                    window.Width = 1440;
                    window.Height = 900;
                    var mirrorPurpose = TaggedComboBox(window, "device-purpose");
                    mirrorPurpose.SelectedItem = "Rear-view mirror";
                    using (window.CaptureRenderedFrame())
                    {
                    }

                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-rear-view-setup",
                        "This screen is used for",
                        "Capture area",
                        "Setup needed",
                        "Select area",
                        "Screen performance",
                        "Screen alignment"));
                    window.Width = 1120;
                    window.Height = 720;
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-rear-view-setup-1120x720",
                        "This screen is used for",
                        "Capture area",
                        "Setup needed",
                        "Select area",
                        "Screen performance",
                        "Screen alignment"));
                    window.Width = 1440;
                    window.Height = 900;

                    Click(window, "Select area");
                    var captureSelector = Assert.IsType<CaptureRegionWindow>(window.ActiveCaptureRegionWindow);
                    frames.Add(CaptureTransparentSelector(
                        captureSelector,
                        artifactRoot,
                        "rear-view-capture-selector",
                        "Move and resize to frame the rear view",
                        "Cancel",
                        "Use this area"));
                    Click(captureSelector, "Use this area");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-rear-view-configured",
                        "Live capture preview",
                        "Screen performance",
                        "Screen output FPS",
                        "Source",
                        "Pixel transform",
                        "USB transfer",
                        "Total",
                        "Preview is independently limited to at most 15 FPS to reduce system load. Statistics report the actual screen renderer.",
                        "Capture area",
                        "Change area",
                        "Screen alignment"));
                    window.Width = 1120;
                    window.Height = 720;
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "devices-detail-rear-view-configured-1120x720",
                        "Live capture preview",
                        "Screen performance",
                        "Screen output FPS",
                        "Source",
                        "Pixel transform",
                        "USB transfer",
                        "Total",
                        "Preview is independently limited to at most 15 FPS to reduce system load. Statistics report the actual screen renderer.",
                        "Capture area",
                        "Change area",
                        "Screen alignment"));
                    window.Width = 1440;
                    window.Height = 900;

                    var backToDash = TaggedComboBox(window, "device-purpose");
                    backToDash.SelectedItem = "Dashboard";
                    using (window.CaptureRenderedFrame())
                    {
                    }

                    OpenCommandPalette(window);
                    Click(window, "Go to Setups");
                    frames.Add(Capture(window, artifactRoot, "setups-templates-readonly", "Setups", "Setup templates", "User setups", "Duplicate template"));

                    Click(window, "Duplicate template");
                    frames.Add(Capture(window, artifactRoot, "setups-duplicated-user-copy", "Setups", "Delete", runtime.SetupPrograms[0].Name));

                    Click(window, "Delete");
                    frames.Add(Capture(window, artifactRoot, "setup-deleted-undo", "Setup deleted", "Undo"));
                    Click(window, "Undo");

                    // Capture Settings and Help before opening the dash editor: the editor
                    // toolbar has its own "Settings" tab that would otherwise shadow the
                    // sidebar navigation button of the same label.
                    Click(window, "Settings");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "settings-global-defaults",
                        "Settings",
                        "Profile",
                        // Session Planner defaults (#103).
                        "Session Planner",
                        "Fuel reserve",
                        // Units live in the option text, so a bare number never appears.
                        "+1 lap",
                        "90 days",
                        "Fuel history",
                        "Online detection",
                        "Trace capture",
                        "Keep traces for",
                        "Race format warning",
                        // #185's second manual entry point.
                        "Archived sessions",
                        "Import results",
                        "Dash defaults"
#if DEBUG
                        , "Development",
                        "Open development tools"
#endif
                    ));

                    // Pre-release channel warning (issue #28): selecting the channel must
                    // ask for confirmation first, and cancelling must put the combo back
                    // on stable without persisting the switch.
                    var channelCombo = window.GetVisualDescendants()
                        .OfType<ComboBox>()
                        .Single(combo => ReferenceEquals(combo.ItemsSource, AppSettings.Channels));
                    channelCombo.SelectedItem = "pre-release";
                    using (window.CaptureRenderedFrame())
                    {
                    }

                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "settings-pre-release-warning",
                        "Switch to pre-release?",
                        "Use pre-release",
                        "Cancel"));
                    Click(window, "Cancel");
                    Assert.Equal("stable", channelCombo.SelectedItem);
                    Assert.Equal("stable", runtime.Settings.UpdateChannel);

#if DEBUG
                    Click(window, "Open development tools");
                    var diagnosticsWindow = Assert.IsType<DiagnosticsWindow>(window.ActiveDiagnosticsWindow);
                    diagnosticsWindow.Width = 1500;
                    diagnosticsWindow.Height = 860;
                    using (diagnosticsWindow.CaptureRenderedFrame())
                    {
                    }
                    var racing = diagnosticsWindow.GetVisualDescendants()
                        .OfType<Button>()
                        .Single(button => string.Equals(button.Content?.ToString(), "Racing", StringComparison.Ordinal));
                    racing.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    var colorBars = diagnosticsWindow.GetVisualDescendants()
                        .OfType<Button>()
                        .Last(button => string.Equals(button.Content?.ToString(), "Color bars", StringComparison.Ordinal));
                    colorBars.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    frames.Add(Capture(
                        diagnosticsWindow,
                        artifactRoot,
                        "development-tools-simulation-screens-log",
                        "Game state simulation",
                        "Screen output",
                        "Live logging",
                        "Simulation enabled",
                        "Review Screen",
                        "Color bars",
                        "Dashboard",
                        "Minimum level",
                        "Search"));
                    diagnosticsWindow.Close();
#endif

                    Click(window, "Help");
                    frames.Add(Capture(window, artifactRoot, "help-reference", "Help", "Getting started", "Telemetry status", "Keyboard shortcuts"));

                    OpenCommandPalette(window);
                    frames.Add(Capture(window, artifactRoot, "command-palette", "Go to Home", "Create dash", "Add device"));
                    window.GetVisualDescendants().OfType<TextBox>()
                        .Single(box => string.Equals(box.Tag?.ToString(), "command-palette-search", StringComparison.Ordinal))
                        .RaiseEvent(new KeyEventArgs
                        {
                            RoutedEvent = InputElement.KeyDownEvent,
                            Key = Key.Escape,
                        });

                    Click(window, "Dashboards");
                    frames.Add(Capture(window, artifactRoot, "dash-editor-list", "Dashes", "Create dash", "Edit"));

                    Click(window, "Edit");
                    frames.Add(Capture(window, artifactRoot, "dash-editor-layout", "Layout", "Alerts", "Settings", "Pages", "Widgets", "Properties", "Basic", "Advanced"));

                    Click(window, "Pages");
                    frames.Add(Capture(window, artifactRoot, "dash-editor-pages", "Pages", "Widgets", "+  Add page", "Driving", "Endurance", "Timing", "Vehicle"));

                    Click(window, "Alerts");
                    frames.Add(Capture(
                        window,
                        artifactRoot,
                        "dash-editor-alerts",
                        expectedText:
                        [
                        "Popups",
                        "TC",
                        "ABS",
                        "ENGINE MAP",
                        "Alert canvas",
                        "Global defaults",
                        .. DashThemePresets.All.Select(preset => preset.Name),
                        "Use global settings",
                        "Duration",
                        "Invert colors",
                        ]));

                    ClickEditor(window, "Settings");
                    frames.Add(Capture(window, artifactRoot, "dash-editor-theme-presets-1440x900", "Theme presets", "Choose a complete visual direction. Graphite preserves functional racing colors; optical presets apply their representative accent.", "Graphite", "Ice", "Suzuki", "Selected"));
                    window.Width = 1120;
                    window.Height = 720;
                    frames.Add(Capture(window, artifactRoot, "dash-editor-theme-presets-1120x720", "Theme presets", "Graphite", "Ice", "Suzuki"));
                    window.Width = 1440;
                    window.Height = 900;

                    Click(window, "Layout");
                    Click(window, "Widgets");
                    Click(window, "Advanced");
                    frames.Add(Capture(window, artifactRoot, "dash-editor-advanced", "Advanced", "Pages", "Widgets", "Properties"));
                }
                finally
                {
                    window.Close();
                }

                var staged = runtime.EngineerControls[0];
                staged.StagedValue = Math.Min(staged.Max, staged.StagedValue + staged.Step);
                runtime.PushEngineerChanges();
                var engineerShell = new ShellState();
                engineerShell.Navigate(AppView.DebugEngineer);
                using var engineerTelemetry = new RecordingTelemetrySource();
                var engineerWindow = new MainWindow(runtime, engineerShell, engineerTelemetry)
                {
                    Width = 1120,
                    Height = 720,
                };
                engineerWindow.Show();
                try
                {
                    frames.Add(Capture(engineerWindow, artifactRoot, "engineer-pending-1120x720", "Car Controls", "Pending acknowledgement", "Push staged changes", "Staged Changes"));
                }
                finally
                {
                    engineerWindow.Close();
                }
            }, CancellationToken.None);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }

        var reportPath = WriteReport(artifactRoot, frames);
        return new AgentUiReviewResult(artifactRoot, reportPath, frames);
    }

    private static DashLayout WidgetCatalogDash()
    {
        var widgets = DashWidgetCatalog.All
            .OrderBy(widget => widget.Name, StringComparer.Ordinal)
            .Select((widget, index) => new DashWidget
            {
                Id = $"catalog-{widget.Type}",
                Type = widget.Type,
                Col = index % 4 * 5,
                Row = index / 4 * 2,
                ColSpan = 5,
                RowSpan = 2,
            })
            .ToList();

        return new DashLayout
        {
            Id = "widget-catalog",
            Name = "Widget catalog",
            GridCols = 20,
            GridRows = (int)Math.Ceiling(widgets.Count / 4d) * 2,
            Pages = [new DashPage { Id = "catalog", Name = "Catalog", Widgets = widgets }],
        };
    }

    // The import sheet's other states: searching, nothing found, working, and done. Each one
    // resolves inside the dialog rather than as a toast, so each one has to be reviewable.
    private static void CaptureImportResultsStates(List<AgentUiReviewFrame> frames, string artifactRoot)
    {
        const string source = "the Le Mans Ultimate results folder";
        var offered = new ResultsImportProposal(
            [new Sprint.Desktop.Api.Games.ResultsArchiveEntry("race.xml", 2048, DateTimeOffset.UnixEpoch)],
            new Dictionary<HistorySessionKind, int> { [HistorySessionKind.Race] = 2 });

        // Searching: the manual entry point opens the sheet first and looks inside it, so a
        // press is never answered by silence.
        var searching = new TaskCompletionSource<ResultsImportProposal>();
        Show(
            new ImportResultsController(source, null, () => searching.Task, _ => Task.FromResult(0), _ => { }),
            "import-results-searching",
            ["Import archived sessions", $"Looking through {source}"]);
        searching.SetResult(ResultsImportProposal.Empty);

        // Nothing new: stated in the dialog the driver is looking at, not thrown at the corner
        // of the screen where it can be missed and cannot be re-read.
        var nothing = new ImportResultsController(
            source,
            null,
            () => Task.FromResult(ResultsImportProposal.Empty),
            _ => Task.FromResult(0),
            _ => { });
        nothing.SearchAsync().GetAwaiter().GetResult();
        Show(nothing, "import-results-nothing-new", ["Nothing new to import"]);

        // Working: the same button, in place, saying so and refusing a second press.
        var gate = new TaskCompletionSource<int>();
        var importing = new ImportResultsController(
            source,
            offered,
            () => Task.FromResult(offered),
            _ => gate.Task,
            _ => { });
        var running = importing.ImportAsync();
        Show(importing, "import-results-importing", ["Importing"]);
        gate.SetResult(2);
        running.GetAwaiter().GetResult();

        // Done: the outcome as an alert inside the sheet, with one way out.
        Show(importing, "import-results-imported", ["Sessions imported", "2 sessions added to your lap history."]);

        void Show(ImportResultsController controller, string name, string[] expected)
        {
            var window = new Window
            {
                Width = 620,
                Height = 380,
                Background = Graphite.BgBrush,
                Content = new Border
                {
                    Padding = new Thickness(22),
                    Background = Graphite.Panel2Brush,
                    BorderBrush = Graphite.Line2Brush,
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(Graphite.RadiusXl),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Child = new ImportResultsDialog(controller, () => { }).Build(),
                },
            };
            window.Show();
            try
            {
                frames.Add(Capture(window, artifactRoot, name, expected));
            }
            finally
            {
                window.Close();
            }
        }
    }

    // Stands in for a game's results archive so the import prompt can be reviewed without one
    // on this machine. Nothing reads it: the prompt only shows the counts it was handed.
    private sealed class ReviewResultsImporter : Sprint.Desktop.Api.Games.IResultsImporter
    {
        public string SourceDescription => "the Le Mans Ultimate results folder";

        public IReadOnlyList<Sprint.Desktop.Api.Games.ResultsArchiveEntry> ListEntries() => [];

        public Sprint.Desktop.Api.Games.ImportedSession? Read(
            Sprint.Desktop.Api.Games.ResultsArchiveEntry entry) => null;
    }

    // The chart stack (#187) over a track-position domain: three charts, one axis, one shared
    // crosshair. Rendered through the real Avalonia control so the review sees what a page
    // would embed — the stack has no host in app code because placement is still open.
    private static void CaptureChartStack(List<AgentUiReviewFrame> frames, string artifactRoot)
    {
        static IReadOnlyList<ChartSample> Samples(Func<double, double> shape) =>
            [.. Enumerable.Range(0, 101).Select(i => new ChartSample(i / 100d, shape(i / 100d)))];

        var stack = new ChartStack(
            ChartDomain.TrackPosition(),
            [
                new ChartPanel("Speed", [new ChartSeries("This lap", Samples(x => 120 + (90 * Math.Sin(x * Math.PI * 3))))])
                {
                    Unit = "km/h",
                },
                new ChartPanel("Throttle", [new ChartSeries("This lap", Samples(x => Math.Clamp(Math.Sin(x * Math.PI * 3), 0, 1)))
                {
                    FillArea = true,
                }]),
                new ChartPanel("Brake", [new ChartSeries("This lap", Samples(x => Math.Clamp(-Math.Sin(x * Math.PI * 3), 0, 1)))
                {
                    FillArea = true,
                }]),
            ]);

        var view = new ChartStackView(stack) { Width = 900, Height = 500 };
        // The chart paints its own labels into a bitmap, so the only Avalonia text in this
        // frame is the heading a real host would supply. Expectations therefore name the
        // heading, not the painted axis titles — asserting on pixels is what the eye is for.
        var body = new StackPanel { Spacing = 12 };
        body.Children.Add(Graphite.SectionLabel("Chart stack · track position"));
        body.Children.Add(view);

        var window = new Window
        {
            Width = 960,
            Height = 600,
            Background = Graphite.BgBrush,
            Content = Graphite.Card(body, new Thickness(18, 16)),
        };

        window.Show();
        try
        {
            // Park the cursor so the frame shows the crosshair and the synchronised readouts
            // rather than an idle chart.
            view.Controller.MoveCursor(0.62);
            view.InvalidateVisual();
            frames.Add(Capture(window, artifactRoot, "charts-stack-track-position", "Chart stack · track position"));
        }
        finally
        {
            window.Close();
        }
    }

    // The plan-target selector (#186) over a hand-built corpus: one qualifying session on a
    // known date plus a practice session, so the review frame shows real scopes, resolved
    // times, sample sizes and the reference-curve/time-only tier rather than the empty state.
    private static void CapturePlanTargetSelector(
        List<AgentUiReviewFrame> frames,
        string artifactRoot,
        string dataRoot)
    {
        var service = new SessionPlannerService(
            new LocalSessionPlanStore(Path.Combine(dataRoot, "target-review-plans")));
        service.CreatePlan(new CreatePlanRequest
        {
            Name = "Spa 6h",
            Game = "Le Mans Ultimate",
            Car = "Porsche 963",
            Track = "Spa-Francorchamps",
            RaceLengthFormat = RaceLengthFormat.TimeBased,
            RaceLengthValue = 360,
        });

        var controller = new SessionPlannerController(
            service,
            NoFuelHistorySource.Instance,
            () => PlanContext.Empty,
            new ReviewLapHistoryStore());
        var view = new SessionPlannerView(
            controller,
            new SessionPlannerViewCallbacks(() => { }, (_, _, _, _) => { }, () => { }, () => { }, true));

        var window = new Window
        {
            Width = 1000,
            Height = 720,
            Background = Graphite.BgBrush,
            Content = view.Build(),
        };
        // The shell repaints the page on every controller change; this standalone window has to
        // do the same or the frame after a click would show the pre-click tree.
        controller.Changed += (_, _) => window.Content = view.Build();

        window.Show();
        try
        {
            frames.Add(Capture(
                window,
                artifactRoot,
                "session-planner-targets",
                "Qualifying lap-time target",
                "Scope",
                "Aim at",
                "Fastest · 2:11.0",
                "Median · 2:13.0",
                "Specific lap",
                "Set by hand"));

            // A chosen target states its provenance and its tier: which session it came from,
            // how many laps it was drawn from, and whether it can drive a real delta.
            Click(window, "Fastest · 2:11.0");
            frames.Add(Capture(
                window,
                artifactRoot,
                "session-planner-target-chosen",
                "Qualifying lap-time target",
                "2:11.0 · Current Quali · 2026-07-31 18:20 · fastest of 3 laps · reference curve",
                "Clear target"));

            // Once the session is live, targets latch at the start/finish line (#189), so the
            // card has to say that an edit made now does nothing to the lap being driven.
            service.StartTracking(service.Plans[0].Id, SegmentKind.Qualifying);
            window.Content = view.Build();
            frames.Add(Capture(
                window,
                artifactRoot,
                "session-planner-target-live-latch",
                "Applies from the next lap — the lap in progress keeps the target it started with."));
        }
        finally
        {
            window.Close();
        }
    }

    private sealed class ReviewLapHistoryStore : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() =>
        [
            Session("hs-q", HistorySessionKind.Qualifying, new DateTimeOffset(2026, 7, 31, 18, 20, 0, TimeSpan.Zero), 131, 133, 138),
            Session("hs-p", HistorySessionKind.Practice, new DateTimeOffset(2026, 7, 30, 10, 0, 0, TimeSpan.Zero), 136, 140, 145),
        ];

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();

        private static LapHistorySession Session(
            string id,
            HistorySessionKind kind,
            DateTimeOffset startedAt,
            params double[] lapTimes) => new()
        {
            Id = id,
            Kind = kind,
            StartedAt = startedAt,
            Context = new LapHistoryContext
            {
                Game = "Le Mans Ultimate",
                TrackCourse = "Spa-Francorchamps",
                CarModel = "Porsche 963",
            },
            Laps =
            [
                .. lapTimes.Select((time, index) => new LapHistoryRecord
                {
                    LapNumber = index + 1,
                    LapTimeSeconds = time,
                    ReferenceCurve = new LapReferenceCurve { TimesSeconds = [0, time] },
                }),
            ],
        };
    }

    private static AgentUiReviewFrame Capture(Window window, string artifactRoot, string name, params string[] expectedText)
    {
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        using var capturedFrame = frame!;

        var imagePath = Path.Combine(artifactRoot, $"{name}.png");
        capturedFrame.Save(imagePath, new PngBitmapEncoderOptions());

        var visibleText = window.GetVisualDescendants()
            .OfType<TextBlock>()
            .Select(text => text.Text ?? "")
            .Concat(window.GetVisualDescendants()
                .OfType<TextBox>()
                .Select(text => text.Text ?? ""))
            .Concat(window.GetVisualDescendants()
                .OfType<Button>()
                .Select(button => button.Content as string ?? ""))
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(text => text, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var failures = new List<string>();
        foreach (var text in expectedText)
        {
            if (!visibleText.Any(candidate => string.Equals(candidate, text, StringComparison.OrdinalIgnoreCase)))
            {
                failures.Add($"Missing visible text: {text}");
            }
        }

        var imageFailure = ValidateImage(capturedFrame);
        if (imageFailure is not null)
        {
            failures.Add(imageFailure);
        }

        return new AgentUiReviewFrame(name, imagePath, visibleText, failures);
    }

    private static AgentUiReviewFrame CaptureTransparentSelector(
        Window window,
        string artifactRoot,
        string name,
        params string[] expectedText)
    {
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        using var capturedFrame = frame!;
        var imagePath = Path.Combine(artifactRoot, $"{name}.png");
        capturedFrame.Save(imagePath, new PngBitmapEncoderOptions());

        var visibleText = window.GetVisualDescendants()
            .OfType<TextBlock>()
            .Select(text => text.Text ?? "")
            .Concat(window.GetVisualDescendants()
                .OfType<Button>()
                .Select(button => button.Content as string ?? ""))
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(text => text, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var failures = expectedText
            .Where(expected => !visibleText.Any(candidate =>
                string.Equals(candidate, expected, StringComparison.OrdinalIgnoreCase)))
            .Select(expected => $"Missing visible text: {expected}")
            .ToList();
        if (capturedFrame.PixelSize.Width <= 0 || capturedFrame.PixelSize.Height <= 0)
        {
            failures.Add("Captured selector frame has invalid dimensions.");
        }

        return new AgentUiReviewFrame(name, imagePath, visibleText, failures);
    }

    private static string? ValidateImage(Bitmap frame)
    {
        var pixelSize = frame.PixelSize;
        if (pixelSize.Width <= 0 || pixelSize.Height <= 0)
        {
            return "Captured frame has invalid dimensions.";
        }

        var stride = pixelSize.Width * 4;
        var bytes = new byte[stride * pixelSize.Height];
        using var copy = new WriteableBitmap(pixelSize, new Vector(96, 96), PixelFormat.Bgra8888, AlphaFormat.Premul);
        using (var framebuffer = copy.Lock())
        {
            frame.CopyPixels(framebuffer);
            Marshal.Copy(framebuffer.Address, bytes, 0, bytes.Length);
        }

        var visiblePixels = 0;
        var colorBuckets = new HashSet<int>();
        for (var i = 0; i < bytes.Length; i += 4)
        {
            var blue = bytes[i];
            var green = bytes[i + 1];
            var red = bytes[i + 2];
            var alpha = bytes[i + 3];
            if (alpha == 0)
            {
                continue;
            }

            visiblePixels++;
            colorBuckets.Add(((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5));
        }

        var totalPixels = pixelSize.Width * pixelSize.Height;
        if (visiblePixels <= totalPixels / 2)
        {
            return $"Captured frame has too few visible pixels: {visiblePixels} of {totalPixels}.";
        }

        if (colorBuckets.Count < 8)
        {
            return $"Captured frame has too little color variation: {colorBuckets.Count} buckets.";
        }

        return null;
    }

    private static void Click(MainWindow window, string label)
    {
        Click((Window)window, label);
        using var frame = window.CaptureRenderedFrame();
    }

    private static void ScrollToEnd(Window window)
    {
        var scroller = window.GetVisualDescendants()
            .OfType<ScrollViewer>()
            .OrderByDescending(candidate => candidate.Bounds.Width * candidate.Bounds.Height)
            .First();
        scroller.Offset = new Vector(scroller.Offset.X, scroller.Extent.Height);
        using var frame = window.CaptureRenderedFrame();
    }

    private static void Click(Window window, string label)
    {
        var button = window.GetVisualDescendants()
            .OfType<Button>()
            .FirstOrDefault(button => ButtonMatches(button, label));

        Assert.NotNull(button);
        button!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    }

    // Modal fields are identified by their placeholder: the Session Planner modal is built
    // from a shared helper, so a placeholder is the only per-field handle in the tree.
    private static TextBox TaggedPlaceholderTextBox(MainWindow window, string placeholder) =>
        window.GetVisualDescendants()
            .OfType<TextBox>()
            .Single(box => string.Equals(box.PlaceholderText, placeholder, StringComparison.Ordinal));

    private static ComboBox TaggedComboBox(MainWindow window, string tag) =>
        window.GetVisualDescendants()
            .OfType<ComboBox>()
            .Single(combo => string.Equals(combo.Tag?.ToString(), tag, StringComparison.Ordinal));

    private static void OpenCommandPalette(MainWindow window)
    {
        var trigger = window.GetVisualDescendants()
            .OfType<Button>()
            .Single(button => string.Equals(button.Tag?.ToString(), "command-palette-trigger", StringComparison.Ordinal));
        trigger.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        using var frame = window.CaptureRenderedFrame();
    }

    private static void ClickEditor(MainWindow window, string label)
    {
        var editor = Assert.Single(window.GetVisualDescendants().OfType<DashEditorView>());
        var button = editor.GetVisualDescendants()
            .OfType<Button>()
            .FirstOrDefault(button => ButtonMatches(button, label));

        Assert.NotNull(button);
        button!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        using var frame = window.CaptureRenderedFrame();
    }

    private static bool ButtonMatches(Button button, string label)
    {
        if (string.Equals(button.Content?.ToString(), label, StringComparison.Ordinal))
        {
            return true;
        }

        if (string.Equals(ToolTip.GetTip(button)?.ToString(), label, StringComparison.Ordinal))
        {
            return true;
        }

        return button.GetVisualDescendants()
            .OfType<TextBlock>()
            .Any(text => string.Equals(text.Text, label, StringComparison.Ordinal));
    }

    private static string WriteReport(string artifactRoot, IReadOnlyList<AgentUiReviewFrame> frames)
    {
        var reportPath = Path.Combine(artifactRoot, "report.html");
        var html = new StringBuilder();
        html.AppendLine("<!doctype html>");
        html.AppendLine("<html lang=\"en\">");
        html.AppendLine("<head>");
        html.AppendLine("<meta charset=\"utf-8\">");
        html.AppendLine("<title>Sprint agent UI review</title>");
        html.AppendLine("<style>");
        html.AppendLine("body{margin:24px;background:#111;color:#e8e8e8;font:14px Inter,Segoe UI,sans-serif}h1{font-size:24px;margin:0 0 8px}section{border:1px solid #333;margin:20px 0;padding:16px;background:#181818}img{display:block;max-width:100%;border:1px solid #333}.ok{color:#7bd88f}.fail{color:#ff7878}code{color:#ffb86b}.text{columns:3;line-height:1.5}");
        html.AppendLine("</style>");
        html.AppendLine("</head>");
        html.AppendLine("<body>");
        html.AppendLine("<h1>Sprint agent UI review</h1>");
        html.AppendLine("<p>Generated by <code>dotnet test app\\Sprint.Desktop.Tests\\Sprint.Desktop.Tests.csproj --filter AgentUiReview</code>. Agents should inspect the screenshots before claiming UI work is done.</p>");

        foreach (var frame in frames)
        {
            html.AppendLine("<section>");
            html.AppendLine($"<h2>{WebUtility.HtmlEncode(frame.Name)}</h2>");
            html.AppendLine(frame.Failures.Count == 0
                ? "<p class=\"ok\">Semantic checks passed.</p>"
                : $"<p class=\"fail\">{WebUtility.HtmlEncode(string.Join("; ", frame.Failures))}</p>");
            html.AppendLine($"<img src=\"{WebUtility.HtmlEncode(Path.GetFileName(frame.ImagePath))}\" alt=\"{WebUtility.HtmlEncode(frame.Name)} screenshot\">");
            html.AppendLine("<h3>Visible text</h3>");
            html.AppendLine("<div class=\"text\">");
            foreach (var text in frame.VisibleText.Take(80))
            {
                html.AppendLine($"<div>{WebUtility.HtmlEncode(text)}</div>");
            }
            html.AppendLine("</div>");
            html.AppendLine("</section>");
        }

        html.AppendLine("</body>");
        html.AppendLine("</html>");
        File.WriteAllText(reportPath, html.ToString());
        return reportPath;
    }
}

internal sealed record AgentUiReviewResult(string ArtifactRoot, string ReportPath, IReadOnlyList<AgentUiReviewFrame> Frames);

internal sealed record AgentUiReviewFrame(string Name, string ImagePath, IReadOnlyList<string> VisibleText, IReadOnlyList<string> Failures);
