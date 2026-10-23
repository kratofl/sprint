using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;
using Sprint.Api.Live;
using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

/// <summary>
/// Live telemetry from the desktop's messages to a viewer's stream events, without sockets:
/// <see cref="LiveIngestConnection"/> → <see cref="LiveHub"/> → <see cref="LiveSubscription"/>,
/// with <see cref="EngineerService"/> deciding access.
/// </summary>
public class LiveTests
{
    private sealed record World(
        LiveHub Hub, EngineerService Engineers, CatalogService Catalog, RecordingStore Store, IDbContextFactory<SprintDbContext> Db,
        TestClock Clock, string Driver, string Engineer);

    private static async Task<World> NewWorld(TimeSpan? grace = null)
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        TestClock clock = new();
        LiveHub hub = new(clock, grace ?? TimeSpan.FromSeconds(30));
        EngineerService engineers = new(db, new PublicUrls(null, null), hub, clock);
        string driver = await TestUsers.AddAsync(db, "Alex");
        string engineer = await TestUsers.AddAsync(db, "Sam");
        await engineers.AcceptInviteAsync(engineer, (await engineers.CreateInviteAsync(driver)).Token);
        return new World(hub, engineers, new CatalogService(db), new RecordingStore(), db, clock, driver, engineer);
    }

    private static LiveIngestConnection Desktop(World w, string driverId) =>
        new(new AccountSummary { Id = driverId, DisplayName = "Alex" }, w.Hub, w.Catalog, w.Store, w.Clock);

    private static LiveStartMessage Start(string key) => new() { SessionKey = key, Game = "Le Mans Ultimate", Track = "Spa", Car = "963", SessionType = "Practice" };

    private static LiveSamplesMessage Samples(params LiveSample[] samples) => new() { Samples = samples };

    private static List<LiveStreamEvent> Drain(LiveSubscription subscription)
    {
        List<LiveStreamEvent> events = [];
        while (subscription.Events.TryRead(out LiveStreamEvent? item))
            events.Add(item);
        return events;
    }

    /// <summary>Joins as the SSE endpoint does; null when it would answer 403 or 404.</summary>
    private static async Task<LiveSubscription?> WatchAsync(World w, string viewer, string key) =>
        await w.Engineers.WatchAsync(viewer, key) is Watching watching ? watching.Subscription : null;

    [Fact]
    public async Task An_engineer_watching_gets_the_snapshot_then_each_batch_and_influx_gets_it_too()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        await desktop.HandleAsync(Samples(new LiveSample { Timestamp = 1, SpeedKph = 100 }), CancellationToken.None);

        using LiveSubscription sub = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");
        await desktop.HandleAsync(Samples(new LiveSample { Timestamp = 2, SpeedKph = 120 }), CancellationToken.None);

        List<LiveStreamEvent> events = Drain(sub);
        StreamSnapshot snapshot = Assert.IsType<StreamSnapshot>(events[0]);
        Assert.Equal(100, snapshot.Payload.Latest?.SpeedKph);
        Assert.Equal("Alex", snapshot.Payload.Session.Driver.DisplayName);
        Assert.Equal(120, Assert.Single(Assert.IsType<StreamSamples>(events[1]).Payload.Samples).SpeedKph);
        Assert.Equal([1L, 2L], w.Store.Samples.Select(s => s.Sample.Timestamp));
        Assert.All(w.Store.Samples, s => Assert.Equal((w.Driver, "s1"), (s.DriverId, s.SessionKey)));
    }

    [Fact]
    public async Task Starting_live_creates_the_session_so_it_is_listed_before_any_sync()
    {
        World w = await NewWorld();

        await Desktop(w, w.Driver).HandleAsync(Start("s1"), CancellationToken.None);

        VisibleSession session = Assert.Single(await w.Engineers.VisibleSessionsAsync(w.Engineer));
        Assert.Equal("s1", session.SessionKey);
        Assert.True(session.IsLive);
        Assert.Equal(session.Id, Assert.Single(await w.Engineers.LiveSessionsAsync(w.Engineer)).SessionId);
    }

    [Fact]
    public async Task Excluding_the_engineer_mid_session_revokes_their_stream_but_not_the_drivers()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        using LiveSubscription engineer = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");
        using LiveSubscription driver = await WatchAsync(w, w.Driver, "s1") ?? throw new InvalidOperationException("no access");
        string sessionId = (await w.Engineers.VisibleSessionsAsync(w.Driver))[0].Id;

        await w.Engineers.SetSessionAccessAsync(w.Driver, sessionId, w.Engineer, hasAccess: false);
        await desktop.HandleAsync(Samples(new LiveSample { Timestamp = 3 }), CancellationToken.None);

        Assert.IsType<StreamRevoked>(Drain(engineer)[^1]);
        Assert.True(engineer.Events.Completion.IsCompleted);
        Assert.IsType<StreamSamples>(Drain(driver)[^1]);
        Assert.Null(await WatchAsync(w, w.Engineer, "s1"));
        Assert.Empty(await w.Engineers.LiveSessionsAsync(w.Engineer));
    }

    [Fact]
    public async Task Removing_the_engineer_revokes_every_live_stream_of_theirs()
    {
        World w = await NewWorld();
        await Desktop(w, w.Driver).HandleAsync(Start("s1"), CancellationToken.None);
        using LiveSubscription engineer = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");

        await w.Engineers.RemoveEngineerAsync(w.Driver, w.Engineer);

        Assert.IsType<StreamRevoked>(Drain(engineer)[^1]);
    }

    [Fact]
    public async Task Ending_the_session_tells_viewers_and_closes_their_streams()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        using LiveSubscription engineer = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");

        await desktop.HandleAsync(new LiveEndMessage(), CancellationToken.None);

        Assert.IsType<StreamEnded>(Drain(engineer)[^1]);
        Assert.True(engineer.Events.Completion.IsCompleted);
        Assert.Null(w.Hub.Find(w.Driver, "s1"));
    }

    [Fact]
    public async Task A_new_start_on_the_same_connection_ends_the_previous_session()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);

        await desktop.HandleAsync(Start("s2"), CancellationToken.None);

        Assert.Null(w.Hub.Find(w.Driver, "s1"));
        Assert.NotNull(w.Hub.Find(w.Driver, "s2"));
    }

    [Fact]
    public async Task A_desktop_that_reconnects_in_time_resumes_and_its_viewers_stay_on()
    {
        World w = await NewWorld(TimeSpan.FromMilliseconds(100));
        LiveIngestConnection first = Desktop(w, w.Driver);
        await first.HandleAsync(Start("s1"), CancellationToken.None);
        using LiveSubscription engineer = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");

        first.Disconnected();
        Assert.False(w.Hub.Find(w.Driver, "s1")?.Session.Connected);
        LiveIngestConnection second = Desktop(w, w.Driver);
        await second.HandleAsync(Start("s1"), CancellationToken.None);
        await Task.Delay(300);
        await second.HandleAsync(Samples(new LiveSample { Timestamp = 5 }), CancellationToken.None);

        Assert.True(w.Hub.Find(w.Driver, "s1")?.Session.Connected);
        Assert.IsType<StreamSamples>(Drain(engineer)[^1]);
    }

    [Fact]
    public async Task A_desktop_that_does_not_come_back_ends_the_session_after_the_grace()
    {
        World w = await NewWorld(TimeSpan.FromMilliseconds(50));
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        using LiveSubscription engineer = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");

        desktop.Disconnected();
        for (int waited = 0; w.Hub.Find(w.Driver, "s1") is not null && waited < 5000; waited += 10)
            await Task.Delay(10);

        Assert.Null(w.Hub.Find(w.Driver, "s1"));
        Assert.IsType<StreamEnded>(Drain(engineer)[^1]);
    }

    [Fact]
    public async Task Another_account_streaming_under_a_copied_key_cannot_block_the_driver_or_reach_their_engineers()
    {
        World w = await NewWorld(TimeSpan.FromMilliseconds(50));
        LiveIngestConnection driver = Desktop(w, w.Driver);
        await driver.HandleAsync(Start("s1"), CancellationToken.None);
        driver.Disconnected();
        for (int waited = 0; w.Hub.Find(w.Driver, "s1") is not null && waited < 5000; waited += 10)
            await Task.Delay(10);

        // The engineer has seen the key and takes it while the driver is away.
        string? squat = await Desktop(w, w.Engineer).HandleAsync(Start("s1"), CancellationToken.None);
        string? resume = await Desktop(w, w.Driver).HandleAsync(Start("s1"), CancellationToken.None);

        Assert.Null(squat);
        Assert.Null(resume);
        Assert.True(w.Hub.Find(w.Driver, "s1")?.Session.Connected);
        string kim = await TestUsers.AddAsync(w.Db, "Kim");
        await w.Engineers.AcceptInviteAsync(kim, (await w.Engineers.CreateInviteAsync(w.Driver)).Token);
        using LiveSubscription watching = await WatchAsync(w, kim, "s1") ?? throw new InvalidOperationException("no access");
        Assert.Equal(w.Driver, watching.DriverId);
        Assert.Equal(w.Engineer, (await WatchAsync(w, w.Engineer, "s1"))?.DriverId);
    }

    [Fact]
    public async Task A_connection_sending_samples_faster_than_the_desktop_ever_does_is_closed()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        LiveSamplesMessage full = Samples([.. Enumerable.Range(0, LiveIngestConnection.MaxSamplesPerMessage).Select(i => new LiveSample { Timestamp = i })]);

        // A backlog flush after a slow send fits the burst ...
        for (int sent = 0; sent < LiveIngestConnection.MaxSampleBurst; sent += LiveIngestConnection.MaxSamplesPerMessage)
            Assert.Null(await desktop.HandleAsync(full, CancellationToken.None));
        // ... and the allowance refills at the steady rate, but no faster.
        w.Clock.Advance(TimeSpan.FromSeconds((double)LiveIngestConnection.MaxSamplesPerMessage / LiveIngestConnection.MaxSamplesPerSecond));
        Assert.Null(await desktop.HandleAsync(full, CancellationToken.None));
        Assert.NotNull(await desktop.HandleAsync(full, CancellationToken.None));
    }

    [Fact]
    public async Task A_live_session_keeps_only_the_latest_laps()
    {
        World w = await NewWorld();
        AccountSummary driver = new() { Id = w.Driver, DisplayName = "Alex" };
        object connection = new();
        w.Hub.Start(connection, driver, "id", Start("s1"));

        // Every sample after the first reports a new lap time, so each completes a lap.
        LiveSample[] samples = [.. Enumerable.Range(1, LiveHub.MaxLaps + 51).Select(i => new LiveSample { Timestamp = i, Lap = i, LastLapTime = i })];
        w.Hub.Publish(connection, w.Driver, "s1", samples);

        using LiveSubscription sub = w.Hub.Subscribe(w.Driver, "s1", w.Driver) ?? throw new InvalidOperationException("not live");
        IReadOnlyList<LiveLap> laps = Assert.IsType<StreamSnapshot>(Drain(sub)[0]).Payload.Laps;
        Assert.Equal(LiveHub.MaxLaps, laps.Count);
        Assert.Equal(LiveHub.MaxLaps + 51, laps[^1].LapTime);
    }

    [Fact]
    public async Task A_late_viewers_snapshot_carries_the_last_30_seconds_of_samples_and_nothing_older()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        // 40 s at 10 Hz, in the desktop's batches of a second.
        for (long second = 0; second < 40; second++)
            await desktop.HandleAsync(Samples([.. Enumerable.Range(0, 10).Select(i => new LiveSample { Timestamp = second * 1000 + i * 100 })]), CancellationToken.None);

        using LiveSubscription sub = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");

        LiveSnapshotEvent snapshot = Assert.IsType<StreamSnapshot>(Drain(sub)[0]).Payload;
        Assert.Equal(9_900, snapshot.Recent[0].Timestamp);
        Assert.Equal(39_900, snapshot.Recent[^1].Timestamp);
        Assert.Equal(301, snapshot.Recent.Count);
        Assert.Equal(snapshot.Latest, snapshot.Recent[^1]);
    }

    [Fact]
    public async Task A_live_session_keeps_at_most_the_recent_sample_cap_however_fast_they_come()
    {
        World w = await NewWorld();
        AccountSummary driver = new() { Id = w.Driver, DisplayName = "Alex" };
        object connection = new();
        w.Hub.Start(connection, driver, "id", Start("s1"));

        // All inside one second, so only the cap trims them.
        w.Hub.Publish(connection, w.Driver, "s1", [.. Enumerable.Range(0, LiveHub.MaxRecentSamples + 10).Select(i => new LiveSample { Timestamp = i })]);

        using LiveSubscription sub = w.Hub.Subscribe(w.Driver, "s1", w.Driver) ?? throw new InvalidOperationException("not live");
        IReadOnlyList<LiveSample> recent = Assert.IsType<StreamSnapshot>(Drain(sub)[0]).Payload.Recent;
        Assert.Equal(LiveHub.MaxRecentSamples, recent.Count);
        Assert.Equal(10, recent[0].Timestamp);
    }

    [Fact]
    public async Task A_start_without_a_session_key_or_an_oversized_batch_closes_the_connection()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);

        Assert.NotNull(await desktop.HandleAsync(Start(" "), CancellationToken.None));
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        LiveSample[] tooMany = [.. Enumerable.Range(0, LiveIngestConnection.MaxSamplesPerMessage + 1).Select(i => new LiveSample { Timestamp = i })];
        Assert.NotNull(await desktop.HandleAsync(Samples(tooMany), CancellationToken.None));
    }

    [Fact]
    public async Task A_completed_lap_reaches_viewers_and_storage()
    {
        World w = await NewWorld();
        LiveIngestConnection desktop = Desktop(w, w.Driver);
        await desktop.HandleAsync(Start("s1"), CancellationToken.None);
        using LiveSubscription engineer = await WatchAsync(w, w.Engineer, "s1") ?? throw new InvalidOperationException("no access");

        await desktop.HandleAsync(Samples(
            new LiveSample { Timestamp = 1, Lap = 3, LastLapTime = 0 },
            new LiveSample { Timestamp = 2, Lap = 4, LastLapTime = 0 },
            new LiveSample { Timestamp = 3, Lap = 4, LastLapTime = 125.4 }), CancellationToken.None);

        LiveLap lap = Assert.Single(Drain(engineer).OfType<StreamLap>()).Payload.Lap;
        Assert.Equal(new LiveLap { Lap = 3, LapTime = 125.4, Valid = true, CompletedAt = 3 }, lap);
        Assert.Equal(lap, Assert.Single(w.Store.Laps));
    }

    /// <summary>Keeps what would have gone to InfluxDB.</summary>
    private sealed class RecordingStore : ITelemetryStore
    {
        public List<(string DriverId, string SessionKey, LiveSample Sample)> Samples { get; } = [];
        public List<LiveLap> Laps { get; } = [];

        public void WriteSamples(string driverId, string sessionKey, IReadOnlyList<LiveSample> samples) =>
            this.Samples.AddRange(samples.Select(s => (driverId, sessionKey, s)));

        public void WriteLaps(string driverId, string sessionKey, IReadOnlyList<LiveLap> laps) => this.Laps.AddRange(laps);

        public Task<IReadOnlyList<LiveSample>> ReadSamplesAsync(string driverId, string sessionKey, DateTimeOffset from, int maxPoints, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<LiveSample>>([]);

        public Task<IReadOnlyList<LiveLap>> ReadLapsAsync(string driverId, string sessionKey, DateTimeOffset from, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<LiveLap>>([]);
    }
}

/// <summary>Spotting completed laps in the sample stream.</summary>
public class LapDetectorTests
{
    [Fact]
    public void A_lap_time_already_showing_when_streaming_starts_is_not_a_new_lap()
    {
        LapDetector detector = new();

        Assert.Null(detector.Next(new LiveSample { Lap = 5, LastLapTime = 120 }));
        Assert.Null(detector.Next(new LiveSample { Lap = 5, LastLapTime = 120 }));
    }

    [Fact]
    public void A_changed_lap_time_completes_the_previous_lap_with_that_laps_validity()
    {
        LapDetector detector = new();
        detector.Next(new LiveSample { Lap = 5, LastLapTime = 120, LapValid = false });

        LiveLap? lap = detector.Next(new LiveSample { Lap = 6, LastLapTime = 119.5, LapValid = true, Timestamp = 42 });

        Assert.Equal(new LiveLap { Lap = 5, LapTime = 119.5, Valid = false, CompletedAt = 42 }, lap);
    }
}

/// <summary>The wire: ingest JSON in, SSE text out.</summary>
public class LiveWireTests
{
    [Fact]
    public void The_three_ingest_messages_parse_with_type_anywhere_in_the_object()
    {
        LiveStartMessage start = Assert.IsType<LiveStartMessage>(LiveEndpoints.Parse(
            """{"sessionKey":"s1","game":"LMU","track":"Spa","car":"963","sessionType":"Race","type":"start"}"""));
        LiveSamplesMessage samples = Assert.IsType<LiveSamplesMessage>(LiveEndpoints.Parse(
            """{"type":"samples","samples":[{"timestamp":1700000000000,"speedKph":212.5,"gear":5,"lapValid":false,"tyreTempFl":88}]}"""));

        Assert.Equal(("s1", "Race"), (start.SessionKey, start.SessionType));
        LiveSample sample = Assert.Single(samples.Samples);
        Assert.Equal((1700000000000L, 212.5, 5, false, 88d), (sample.Timestamp, sample.SpeedKph, sample.Gear, sample.LapValid, sample.TyreTempFl));
        Assert.IsType<LiveEndMessage>(LiveEndpoints.Parse("""{"type":"end"}"""));
    }

    [Theory]
    [InlineData("""{"type":"pit"}""")]
    [InlineData("""{"sessionKey":"s1"}""")]
    [InlineData("not json")]
    public void Anything_else_is_not_a_message(string text) => Assert.Null(LiveEndpoints.Parse(text));

    [Fact]
    public void A_message_serialized_as_the_base_type_carries_its_type()
    {
        string json = System.Text.Json.JsonSerializer.Serialize<LiveIngestMessage>(new LiveEndMessage(), LiveEndpoints.Json);

        Assert.Equal("""{"type":"end"}""", json);
    }

    [Fact]
    public void Stream_events_are_written_as_named_sse_events()
    {
        string revoked = LiveEndpoints.Format(new StreamRevoked(new LiveClosedEvent { SessionKey = "s1", Reason = "gone" }));
        string samples = LiveEndpoints.Format(new StreamSamples(new LiveSamplesEvent { Samples = [new LiveSample { Timestamp = 7 }] }));

        Assert.Equal("event: revoked\ndata: {\"sessionKey\":\"s1\",\"reason\":\"gone\"}\n\n", revoked);
        Assert.StartsWith("event: samples\ndata: {\"samples\":[{\"timestamp\":7,", samples);
    }
}
