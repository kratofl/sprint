using Avalonia.Controls;
using Avalonia.Threading;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// Opens, drives and closes the Live Compare overlay set (#195) — the small windows that show
/// throttle, brake and speed against the target lap, plus the delta.
/// <para>
/// The set exists because a driver places each reading where their eyes already are, which one
/// window holding a stack of charts cannot express. That leaves one thing genuinely shared
/// between the windows: the frame. This host owns it — one timer, one fullscreen check and one
/// resample of the rolling window per repaint, sliced out to each window. Four windows each
/// pulling their own snapshot would do the same work four times for one frame on screen.
/// </para>
/// </summary>
public sealed class CompareHudHost
{
    /// <summary>
    /// Repaint rate. Matched to the UI's snapshot drain, not to the 200 Hz telemetry poll —
    /// resampling the window is real work and nobody can see frames a monitor never shows.
    /// </summary>
    private static readonly TimeSpan FrameInterval = TimeSpan.FromMilliseconds(33);

    /// <summary>How often the exclusive-fullscreen state is re-checked. It changes rarely.</summary>
    private static readonly TimeSpan FullscreenCheckInterval = TimeSpan.FromSeconds(2);

    /// <summary>
    /// The message shown when the driver's game has taken the screen exclusively. Public so the
    /// Sprint window can say the same thing where the driver is actually looking — they cannot
    /// see the overlay, which is the entire problem.
    /// </summary>
    public const string FullscreenNotice =
        "Your game is running in exclusive fullscreen, so this overlay cannot be shown. "
        + "Switch the game to borderless or windowed mode.";

    private readonly Window _owner;
    private readonly LiveCompareController _controller;
    private readonly LiveCompareSettings _settings;
    private readonly Action _persist;
    private readonly DispatcherTimer _timer;

    private readonly List<HudOverlayWindow> _windows = [];
    private readonly List<CompareHudWindow> _charts = [];

    private CompareDeltaWindow? _delta;
    private DateTimeOffset _lastFullscreenCheck = DateTimeOffset.MinValue;
    private bool _blocked;

    /// <param name="owner">
    /// The Sprint window. Only its monitor list is used: the overlay windows are top-level and
    /// deliberately not owned by it, so minimising Sprint does not take the HUD off the game.
    /// </param>
    public CompareHudHost(
        Window owner,
        LiveCompareController controller,
        LiveCompareSettings settings,
        Action persist)
    {
        _owner = owner ?? throw new ArgumentNullException(nameof(owner));
        _controller = controller ?? throw new ArgumentNullException(nameof(controller));
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _persist = persist ?? throw new ArgumentNullException(nameof(persist));

        _timer = new DispatcherTimer { Interval = FrameInterval };
        _timer.Tick += (_, _) => Tick();
    }

    /// <summary>Whether any window of the set is on screen.</summary>
    public bool IsOpen => _windows.Count > 0;

    /// <summary>Whether the set is click-through.</summary>
    public bool Locked => _settings.Locked;

    /// <summary>The whole set, or none of it. Bound to <c>compare.hud.toggle</c>.</summary>
    public void Toggle()
    {
        if (IsOpen)
        {
            Close();
        }
        else
        {
            Open();
        }
    }

    /// <summary>
    /// Opens every window in the plan. Windows the driver closed one at a time come back here:
    /// the toggle is the way back to a complete overlay, and remembering which ones were
    /// dismissed would make "show the HUD" mean something different on every press.
    /// </summary>
    public void Open()
    {
        if (IsOpen)
        {
            return;
        }

        var specs = HudWindowPlan.Build(_settings);
        if (specs.Count == 0)
        {
            return;
        }

        // The controller draws exactly the panels the chart windows will slice out of its
        // stack, in the same order, so window i always gets chart i.
        _controller.Panels = HudWindowPlan.Panels(specs);

        var screens = Screens();
        var column = screens.Count > 0
            ? HudLayoutStore.DefaultColumn(specs, screens[0])
            : [];

        for (var i = 0; i < specs.Count; i++)
        {
            var spec = specs[i];
            var layout = HudLayoutStore.Restore(_settings, spec.Id, screens)
                ?? (i < column.Count ? column[i] : null);
            if (layout is null)
            {
                continue;
            }

            HudOverlayWindow window;
            if (spec.Panel is null)
            {
                _delta = new CompareDeltaWindow(spec, _settings, _persist, layout);
                window = _delta;
            }
            else
            {
                var chart = new CompareHudWindow(spec, _settings, _persist, layout);
                _charts.Add(chart);
                window = chart;
            }

            _windows.Add(window);
            window.Closed += (_, _) => Forget(window);
            window.Show();
        }

        if (!IsOpen)
        {
            return;
        }

        // Draw the first frame now rather than up to 33 ms from now, so the set never appears
        // as a row of empty boxes.
        Tick();
        _timer.Start();
    }

    /// <summary>Closes the whole set.</summary>
    public void Close()
    {
        foreach (var window in _windows.ToArray())
        {
            window.Close();
        }

        // Closed handlers normally empty these; clearing here covers a window that was never
        // shown, so a second Open() cannot inherit a stale list.
        _windows.Clear();
        _charts.Clear();
        _delta = null;
        _timer.Stop();
    }

    /// <summary>
    /// Turns click-through on or off for every window at once. Locking is "I am done placing
    /// these and about to drive", which is never true of one window only.
    /// </summary>
    public void SetLocked(bool locked)
    {
        _settings.Locked = locked;
        _persist();
        foreach (var window in _windows)
        {
            window.SetLocked(locked);
        }
    }

    private void Forget(HudOverlayWindow window)
    {
        _windows.Remove(window);
        if (window is CompareHudWindow chart)
        {
            _charts.Remove(chart);
        }

        if (ReferenceEquals(window, _delta))
        {
            _delta = null;
        }

        if (!IsOpen)
        {
            _timer.Stop();
        }
    }

    private void Tick()
    {
        CheckFullscreen();

        var frame = _controller.Snapshot();
        _delta?.Update(frame);

        for (var i = 0; i < _charts.Count; i++)
        {
            _charts[i].Update(ChartFor(frame, i));
        }
    }

    /// <summary>
    /// Chart <paramref name="index"/> on its own, over the set's shared domain.
    /// <para>
    /// Each window renders a one-chart stack rather than the whole one. The stack's contract is
    /// that every chart in it shares an X domain for one crosshair — with the charts in separate
    /// windows there is no shared crosshair left to honour, and handing a window the full stack
    /// would draw all three panels in it.
    /// </para>
    /// </summary>
    private static ChartStack? ChartFor(LiveCompareFrame? frame, int index)
    {
        if (frame is null || index >= frame.Stack.Charts.Count)
        {
            return null;
        }

        return new ChartStack(frame.Stack.Domain, [frame.Stack.Charts[index]]);
    }

    private void CheckFullscreen()
    {
        var now = DateTimeOffset.UtcNow;
        if (now - _lastFullscreenCheck < FullscreenCheckInterval)
        {
            return;
        }

        _lastFullscreenCheck = now;
        var blocked = HudInterop.IsExclusiveFullscreenActive();
        if (blocked == _blocked)
        {
            return;
        }

        _blocked = blocked;
        // On one window only. It is one fact about the desktop, and stamping it across four
        // small windows would bury the traces under four copies of the same warning.
        _windows.FirstOrDefault()?.SetNotice(blocked ? FullscreenNotice : null);
    }

    private IReadOnlyList<HudScreen> Screens()
    {
        var all = _owner.Screens?.All;
        if (all is null || all.Count == 0)
        {
            return [];
        }

        // The screen Sprint is on comes first, so a first open lands where the driver is and
        // Restore prefers that monitor's saved layout over another's.
        var ordered = all.Select(HudOverlayWindow.ToHudScreen).ToList();
        if (_owner.Screens?.ScreenFromWindow(_owner) is { } here)
        {
            var current = HudOverlayWindow.ToHudScreen(here);
            ordered.Remove(current);
            ordered.Insert(0, current);
        }

        return ordered;
    }
}
