using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.VisualTree;
using Sprint.Desktop;
using Sprint.Desktop.Features.Dashes;
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
                using (var painter = new DashPainter(800, 480, DashPalette.FromTheme(defaultDash.Theme)))
                {
                    var imagePath = Path.Combine(artifactRoot, "default-dash-800x480.png");
                    File.WriteAllBytes(imagePath, painter.RenderPng(
                        defaultDash,
                        DashPreviewFrames.For(DashPreviewState.MidLap),
                        runtime.Settings));
                    using var bitmap = new Bitmap(imagePath);
                    var failure = ValidateImage(bitmap);
                    frames.Add(new AgentUiReviewFrame(
                        "default-dash-800x480",
                        imagePath,
                        ["RPM", "lap timing", "gear and speed", "delta", "sectors", "controls"],
                        failure is null ? [] : [failure]));
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

                    Click(window, "Devices");
                    frames.Add(Capture(window, artifactRoot, "devices-overview", "Devices", "Saved devices", "Add device", runtime.Devices[0].Name, "Review Screen"));

                    Click(window, runtime.Devices[0].Name);
                    frames.Add(Capture(window, artifactRoot, "devices-detail", "Add device", "Device bindings", runtime.Devices[0].Name));

                    Click(window, "Setups");
                    frames.Add(Capture(window, artifactRoot, "setups-templates-readonly", "Setups", "Setup templates", "User setups", "Duplicate template"));

                    Click(window, "Duplicate template");
                    frames.Add(Capture(window, artifactRoot, "setups-duplicated-user-copy", "Setups", "Delete", runtime.SetupPrograms[0].Name));

                    Click(window, "Delete");
                    frames.Add(Capture(window, artifactRoot, "confirm-dialog", "Delete setup?", "Cancel", "Delete setup"));
                    Click(window, "Cancel");

                    // Capture Settings and Help before opening the dash editor: the editor
                    // toolbar has its own "Settings" tab that would otherwise shadow the
                    // sidebar navigation button of the same label.
                    Click(window, "Settings");
                    frames.Add(Capture(window, artifactRoot, "settings-global-defaults", "Settings", "Profile", "Dash defaults"));

                    Click(window, "Help");
                    frames.Add(Capture(window, artifactRoot, "help-reference", "Help", "Getting started", "Telemetry status", "Keyboard shortcuts"));

                    window.RaiseEvent(new KeyEventArgs
                    {
                        RoutedEvent = InputElement.KeyDownEvent,
                        Source = window,
                        Key = Key.K,
                        KeyModifiers = KeyModifiers.Control,
                    });
                    frames.Add(Capture(window, artifactRoot, "command-palette", "Go to Home", "Create dash", "Add device"));
                    window.GetVisualDescendants().OfType<TextBox>()
                        .Single(box => string.Equals(box.Tag?.ToString(), "command-palette-search", StringComparison.Ordinal))
                        .RaiseEvent(new KeyEventArgs
                        {
                            RoutedEvent = InputElement.KeyDownEvent,
                            Key = Key.Escape,
                        });

                    Click(window, "Dashes");
                    frames.Add(Capture(window, artifactRoot, "dash-editor-list", "Dashes", "Create dash", "Edit"));

                    Click(window, "Edit");
                    frames.Add(Capture(window, artifactRoot, "dash-editor-layout", "Layout", "Alerts", "Settings", "Widgets", "Properties"));
                }
                finally
                {
                    window.Close();
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

    private static AgentUiReviewFrame Capture(MainWindow window, string artifactRoot, string name, params string[] expectedText)
    {
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        using var capturedFrame = frame!;

        var imagePath = Path.Combine(artifactRoot, $"{name}.png");
        capturedFrame.Save(imagePath);

        var visibleText = window.GetVisualDescendants()
            .OfType<TextBlock>()
            .Select(text => text.Text ?? "")
            .Concat(window.GetVisualDescendants()
                .OfType<TextBox>()
                .Select(text => text.Text ?? ""))
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
        var button = window.GetVisualDescendants()
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
