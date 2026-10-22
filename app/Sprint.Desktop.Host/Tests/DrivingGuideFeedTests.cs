using System.Globalization;
using System.IO.MemoryMappedFiles;
using System.Reflection;
using System.Text.RegularExpressions;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.DrivingGuide;
using Sprint.Desktop.Host.DrivingGuide;
using Sprint.Desktop.Runtime;
using Xunit;
using L = Sprint.Desktop.Host.DrivingGuide.DrivingGuideFeedLayout;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// The feed is read by C++ in another process, so the only thing that catches a drift between
/// the two descriptions of its bytes is a test that reads both.
/// </summary>
public sealed partial class DrivingGuideFeedTests
{
    [Fact]
    public void The_layout_matches_the_layers_header()
    {
        string header = File.ReadAllText(Path.Combine(RepoRoot, "app", "Sprint.OpenXrLayer", "src", "guide_feed_layout.h"));
        Dictionary<string, long> csharp = typeof(L)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(field => field.IsLiteral && field.FieldType != typeof(string))
            .ToDictionary(field => field.Name, field => Convert.ToInt64(field.GetRawConstantValue(), CultureInfo.InvariantCulture));

        int compared = 0;
        foreach (Match match in HeaderConstant().Matches(header))
        {
            string name = match.Groups["name"].Value;
            long value = match.Groups["hex"].Success
                ? long.Parse(match.Groups["hex"].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture)
                : long.Parse(match.Groups["dec"].Value, CultureInfo.InvariantCulture);
            if (match.Groups["shift"].Success)
            {
                value <<= int.Parse(match.Groups["shift"].Value, CultureInfo.InvariantCulture);
            }

            Assert.True(csharp.TryGetValue(name, out long mine), $"{name} is in the header but not in DrivingGuideFeedLayout");
            Assert.Equal(value, mine);
            compared++;
        }

        Assert.True(compared >= 30, $"only {compared} header constants were recognised; the pattern no longer matches the header");
        Assert.Contains(@"L""Local\\SprintDrivingGuide""", header);
        Assert.Equal(@"Local\SprintDrivingGuide", L.MappingName);
    }

    [Fact]
    public void A_pose_lands_where_the_layer_reads_it_and_leaves_its_sequence_even()
    {
        using MemoryMappedFile file = MemoryMappedFile.CreateNew(null, L.TotalSize);
        using MemoryMappedViewAccessor view = file.CreateViewAccessor(0, L.TotalSize);
        DrivingGuideFeed feed = new(file);

        feed.WritePose(new TelemetryFrame
        {
            Session = new SessionInfo { InCar = true },
            Car = new CarState { Pose = new CarPose { PositionX = 1234.5, OrientationY = 0.5f, OrientationW = 0.866f, AngularVelocityY = -0.25f } },
            Lap = new LapState { TrackPosition = 0.25f },
        });

        Assert.Equal(L.Magic, view.ReadUInt32(L.MagicOffset));
        Assert.Equal(0u, view.ReadUInt32(L.PoseSeqOffset) % 2);
        Assert.Equal(L.PoseFlagValid, view.ReadUInt32(L.PoseFlagsOffset));
        Assert.Equal(1234.5, view.ReadDouble(L.PosePositionOffset));
        Assert.Equal(0.5f, view.ReadSingle(L.PoseOrientationOffset + 4));
        Assert.Equal(-0.25f, view.ReadSingle(L.PoseAngularOffset + 4));
        Assert.Equal(0.25, view.ReadDouble(L.PoseTrackPositionOffset));
    }

    [Fact]
    public void Geometry_is_written_once_per_lap_and_cleared_when_there_is_none()
    {
        using MemoryMappedFile file = MemoryMappedFile.CreateNew(null, L.TotalSize);
        using MemoryMappedViewAccessor view = file.CreateViewAccessor(0, L.TotalSize);
        DrivingGuideFeed feed = new(file);
        DrivingGuideGeometry geometry = new(
            [new GuidePoint(1, 2, 3, GuidePedal.Brake), new GuidePoint(4, 5, 6, GuidePedal.Throttle)],
            [new GuideBoard(7, 8, 9, 0, 1, 1)],
            0.5,
            1000);

        feed.WriteGeometry(new DrivingGuideState(DrivingGuideStatus.Ready, null, geometry, 7));
        uint sequence = view.ReadUInt32(L.GeometrySeqOffset);
        feed.WriteGeometry(new DrivingGuideState(DrivingGuideStatus.Ready, null, geometry, 7));

        Assert.Equal(sequence, view.ReadUInt32(L.GeometrySeqOffset));
        Assert.Equal(7u, view.ReadUInt32(L.GeometryIdOffset));
        Assert.Equal(2u, view.ReadUInt32(L.GeometryPointCountOffset));
        Assert.Equal((uint)GuidePedal.Throttle, view.ReadUInt32(L.PointsOffset + L.PointStride + 12));
        Assert.Equal(9f, view.ReadSingle(L.BoardsOffset + 8));
        Assert.Equal(1u, view.ReadUInt32(L.BoardsOffset + 28));

        feed.WriteGeometry(new DrivingGuideState(DrivingGuideStatus.NoLap, null, null, 8));

        Assert.Equal(0u, view.ReadUInt32(L.GeometryIdOffset));
        Assert.Equal(0u, view.ReadUInt32(L.GeometrySeqOffset) % 2);
    }

    [Fact]
    public void Settings_are_rewritten_only_when_replaced()
    {
        using MemoryMappedFile file = MemoryMappedFile.CreateNew(null, L.TotalSize);
        using MemoryMappedViewAccessor view = file.CreateViewAccessor(0, L.TotalSize);
        DrivingGuideFeed feed = new(file);
        DrivingGuideSettings settings = new() { ShowBoards = true, VrHeadset = true, YawOffsetDegrees = -2 };

        feed.WriteSettings(settings);
        uint sequence = view.ReadUInt32(L.SettingsSeqOffset);
        feed.WriteSettings(settings);

        Assert.Equal(sequence, view.ReadUInt32(L.SettingsSeqOffset));
        Assert.Equal(L.SettingsFlagBoards | L.SettingsFlagVr, view.ReadUInt32(L.SettingsFlagsOffset));
        Assert.Equal(-2f, view.ReadSingle(L.SettingsYawOffset));
    }

    [GeneratedRegex(@"inline constexpr uint32_t k(?<name>\w+) = (?:0x(?<hex>[0-9A-Fa-f]+)|(?<dec>\d+))u?(?: << (?<shift>\d+))?;")]
    private static partial Regex HeaderConstant();

    private static string RepoRoot
    {
        get
        {
            for (DirectoryInfo? dir = new(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "app", "Sprint.OpenXrLayer")))
                {
                    return dir.FullName;
                }
            }

            throw new DirectoryNotFoundException("Could not find the repository root containing app/Sprint.OpenXrLayer.");
        }
    }
}
