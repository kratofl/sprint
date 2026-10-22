namespace Sprint.Desktop.Host.DrivingGuide;

/// <summary>
/// The driving guide feed's byte layout. The C++ twin is
/// <c>app/Sprint.OpenXrLayer/src/guide_feed_layout.h</c>; change both or neither, and bump
/// <see cref="Version"/> when a field moves. The header documents every field.
/// </summary>
internal static class DrivingGuideFeedLayout
{
    public const string MappingName = @"Local\SprintDrivingGuide";
    public const uint Magic = 0x47445053;
    public const uint Version = 1;

    public const int MagicOffset = 0;
    public const int VersionOffset = 4;
    public const int TotalSizeOffset = 8;
    public const int HostProcessIdOffset = 12;

    public const int PoseSeqOffset = 64;
    public const int PoseFlagsOffset = 68;
    public const int PoseSampleQpcOffset = 72;
    public const int PoseQpcFrequencyOffset = 80;
    public const int PosePositionOffset = 88;
    public const int PoseOrientationOffset = 112;
    public const int PoseVelocityOffset = 128;
    public const int PoseAngularOffset = 140;
    public const int PoseTrackPositionOffset = 152;
    public const uint PoseFlagValid = 1u << 0;

    public const int SettingsSeqOffset = 192;
    public const int SettingsFlagsOffset = 196;
    public const int SettingsEyeOffset = 200;
    public const int SettingsYawOffset = 212;
    public const int SettingsPitchOffset = 216;
    public const int SettingsMetersAheadOffset = 220;
    public const uint SettingsFlagLine = 1u << 0;
    public const uint SettingsFlagBoards = 1u << 1;
    public const uint SettingsFlagVr = 1u << 2;

    public const int GeometrySeqOffset = 256;
    public const int GeometryIdOffset = 260;
    public const int GeometryPointCountOffset = 264;
    public const int GeometryBoardCountOffset = 268;
    public const int GeometryPositionStepOffset = 272;
    public const int GeometryTrackLengthOffset = 280;

    public const int PointsOffset = 512;
    public const int PointStride = 16;
    public const int MaxPoints = 20000;

    public const int BoardsOffset = PointsOffset + (PointStride * MaxPoints);
    public const int BoardStride = 32;
    public const int MaxBoards = 256;

    public const int TotalSize = BoardsOffset + (BoardStride * MaxBoards);
}
