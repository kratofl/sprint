using Sprint.Games.LeMansUltimate.Results;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class LmuResultsReaderTests : IDisposable
{
    private readonly string _dir;

    public LmuResultsReaderTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "sprint-lmu-results-" + Guid.NewGuid().ToString("N"));
        System.IO.Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try
        {
            System.IO.Directory.Delete(_dir, recursive: true);
        }
        catch (IOException)
        {
            // Best-effort temp cleanup; a locked file must not fail the test run.
        }
    }

    private static string SessionXml(string venue, string session) => $"""
        <rFactorXML><RaceResults>
          <TrackVenue>{venue}</TrackVenue>
          <{session}><Driver><Name>Alpha</Name><isPlayer>1</isPlayer>
            <Lap num="1" p="1" s1="40.0" s2="28.0" s3="38.0">106.0</Lap>
          </Driver></{session}>
        </RaceResults></rFactorXML>
        """;

    private string WriteFile(string name, string content, DateTime lastWriteUtc)
    {
        var path = Path.Combine(_dir, name);
        File.WriteAllText(path, content);
        File.SetLastWriteTimeUtc(path, lastWriteUtc);
        return path;
    }

    [Fact]
    public void Lists_only_xml_files_newest_first()
    {
        var baseTime = new DateTime(2026, 6, 20, 12, 0, 0, DateTimeKind.Utc);
        WriteFile("2026_06_20-old.xml", SessionXml("Old", "Race"), baseTime);
        WriteFile("2026_06_22-new.xml", SessionXml("New", "Race"), baseTime.AddDays(2));
        WriteFile("BatchTemplateR1.ini", "not a result", baseTime.AddDays(3)); // must be ignored

        var reader = new LmuResultsReader(_dir);
        var files = reader.ListResultFiles();

        Assert.Equal(2, files.Count);
        Assert.Equal("2026_06_22-new.xml", files[0].Name); // newest first
        Assert.Equal("2026_06_20-old.xml", files[1].Name);
        Assert.DoesNotContain(files, f => f.Extension == ".ini");
    }

    [Fact]
    public void ReadAll_parses_valid_and_records_failures()
    {
        var t = new DateTime(2026, 6, 20, 12, 0, 0, DateTimeKind.Utc);
        WriteFile("good-newer.xml", SessionXml("Newer Course", "Qualify"), t.AddMinutes(10));
        WriteFile("good-older.xml", SessionXml("Older Course", "Race"), t);
        WriteFile("broken.xml", "<rFactorXML><RaceResults>", t.AddMinutes(5));

        var reader = new LmuResultsReader(_dir);
        var scan = reader.ReadAll();

        Assert.Equal(2, scan.Sessions.Count);
        Assert.Equal("Newer Course", scan.Sessions[0].TrackVenue); // newest-first ordering preserved
        Assert.Equal("Older Course", scan.Sessions[1].TrackVenue);
        var error = Assert.Single(scan.Errors);
        Assert.EndsWith("broken.xml", error.FilePath);
        Assert.False(string.IsNullOrWhiteSpace(error.Message));
    }

    [Fact]
    public void ReadFile_parses_a_single_file()
    {
        var path = WriteFile("one.xml", SessionXml("Solo Course", "Race"), DateTime.UtcNow);
        var reader = new LmuResultsReader(_dir);

        var session = reader.ReadFile(path);

        Assert.Equal("Solo Course", session.TrackVenue);
        Assert.Equal(LmuSessionType.Race, session.SessionType);
        Assert.Equal(106.0, session.Player!.Laps[0].LapTimeSeconds);
    }

    [Fact]
    public void TryReadFile_returns_false_for_broken_file()
    {
        var path = WriteFile("bad.xml", "not xml at all <<<", DateTime.UtcNow);
        var reader = new LmuResultsReader(_dir);

        var ok = reader.TryReadFile(path, out var session, out var error);

        Assert.False(ok);
        Assert.Null(session);
        Assert.NotNull(error);
        Assert.EndsWith("bad.xml", error!.FilePath);
    }

    [Fact]
    public void Missing_directory_yields_empty_results_not_errors()
    {
        var reader = new LmuResultsReader(Path.Combine(_dir, "does-not-exist"));

        Assert.False(reader.DirectoryExists);
        Assert.Empty(reader.ListResultFiles());
        var scan = reader.ReadAll();
        Assert.Empty(scan.Sessions);
        Assert.Empty(scan.Errors);
    }

    [Fact]
    public void Constructor_rejects_blank_directory()
    {
        Assert.Throws<ArgumentException>(() => new LmuResultsReader("  "));
    }

    [Fact]
    public void Default_results_directory_is_null_or_existing()
    {
        // Environment-independent: on a machine without the default Steam install this is null;
        // where LMU is installed to the default library it must be a real, existing directory.
        var dir = LmuResultsReader.DefaultResultsDirectory();
        if (dir is not null)
        {
            Assert.True(System.IO.Directory.Exists(dir));
            Assert.EndsWith(LmuResultsReader.ResultsSubPath, dir);
        }

        // ForDefaultInstall mirrors that resolution and never throws.
        var reader = LmuResultsReader.ForDefaultInstall();
        Assert.Equal(dir is null, reader is null);
    }
}
