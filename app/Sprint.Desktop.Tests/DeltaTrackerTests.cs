using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Pure delta-augmentation behaviour over hand-built frames — the mandatory coverage
/// for the highest-risk WS4 logic (a subtly wrong rule first shows up here). Pins
/// reference adoption (complete + valid + faster), the position-relative sign,
/// interpolation + clamping, non-mutation, and the reset triggers.
/// </summary>
public sealed class DeltaTrackerTests
{
    private static TelemetryFrame Frame(
        double pos,
        double lapTime,
        int lap,
        double lastLap = 0,
        bool valid = true,
        bool inCar = true,
        string track = "Spa",
        SessionType session = SessionType.Race) => new()
    {
        Session = new SessionInfo { Track = track, SessionType = session, InCar = inCar },
        Lap = new LapState
        {
            TrackPosition = (float)pos,
            CurrentLapTime = lapTime,
            CurrentLap = lap,
            LastLapTime = lastLap,
            IsValid = valid
        }
    };

    // Drive a whole lap's worth of samples (positions strictly increasing 0→~1) at a
    // constant pace so CurrentLapTime == pos * pace, then return the tracker.
    private static void DriveLap(DeltaTracker tracker, int lap, double pace, int samples = 20, bool valid = true)
    {
        for (var i = 1; i <= samples; i++)
        {
            var pos = (double)i / (samples + 1); // never exactly 0 or 1
            tracker.Augment(Frame(pos, pos * pace, lap, valid: valid));
        }
    }

    // Cross the start/finish line: the boundary frame carries the NEW lap number and
    // the just-completed lap's authoritative LastLapTime, with CurrentLapTime reseeded.
    private static TelemetryFrame Boundary(int newLap, double completedLapTime) =>
        Frame(pos: 0.001, lapTime: 0.0, lap: newLap, lastLap: completedLapTime);

    [Fact]
    public void No_reference_yet_leaves_the_frame_unchanged()
    {
        var tracker = new DeltaTracker();

        var result = tracker.Augment(Frame(pos: 0.5, lapTime: 45, lap: 1));

        Assert.Equal(0, result.Lap.Delta);
        Assert.Equal(0, result.Lap.TargetLapTime);
    }

    [Fact]
    public void Adopts_first_complete_valid_lap_then_reports_target_and_delta()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100)); // finalize + adopt lap 1

        // Half-way round lap 2, 5s slower than the reference at this position.
        var result = tracker.Augment(Frame(pos: 0.5, lapTime: 55, lap: 2));

        Assert.Equal(100, result.Lap.TargetLapTime, precision: 6);
        Assert.Equal(5.0, result.Lap.Delta, precision: 3); // behind ⇒ positive (float TrackPosition ⇒ ~µs noise)
    }

    [Fact]
    public void Delta_is_negative_when_ahead_of_the_reference()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        var result = tracker.Augment(Frame(pos: 0.5, lapTime: 45, lap: 2)); // 5s faster

        Assert.Equal(-5.0, result.Lap.Delta, precision: 3);
    }

    [Fact]
    public void Reference_total_comes_from_last_lap_time_not_the_reseeded_boundary_frame()
    {
        var tracker = new DeltaTracker();

        // The completed lap was paced at 100, but the boundary frame's CurrentLapTime is
        // already reseeded to ~0. The reference total must be the LastLapTime (100).
        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        var result = tracker.Augment(Frame(pos: 0.5, lapTime: 50, lap: 2));

        Assert.Equal(100, result.Lap.TargetLapTime, precision: 6);
        Assert.Equal(0.0, result.Lap.Delta, precision: 3); // exactly on the reference pace
    }

    [Fact]
    public void Faster_lap_replaces_the_reference_slower_lap_does_not()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        // Lap 2 is slower (110) — must NOT replace the 100 reference.
        DriveLap(tracker, lap: 2, pace: 110);
        tracker.Augment(Boundary(newLap: 3, completedLapTime: 110));
        Assert.Equal(100, tracker.Augment(Frame(0.5, 50, 3)).Lap.TargetLapTime, precision: 6);

        // Lap 3 is faster (90) — must replace.
        DriveLap(tracker, lap: 3, pace: 90);
        tracker.Augment(Boundary(newLap: 4, completedLapTime: 90));
        Assert.Equal(90, tracker.Augment(Frame(0.5, 45, 4)).Lap.TargetLapTime, precision: 6);
    }

    [Fact]
    public void Invalid_lap_is_not_adopted_as_a_reference()
    {
        var tracker = new DeltaTracker();

        // One frame of the lap reports invalid (track-limit cut) ⇒ the whole lap is
        // disqualified, even though every other frame is valid.
        for (var i = 1; i <= 20; i++)
        {
            var pos = (double)i / 21;
            tracker.Augment(Frame(pos, pos * 100, lap: 1, valid: i != 10));
        }

        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        // No reference adopted ⇒ delta stays 0.
        Assert.Equal(0, tracker.Augment(Frame(0.5, 55, 2)).Lap.Delta);
    }

    [Fact]
    public void Partial_lap_joined_mid_session_is_not_adopted()
    {
        var tracker = new DeltaTracker();

        // Join at half-distance: the trace never covers the start of the lap.
        for (var i = 10; i <= 20; i++)
        {
            var pos = (double)i / 21;
            tracker.Augment(Frame(pos, pos * 100, lap: 5));
        }

        tracker.Augment(Boundary(newLap: 6, completedLapTime: 100));

        Assert.Equal(0, tracker.Augment(Frame(0.5, 55, 6)).Lap.Delta);
    }

    [Fact]
    public void Interpolates_between_reference_samples_and_clamps_at_the_ends()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 1, pace: 100, samples: 10); // sparse: ~0.09 apart
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        // A position that falls between two reference samples ⇒ linear interpolation
        // of a straight line gives exactly pos*100.
        Assert.Equal(0.0, tracker.Augment(Frame(0.337, 33.7, 2)).Lap.Delta, precision: 3);

        // Before the first sample: clamped to the first time (no wild extrapolation).
        Assert.True(double.IsFinite(tracker.Augment(Frame(0.001, 0.0, 2)).Lap.Delta));

        // Past the last sample: reference time is the full lap total.
        var nearEnd = tracker.Augment(Frame(0.999, 100, 2));
        Assert.Equal(0.0, nearEnd.Lap.Delta, precision: 3);
    }

    [Fact]
    public void Lap_number_going_backwards_resets_the_reference()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 8, pace: 100);
        tracker.Augment(Boundary(newLap: 9, completedLapTime: 100));
        Assert.NotEqual(0, tracker.Augment(Frame(0.5, 55, 9)).Lap.Delta);

        // Session restart / teleport: lap number drops far below the current one.
        var afterRestart = tracker.Augment(Frame(0.5, 55, lap: 1));
        Assert.Equal(0, afterRestart.Lap.Delta);
        Assert.Equal(0, afterRestart.Lap.TargetLapTime);
    }

    [Fact]
    public void Leaving_the_car_suppresses_delta_and_does_not_splice_the_next_stint()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        // Out of the car: no delta.
        var pits = tracker.Augment(Frame(0.5, 55, lap: 2, inCar: false));
        Assert.Equal(0, pits.Lap.Delta);

        // Back in the car: the reference survives (still a valid target this session),
        // so delta resumes immediately rather than re-learning a lap.
        var resumed = tracker.Augment(Frame(0.5, 55, lap: 2));
        Assert.Equal(5.0, resumed.Lap.Delta, precision: 3);
    }

    [Fact]
    public void Augment_never_mutates_the_input_frame()
    {
        var tracker = new DeltaTracker();
        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        var input = Frame(0.5, 55, 2);
        var output = tracker.Augment(input);

        Assert.Equal(0, input.Lap.Delta);          // input untouched
        Assert.Equal(0, input.Lap.TargetLapTime);
        Assert.NotEqual(0, output.Lap.Delta);       // output carries the computed values
        Assert.NotSame(input, output);
    }

    [Fact]
    public void Manual_reference_before_any_lap_does_not_block_auto_adoption()
    {
        var tracker = new DeltaTracker();
        tracker.SetManualReference(); // nothing to pin yet — must be a no-op, not a poison pill

        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));

        // Auto-adoption still happened despite the premature pin.
        Assert.Equal(100, tracker.Augment(Frame(0.5, 55, 2)).Lap.TargetLapTime, precision: 6);
    }

    [Fact]
    public void Changing_track_after_leaving_the_car_discards_the_stale_reference()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 1, pace: 100); // on "Spa" (the Frame default)
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));
        Assert.NotEqual(0, tracker.Augment(Frame(0.5, 55, lap: 2)).Lap.Delta);

        // Return to the garage (out of car), then load a different venue.
        tracker.Augment(Frame(0.5, 55, lap: 2, inCar: false));
        var onNewTrack = tracker.Augment(Frame(0.5, 55, lap: 2, track: "Monza"));

        Assert.Equal(0, onNewTrack.Lap.Delta);          // Spa's reference is gone
        Assert.Equal(0, onNewTrack.Lap.TargetLapTime);
    }

    [Fact]
    public void Position_wrap_without_a_lap_increment_does_not_spike_the_delta()
    {
        var tracker = new DeltaTracker();
        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100)); // adopt the 100 reference

        // Near the line on lap 2: on the reference pace ⇒ ~0 delta.
        var nearLine = tracker.Augment(Frame(pos: 0.95, lapTime: 95, lap: 2));
        Assert.True(Math.Abs(nearLine.Lap.Delta) < 1);

        // Region desync: track position (scoring) wraps to ~0 but the lap number
        // (telemetry) has NOT ticked and CurrentLapTime is still ~a full lap. A naive
        // delta would read ~+93s; the tracker must hold the last delta instead.
        var skew = tracker.Augment(Frame(pos: 0.02, lapTime: 95, lap: 2));
        Assert.True(Math.Abs(skew.Lap.Delta) < 2, $"line desync must not spike the delta, got {skew.Lap.Delta}");
    }

    [Fact]
    public void Manual_reference_pins_the_target_against_a_faster_lap()
    {
        var tracker = new DeltaTracker();

        DriveLap(tracker, lap: 1, pace: 100);
        tracker.Augment(Boundary(newLap: 2, completedLapTime: 100));
        tracker.SetManualReference(); // pin the 100 reference

        // A faster lap completes but must NOT replace the pinned reference.
        DriveLap(tracker, lap: 2, pace: 90);
        tracker.Augment(Boundary(newLap: 3, completedLapTime: 90));
        Assert.Equal(100, tracker.Augment(Frame(0.5, 50, 3)).Lap.TargetLapTime, precision: 6);

        // Releasing the pin lets the next faster lap take over.
        tracker.ClearManualReference();
        DriveLap(tracker, lap: 3, pace: 88);
        tracker.Augment(Boundary(newLap: 4, completedLapTime: 88));
        Assert.Equal(88, tracker.Augment(Frame(0.5, 44, 4)).Lap.TargetLapTime, precision: 6);
    }
}
