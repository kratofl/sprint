namespace Sprint.Desktop.Features.Devices;

public readonly record struct CaptureSelectionSize(double Width, double Height);
public readonly record struct CaptureFrameTransform(int LogicalWidth, int LogicalHeight, int PixelRotation);

/// <summary>
/// Pure geometry shared by the transparent selector and tests. Avalonia reports
/// selector sizes in device-independent pixels; this seam only locks their ratio.
/// Physical-pixel conversion stays at the window boundary.
/// </summary>
public static class CaptureSelectionGeometry
{
    public static CaptureSelectionSize EffectiveSize(SavedDevice device)
    {
        ArgumentNullException.ThrowIfNull(device);
        return OrientedSize(device.Width, device.Height, DeviceOrientations.Resolve(device.Rotation));
    }

    public static double AspectRatio(SavedDevice device)
    {
        var size = EffectiveSize(device);
        if (size.Width <= 0 || size.Height <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(device), "A capture device needs a positive screen size.");
        }

        return size.Width / size.Height;
    }

    public static CaptureFrameTransform FrameTransform(int nativeWidth, int nativeHeight, int rotation)
    {
        if (nativeWidth <= 0 || nativeHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(nativeWidth), "A capture device needs a positive screen size.");
        }

        var orientation = DeviceOrientations.Resolve(rotation);
        var logicalSize = OrientedSize(nativeWidth, nativeHeight, orientation);
        var nativeIsLandscape = nativeWidth >= nativeHeight;
        var baseRotation = nativeIsLandscape == orientation.IsLandscape ? 0 : 90;
        var inverted = orientation.Rotation is 180 or 270;
        return new CaptureFrameTransform(
            (int)logicalSize.Width,
            (int)logicalSize.Height,
            inverted ? (baseRotation + 180) % 360 : baseRotation);
    }

    public static CaptureSelectionSize ConstrainResize(
        CaptureSelectionSize previous,
        CaptureSelectionSize requested,
        double aspectRatio,
        double minimumWidth = 160,
        double minimumHeight = 90)
    {
        if (!double.IsFinite(aspectRatio) || aspectRatio <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(aspectRatio));
        }

        var safePreviousWidth = Math.Max(1, previous.Width);
        var safePreviousHeight = Math.Max(1, previous.Height);
        var relativeWidthChange = Math.Abs(requested.Width - previous.Width) / safePreviousWidth;
        var relativeHeightChange = Math.Abs(requested.Height - previous.Height) / safePreviousHeight;

        double width;
        double height;
        if (relativeWidthChange >= relativeHeightChange)
        {
            width = Math.Max(minimumWidth, requested.Width);
            height = width / aspectRatio;
        }
        else
        {
            height = Math.Max(minimumHeight, requested.Height);
            width = height * aspectRatio;
        }

        if (width < minimumWidth)
        {
            width = minimumWidth;
            height = width / aspectRatio;
        }

        if (height < minimumHeight)
        {
            height = minimumHeight;
            width = height * aspectRatio;
        }

        return new CaptureSelectionSize(width, height);
    }

    public static ScreenCaptureRegion ReorientRegion(
        ScreenCaptureRegion region,
        int previousRotation,
        int nextRotation)
    {
        ArgumentNullException.ThrowIfNull(region);
        var previousSwapsAxes = NormalizeRotation(previousRotation) is 90 or 270;
        var nextSwapsAxes = NormalizeRotation(nextRotation) is 90 or 270;
        return previousSwapsAxes == nextSwapsAxes
            ? region
            : region with { Width = region.Height, Height = region.Width };
    }

    public static ScreenCaptureRegion NormalizeRegionAspect(
        ScreenCaptureRegion region,
        double aspectRatio)
    {
        ArgumentNullException.ThrowIfNull(region);
        if (!region.IsValid)
        {
            throw new ArgumentOutOfRangeException(nameof(region));
        }

        if (!double.IsFinite(aspectRatio) || aspectRatio <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(aspectRatio));
        }

        var centerX = region.X + region.Width / 2d;
        var centerY = region.Y + region.Height / 2d;
        var area = (double)region.Width * region.Height;
        var width = Math.Sqrt(area * aspectRatio);
        var height = width / aspectRatio;
        var normalizedWidth = Math.Max(1, (int)Math.Round(width));
        var normalizedHeight = Math.Max(1, (int)Math.Round(height));

        return new ScreenCaptureRegion(
            (int)Math.Round(centerX - normalizedWidth / 2d),
            (int)Math.Round(centerY - normalizedHeight / 2d),
            normalizedWidth,
            normalizedHeight);
    }

    public static ScreenCaptureRegion RecoverToVisibleBounds(
        ScreenCaptureRegion region,
        ScreenCaptureRegion visibleBounds,
        double aspectRatio)
    {
        ArgumentNullException.ThrowIfNull(region);
        ArgumentNullException.ThrowIfNull(visibleBounds);
        if (!visibleBounds.IsValid)
        {
            throw new ArgumentOutOfRangeException(nameof(visibleBounds));
        }

        if (!double.IsFinite(aspectRatio) || aspectRatio <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(aspectRatio));
        }

        double width = Math.Min(region.Width, visibleBounds.Width);
        var height = width / aspectRatio;
        if (height > visibleBounds.Height)
        {
            height = visibleBounds.Height;
            width = height * aspectRatio;
        }

        var recoveredWidth = Math.Max(1, (int)Math.Round(width));
        var recoveredHeight = Math.Max(1, (int)Math.Round(height));
        return new ScreenCaptureRegion(
            visibleBounds.X + (visibleBounds.Width - recoveredWidth) / 2,
            visibleBounds.Y + (visibleBounds.Height - recoveredHeight) / 2,
            recoveredWidth,
            recoveredHeight);
    }

    private static int NormalizeRotation(int rotation)
    {
        var normalized = rotation % 360;
        return normalized < 0 ? normalized + 360 : normalized;
    }

    private static CaptureSelectionSize OrientedSize(
        int width,
        int height,
        DeviceOrientation orientation)
    {
        var shortEdge = Math.Min(width, height);
        var longEdge = Math.Max(width, height);
        return orientation.IsLandscape
            ? new CaptureSelectionSize(longEdge, shortEdge)
            : new CaptureSelectionSize(shortEdge, longEdge);
    }
}
