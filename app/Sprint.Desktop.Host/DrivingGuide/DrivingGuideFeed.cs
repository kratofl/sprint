using System.Diagnostics;
using System.IO.MemoryMappedFiles;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.DrivingGuide;
using Sprint.Desktop.Runtime;
using L = Sprint.Desktop.Host.DrivingGuide.DrivingGuideFeedLayout;

namespace Sprint.Desktop.Host.DrivingGuide;

/// <summary>
/// Writes the driving guide feed the OpenXR layer reads (layout: <see cref="DrivingGuideFeedLayout"/>).
/// Each block is a seqlock with a single writer per block: the pose from the telemetry reader
/// thread, settings and geometry from the publish loop. Blocks never share a sequence, so the
/// two writers never contend.
/// </summary>
internal sealed class DrivingGuideFeed : IDisposable
{
    private readonly MemoryMappedFile _file;
    private readonly MemoryMappedViewAccessor _view;
    private DrivingGuideSettings? _writtenSettings;
    private int _writtenGeometryId = -1;

    /// <summary>Takes ownership of <paramref name="file"/>. Tests pass an anonymous map; the host a named one.</summary>
    internal DrivingGuideFeed(MemoryMappedFile file)
    {
        this._file = file;
        this._view = file.CreateViewAccessor(0, L.TotalSize);
        this._view.Write(L.MagicOffset, L.Magic);
        this._view.Write(L.VersionOffset, L.Version);
        this._view.Write(L.TotalSizeOffset, (uint)L.TotalSize);
        this._view.Write(L.HostProcessIdOffset, (uint)Environment.ProcessId);
        this._view.Write(L.PoseQpcFrequencyOffset, Stopwatch.Frequency);
    }

    /// <summary>The named feed, or null off Windows, where nothing could read it.</summary>
    public static DrivingGuideFeed? TryCreateNamed()
    {
        if (!OperatingSystem.IsWindows())
        {
            return null;
        }

        return new DrivingGuideFeed(MemoryMappedFile.CreateOrOpen(L.MappingName, L.TotalSize, MemoryMappedFileAccess.ReadWrite));
    }

    /// <summary>
    /// Writes the player's pose. Runs on the telemetry reader thread for every frame, so it
    /// stamps the read time itself: <see cref="Stopwatch.GetTimestamp"/> is QueryPerformanceCounter
    /// on Windows, the same clock the layer extrapolates against.
    /// </summary>
    public void WritePose(TelemetryFrame frame)
    {
        CarPose? pose = frame.Session.InCar ? frame.Car.Pose : null;
        this.Write(L.PoseSeqOffset, () =>
        {
            this._view.Write(L.PoseFlagsOffset, pose is null ? 0u : L.PoseFlagValid);
            this._view.Write(L.PoseSampleQpcOffset, Stopwatch.GetTimestamp());
            if (pose is null)
            {
                return;
            }

            this._view.Write(L.PosePositionOffset, pose.PositionX);
            this._view.Write(L.PosePositionOffset + 8, pose.PositionY);
            this._view.Write(L.PosePositionOffset + 16, pose.PositionZ);
            this._view.Write(L.PoseOrientationOffset, pose.OrientationX);
            this._view.Write(L.PoseOrientationOffset + 4, pose.OrientationY);
            this._view.Write(L.PoseOrientationOffset + 8, pose.OrientationZ);
            this._view.Write(L.PoseOrientationOffset + 12, pose.OrientationW);
            this._view.Write(L.PoseVelocityOffset, pose.VelocityX);
            this._view.Write(L.PoseVelocityOffset + 4, pose.VelocityY);
            this._view.Write(L.PoseVelocityOffset + 8, pose.VelocityZ);
            this._view.Write(L.PoseAngularOffset, pose.AngularVelocityX);
            this._view.Write(L.PoseAngularOffset + 4, pose.AngularVelocityY);
            this._view.Write(L.PoseAngularOffset + 8, pose.AngularVelocityZ);
            this._view.Write(L.PoseTrackPositionOffset, (double)frame.Lap.TrackPosition);
        });
    }

    /// <summary>Writes the settings when they are a new object. <c>guide.update</c> replaces them whole.</summary>
    public void WriteSettings(DrivingGuideSettings settings)
    {
        if (ReferenceEquals(settings, this._writtenSettings))
        {
            return;
        }

        this._writtenSettings = settings;
        uint flags = (settings.ShowLine ? L.SettingsFlagLine : 0)
            | (settings.ShowBoards ? L.SettingsFlagBoards : 0)
            | (settings.VrHeadset ? L.SettingsFlagVr : 0);
        this.Write(L.SettingsSeqOffset, () =>
        {
            this._view.Write(L.SettingsFlagsOffset, flags);
            this._view.Write(L.SettingsEyeOffset, (float)settings.EyeRightMeters);
            this._view.Write(L.SettingsEyeOffset + 4, (float)settings.EyeUpMeters);
            this._view.Write(L.SettingsEyeOffset + 8, (float)settings.EyeForwardMeters);
            this._view.Write(L.SettingsYawOffset, (float)settings.YawOffsetDegrees);
            this._view.Write(L.SettingsPitchOffset, (float)settings.PitchOffsetDegrees);
            this._view.Write(L.SettingsMetersAheadOffset, (float)settings.MetersAhead);
        });
    }

    /// <summary>Writes the guide's geometry when it changed. Lines longer than the feed holds are dropped, not truncated.</summary>
    public void WriteGeometry(DrivingGuideState state)
    {
        if (state.GeometryId == this._writtenGeometryId)
        {
            return;
        }

        this._writtenGeometryId = state.GeometryId;
        DrivingGuideGeometry? geometry = state.Geometry is { Line.Count: <= L.MaxPoints } fits ? fits : null;
        this.Write(L.GeometrySeqOffset, () =>
        {
            if (geometry is null)
            {
                this._view.Write(L.GeometryIdOffset, 0u);
                this._view.Write(L.GeometryPointCountOffset, 0u);
                this._view.Write(L.GeometryBoardCountOffset, 0u);
                return;
            }

            int boards = Math.Min(geometry.Boards.Count, L.MaxBoards);
            this._view.Write(L.GeometryIdOffset, (uint)state.GeometryId);
            this._view.Write(L.GeometryPointCountOffset, (uint)geometry.Line.Count);
            this._view.Write(L.GeometryBoardCountOffset, (uint)boards);
            this._view.Write(L.GeometryPositionStepOffset, geometry.PositionStep);
            this._view.Write(L.GeometryTrackLengthOffset, geometry.TrackLengthMeters);

            for (int i = 0; i < geometry.Line.Count; i++)
            {
                GuidePoint point = geometry.Line[i];
                long offset = L.PointsOffset + ((long)i * L.PointStride);
                this._view.Write(offset, point.X);
                this._view.Write(offset + 4, point.Y);
                this._view.Write(offset + 8, point.Z);
                this._view.Write(offset + 12, (uint)point.Pedal);
            }

            for (int i = 0; i < boards; i++)
            {
                GuideBoard board = geometry.Boards[i];
                long offset = L.BoardsOffset + ((long)i * L.BoardStride);
                this._view.Write(offset, board.X);
                this._view.Write(offset + 4, board.Y);
                this._view.Write(offset + 8, board.Z);
                this._view.Write(offset + 12, board.FacingX);
                this._view.Write(offset + 16, board.FacingZ);
                this._view.Write(offset + 20, DrivingGuideBuilder.BoardWidth);
                this._view.Write(offset + 24, DrivingGuideBuilder.BoardHeight);
                this._view.Write(offset + 28, (uint)board.PointIndex);
            }
        });
    }

    public void Dispose()
    {
        this._view.Dispose();
        this._file.Dispose();
    }

    /// <summary>
    /// One seqlock write: odd while writing, even when done. The fences keep the field writes
    /// between the two sequence bumps, as seen from the reader's process.
    /// </summary>
    private void Write(int seqOffset, Action body)
    {
        uint seq = this._view.ReadUInt32(seqOffset);
        this._view.Write(seqOffset, seq | 1);
        Interlocked.MemoryBarrier();
        body();
        Interlocked.MemoryBarrier();
        this._view.Write(seqOffset, (seq | 1) + 1);
    }
}
