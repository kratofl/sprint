using Sprint.Desktop.Api.Telemetry;
using Sprint.Games;

using ITelemetrySource source = GameProviders.Default.CreateTelemetrySource();
source.Connect();

List<float> positions = [];
TelemetryFrame last = new();
int reads = 0;
for (int sample = 0; sample < 150; sample++)
{
    if (source.TryRead(out TelemetryFrame frame))
    {
        last = frame;
        reads++;
        positions.Add(frame.Lap.TrackPosition);
    }

    Thread.Sleep(20);
}

Console.WriteLine($"State={source.Status.State} Reads={reads} InCar={last.Session.InCar}");
Console.WriteLine($"Track={last.Session.Track} Car={last.Session.Car} Lap={last.Lap.CurrentLap}");
Console.WriteLine($"TrackLength={last.Session.TrackLengthMeters} LapTime={last.Lap.CurrentLapTime:0.000}");
Console.WriteLine(positions.Count == 0
    ? "Positions=none"
    : $"Positions={positions.Count} Distinct={positions.Distinct().Count()} Min={positions.Min():0.000000} Max={positions.Max():0.000000}");
