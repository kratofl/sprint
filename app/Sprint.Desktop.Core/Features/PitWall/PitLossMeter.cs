using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>
/// What a pit stop costs, measured from the stops it watches: each car's time from pit entry to
/// pit exit and how long it stood in its box. Fed every car on every scoring update on the game's
/// clock; shared by the engineer's pit wall (<see cref="PitWallAccumulator"/>) and the driver's
/// dash (<c>PitLossTracker</c>), so both quote the same figure. Not thread-safe: its owner
/// serialises the calls.
/// </summary>
public sealed class PitLossMeter
{
    // A stop longer than this went to the garage; a lane loss outside these bounds was not a plain stop.
    private const double MaxStanding = 300;
    private const double MinLaneLoss = 2;
    private const double MaxLaneLoss = 120;

    private readonly Dictionary<int, bool> _inPit = [];
    private readonly Dictionary<int, PitVisit> _visits = [];
    private readonly List<double> _laneLosses = [];
    private readonly List<StopTime> _standings = [];

    /// <summary>Forgets every stop: a new session.</summary>
    public void Clear()
    {
        this._inPit.Clear();
        this._visits.Clear();
        this._laneLosses.Clear();
        this._standings.Clear();
    }

    /// <summary>
    /// Times each stop from pit entry to pit exit and how long the car stood in its box. The lane
    /// loss is the time in the lane, less the standing, less what the same stretch takes at
    /// <paramref name="lapSeconds"/> (the car's best lap, else its last); only stops seen from their
    /// entry count. <paramref name="lapFraction"/> is how far round the lap the car is, 0–1.
    /// </summary>
    public void Follow(int carId, string carClass, bool inPit, PitState pitState, double lapFraction, double? lapSeconds, double now)
    {
        bool seenOut = this._inPit.TryGetValue(carId, out bool wasInPit) && !wasInPit;
        this._inPit[carId] = inPit;
        if (inPit)
        {
            if (!this._visits.TryGetValue(carId, out PitVisit? visit))
            {
                if (!seenOut)
                    return;
                visit = new PitVisit(now, lapFraction, 0, null);
            }

            this._visits[carId] = pitState == PitState.Stopped
                ? visit with { StoppedSince = visit.StoppedSince ?? now }
                : visit with { Standing = visit.Standing + (visit.StoppedSince is { } since ? now - since : 0), StoppedSince = null };
            return;
        }

        if (!this._visits.Remove(carId, out PitVisit? done))
            return;

        double standing = done.Standing + (done.StoppedSince is { } stoodSince ? now - stoodSince : 0);
        if (standing > MaxStanding || now <= done.EntryTime)
            return;

        if (standing > 1)
            this._standings.Add(new StopTime(carId, carClass, standing));

        if (lapSeconds is > 0 and { } lap)
        {
            double forward = lapFraction - done.EntryFraction;
            double lane = now - done.EntryTime - standing - ((forward < 0 ? forward + 1 : forward) * lap);
            if (lane is >= MinLaneLoss and <= MaxLaneLoss)
                this._laneLosses.Add(lane);
        }
    }

    /// <summary>
    /// The median lane loss of every stop seen; the standing time from the stops of the car
    /// <paramref name="ownId"/> (their mean), else the median of its class's. Seconds to a tenth;
    /// null until seen.
    /// </summary>
    public PitWallPitLoss Loss(int? ownId, string? ownClass)
    {
        List<double> ours = [.. this._standings.Where(stop => ownId is not null && stop.CarId == ownId).Select(stop => stop.Seconds)];
        List<double> theirs = [.. this._standings.Where(stop => ownClass is not null && stop.CarClass == ownClass).Select(stop => stop.Seconds)];
        double? standing = ours.Count > 0 ? ours.Average() : Median(theirs);
        return new PitWallPitLoss(
            Round(Median(this._laneLosses)),
            this._laneLosses.Count,
            Round(standing),
            ours.Count > 0 ? ours.Count : theirs.Count,
            ours.Count > 0);
    }

    private static double? Median(List<double> values)
    {
        if (values.Count == 0)
            return null;

        List<double> sorted = [.. values.Order()];
        int middle = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    private static double? Round(double? value) => value is { } known ? Math.Round(known, 1) : null;

    /// <summary>A stop under way: when and where the car entered the lane, the time it stood so far, and since when it stands now.</summary>
    private sealed record PitVisit(double EntryTime, double EntryFraction, double Standing, double? StoppedSince);

    private sealed record StopTime(int CarId, string CarClass, double Seconds);
}
