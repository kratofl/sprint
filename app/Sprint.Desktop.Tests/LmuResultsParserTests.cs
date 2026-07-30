using Sprint.Games.LeMansUltimate.Results;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class LmuResultsParserTests
{
    // A trimmed but structurally faithful race result: rFactorXML/RaceResults with a
    // named session element (<Race>) holding <Driver> entries. Laps are DIRECT <Lap>
    // children of <Driver> (as in real files); the sibling <Laps> element is a scalar lap
    // COUNT, not a wrapper, and must not be descended into. Names are synthetic (no
    // real-player PII). Lap 1 is an out lap with the sim's "--.----" no-time placeholder
    // and no sector attributes.
    private const string RaceXml = """
        <?xml version="1.0" encoding="utf-8"?>
        <rFactorXML>
          <RaceResults>
            <TrackVenue>Sample Raceway</TrackVenue>
            <TrackCourse>Sample Raceway</TrackCourse>
            <TrackLength>5820.3</TrackLength>
            <RaceLaps>0</RaceLaps>
            <RaceTime>60</RaceTime>
            <DateTime>1782240911</DateTime>
            <TimeString>2026/06/23 20:55:11</TimeString>
            <GameVersion>1.3000</GameVersion>
            <Race>
              <Driver>
                <Name>Alpha Tester</Name>
                <VehName>Test 499P #1</VehName>
                <Category>WEC 2025, Hypercar, Ferrari 499P</Category>
                <CarType>Ferrari 499P</CarType>
                <CarClass>Hyper</CarClass>
                <CarNumber>1</CarNumber>
                <TeamName>Sample Team Purple</TeamName>
                <isPlayer>1</isPlayer>
                <GridPos>1</GridPos>
                <Position>2</Position>
                <ClassGridPos>1</ClassGridPos>
                <ClassPosition>2</ClassPosition>
                <Lap num="1" p="2" et="--.---" topspeed="210.81" fcompound="0,Medium" rcompound="0,Medium">--.----</Lap>
                <Lap num="2" p="2" et="240.5801" s1="40.7216" s2="28.8316" s3="38.5551" topspeed="287.83" fcompound="0,Medium" rcompound="0,Medium">108.1083</Lap>
                <Lap num="3" p="2" et="348.7000" s1="40.8718" s2="28.7522" s3="38.4118" topspeed="290.98" fcompound="0,Soft" rcompound="0,Soft">107.6273</Lap>
                <BestLapTime>107.6273</BestLapTime>
                <Laps>3</Laps>
                <Pitstops>1</Pitstops>
                <FinishStatus>Finished Normally</FinishStatus>
              </Driver>
              <Driver>
                <Name>Bravo Tester</Name>
                <VehName>Test 963 #7</VehName>
                <CarType>Porsche 963</CarType>
                <CarClass>Hyper</CarClass>
                <CarNumber>7</CarNumber>
                <TeamName>Sample Team Blue</TeamName>
                <isPlayer>0</isPlayer>
                <GridPos>2</GridPos>
                <Position>34</Position>
                <Pitstops>0</Pitstops>
                <FinishStatus>DNF</FinishStatus>
                <Lap num="1" p="3" et="126.9" s1="49.0" s2="30.0" s3="41.0" topspeed="280.0" fcompound="0,Medium" rcompound="0,Medium">120.0</Lap>
                <Laps>1</Laps>
              </Driver>
            </Race>
          </RaceResults>
        </rFactorXML>
        """;

    // Qualifying: session element <Qualify>, no grid positions, and laps with neither
    // sectors nor a completed time (all "--.----"/"--.---").
    private const string QualifyXml = """
        <?xml version="1.0"?>
        <rFactorXML>
          <RaceResults>
            <TrackVenue>Sample Raceway</TrackVenue>
            <RaceLaps>0</RaceLaps>
            <RaceTime>15</RaceTime>
            <Qualify>
              <Driver>
                <Name>Alpha Tester</Name>
                <CarClass>Hyper</CarClass>
                <CarNumber>1</CarNumber>
                <isPlayer>1</isPlayer>
                <Position>5</Position>
                <ClassPosition>5</ClassPosition>
                <Pitstops>0</Pitstops>
                <Lap num="1" p="5" et="--.---" topspeed="232.88" fcompound="0,Medium" rcompound="0,Medium">--.----</Lap>
                <Laps>1</Laps>
              </Driver>
            </Qualify>
          </RaceResults>
        </rFactorXML>
        """;

    // Practice: session element <Practice1>. Also exercises laps placed directly under
    // <Driver> (no <Laps> wrapper), which the parser must also accept.
    private const string PracticeXml = """
        <?xml version="1.0"?>
        <rFactorXML>
          <RaceResults>
            <TrackVenue>Sample Raceway</TrackVenue>
            <Practice1>
              <Driver>
                <Name>Alpha Tester</Name>
                <isPlayer>1</isPlayer>
                <Lap num="1" p="1" et="--.---" topspeed="210.81">--.----</Lap>
              </Driver>
            </Practice1>
          </RaceResults>
        </rFactorXML>
        """;

    [Fact]
    public void Parses_race_session_metadata()
    {
        var result = LmuResultsParser.Parse(RaceXml);

        Assert.Equal("Sample Raceway", result.TrackVenue);
        Assert.Equal("Sample Raceway", result.TrackCourse);
        Assert.Equal(5820.3, result.TrackLengthMeters);
        Assert.Equal(LmuSessionType.Race, result.SessionType);
        Assert.Equal("Race", result.RawSessionName);
        Assert.Equal(0, result.RaceLaps);
        Assert.Equal(60, result.RaceTimeMinutes);
        Assert.Equal("1.3000", result.GameVersion);
        Assert.Equal("2026/06/23 20:55:11", result.TimeString);
    }

    [Fact]
    public void Parses_datetime_as_unix_seconds_utc()
    {
        var result = LmuResultsParser.Parse(RaceXml);

        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1782240911), result.SessionTimeUtc);
    }

    [Fact]
    public void Identifies_player_and_field()
    {
        var result = LmuResultsParser.Parse(RaceXml);

        Assert.Equal(2, result.Drivers.Count);
        var player = Assert.Single(result.Drivers, d => d.IsPlayer);
        Assert.Same(player, result.Player);
        Assert.Equal("Alpha Tester", player.Name);
        Assert.Equal("Sample Team Purple", player.TeamName);
        Assert.Equal(1, player.CarNumber);
        Assert.Equal("Hyper", player.CarClass);
        Assert.Equal("Ferrari 499P", player.CarType);
        Assert.Equal("WEC 2025, Hypercar, Ferrari 499P", player.Category);
        Assert.Equal(1, player.GridPosition);
        Assert.Equal(2, player.FinishPosition);
        Assert.Equal(1, player.ClassGridPosition);
        Assert.Equal(2, player.ClassPosition);
        Assert.Equal(107.6273, player.BestLapTimeSeconds);
        Assert.Equal(1, player.PitStops);
        Assert.Equal("Finished Normally", player.FinishStatus);
    }

    [Fact]
    public void Parses_dnf_status_and_missing_optional_fields()
    {
        var result = LmuResultsParser.Parse(RaceXml);

        var dnf = Assert.Single(result.Drivers, d => !d.IsPlayer);
        Assert.Equal("DNF", dnf.FinishStatus);
        Assert.Equal(34, dnf.FinishPosition);
        Assert.Null(dnf.ClassGridPosition); // absent in the XML
        Assert.Null(dnf.BestLapTimeSeconds); // absent in the XML
    }

    [Fact]
    public void Parses_timed_lap_with_sectors_and_compound()
    {
        var result = LmuResultsParser.Parse(RaceXml);
        var laps = result.Player!.Laps;

        Assert.Equal(3, laps.Count);
        var lap3 = laps[2];
        Assert.Equal(3, lap3.LapNumber);
        Assert.Equal(2, lap3.Position);
        Assert.True(lap3.HasLapTime);
        Assert.Equal(107.6273, lap3.LapTimeSeconds);
        Assert.Equal(348.7, lap3.ElapsedTimeSeconds);
        Assert.Equal(40.8718, lap3.Sector1Seconds);
        Assert.Equal(28.7522, lap3.Sector2Seconds);
        Assert.Equal(38.4118, lap3.Sector3Seconds);
        Assert.Equal(290.98, lap3.TopSpeedKph);
        Assert.Equal("Soft", lap3.FrontCompound);
        Assert.Equal("Soft", lap3.RearCompound);
    }

    [Fact]
    public void Treats_dash_placeholders_as_no_time()
    {
        var result = LmuResultsParser.Parse(RaceXml);
        var outLap = result.Player!.Laps[0];

        Assert.Equal(1, outLap.LapNumber);
        Assert.False(outLap.HasLapTime);
        Assert.Null(outLap.LapTimeSeconds);
        Assert.Null(outLap.ElapsedTimeSeconds); // et="--.---"
        Assert.Null(outLap.Sector1Seconds); // attribute absent
        Assert.Equal(210.81, outLap.TopSpeedKph); // still present on an out lap
        Assert.Equal("Medium", outLap.FrontCompound);
    }

    [Fact]
    public void Classifies_qualifying_and_leaves_absent_grid_null()
    {
        var result = LmuResultsParser.Parse(QualifyXml);

        Assert.Equal(LmuSessionType.Qualifying, result.SessionType);
        Assert.Equal("Qualify", result.RawSessionName);
        var player = result.Player!;
        Assert.Null(player.GridPosition);
        Assert.Equal(5, player.FinishPosition);
        var lap = Assert.Single(player.Laps);
        Assert.False(lap.HasLapTime);
        Assert.Null(lap.Sector1Seconds);
        Assert.Equal(232.88, lap.TopSpeedKph);
    }

    [Fact]
    public void Classifies_practice_and_reads_laps_without_wrapper()
    {
        var result = LmuResultsParser.Parse(PracticeXml);

        Assert.Equal(LmuSessionType.Practice, result.SessionType);
        Assert.Equal("Practice1", result.RawSessionName);
        var lap = Assert.Single(result.Player!.Laps); // <Lap> directly under <Driver>
        Assert.Equal(1, lap.LapNumber);
        Assert.Null(lap.LapTimeSeconds);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Rejects_empty_input(string xml)
    {
        Assert.Throws<LmuResultParseException>(() => LmuResultsParser.Parse(xml));
    }

    [Fact]
    public void Rejects_malformed_xml()
    {
        Assert.Throws<LmuResultParseException>(() => LmuResultsParser.Parse("<rFactorXML><RaceResults>"));
    }

    [Fact]
    public void Rejects_document_without_race_results()
    {
        Assert.Throws<LmuResultParseException>(() => LmuResultsParser.Parse("<rFactorXML><Other/></rFactorXML>"));
    }

    [Fact]
    public void Accepts_race_results_as_root_element()
    {
        var result = LmuResultsParser.Parse("<RaceResults><TrackVenue>Root Course</TrackVenue><Race><Driver><Name>A</Name><isPlayer>1</isPlayer></Driver></Race></RaceResults>");

        Assert.Equal("Root Course", result.TrackVenue);
        Assert.Equal(LmuSessionType.Race, result.SessionType);
        Assert.NotNull(result.Player);
    }

    [Fact]
    public void Returns_empty_field_when_no_session_element_present()
    {
        var result = LmuResultsParser.Parse("<rFactorXML><RaceResults><TrackVenue>Empty</TrackVenue></RaceResults></rFactorXML>");

        Assert.Equal("Empty", result.TrackVenue);
        Assert.Empty(result.Drivers);
        Assert.Null(result.Player);
        Assert.Equal(LmuSessionType.Unknown, result.SessionType);
    }
}
