namespace Sprint.Desktop.Features.Devices;

public readonly record struct CaptureSelectionSize(double Width, double Height);

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
        DeviceOrientationTransform transform = DeviceOrientations.Transform(
            device.Width,
            device.Height,
            device.Orientation);
        return new CaptureSelectionSize(transform.LogicalWidth, transform.LogicalHeight);
    }

    public static double AspectRatio(SavedDevice device)
    {
        CaptureSelectionSize size = EffectiveSize(device);
        if (size.Width <= 0 || size.Height <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(device), "A capture device needs a positive screen size.");
        }

        return size.Width / size.Height;
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

        double safePreviousWidth = Math.Max(1, previous.Width);
        double safePreviousHeight = Math.Max(1, previous.Height);
        double relativeWidthChange = Math.Abs(requested.Width - previous.Width) / safePreviousWidth;
        double relativeHeightChange = Math.Abs(requested.Height - previous.Height) / safePreviousHeight;

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
        DeviceOrientation previousOrientation,
        DeviceOrientation nextOrientation)
    {
        ArgumentNullException.ThrowIfNull(region);
        bool previousIsLandscape = DeviceOrientations.IsLandscape(previousOrientation);
        bool nextIsLandscape = DeviceOrientations.IsLandscape(nextOrientation);
        return previousIsLandscape == nextIsLandscape
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

        double centerX = region.X + region.Width / 2d;
        double centerY = region.Y + region.Height / 2d;
        double area = (double)region.Width * region.Height;
        double width = Math.Sqrt(area * aspectRatio);
        double height = width / aspectRatio;
        int normalizedWidth = Math.Max(1, (int)Math.Round(width));
        int normalizedHeight = Math.Max(1, (int)Math.Round(height));

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
        double height = width / aspectRatio;
        if (height > visibleBounds.Height)
        {
            height = visibleBounds.Height;
            width = height * aspectRatio;
        }

        int recoveredWidth = Math.Max(1, (int)Math.Round(width));
        int recoveredHeight = Math.Max(1, (int)Math.Round(height));
        return new ScreenCaptureRegion(
            visibleBounds.X + (visibleBounds.Width - recoveredWidth) / 2,
            visibleBounds.Y + (visibleBounds.Height - recoveredHeight) / 2,
            recoveredWidth,
            recoveredHeight);
    }

}
