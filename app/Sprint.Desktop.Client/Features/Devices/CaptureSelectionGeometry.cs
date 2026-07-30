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
        var transform = DeviceOrientations.Transform(
            device.Width,
            device.Height,
            device.Orientation);
        return new CaptureSelectionSize(transform.LogicalWidth, transform.LogicalHeight);
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
        DeviceOrientation previousOrientation,
        DeviceOrientation nextOrientation)
    {
        ArgumentNullException.ThrowIfNull(region);
        var previousIsLandscape = DeviceOrientations.IsLandscape(previousOrientation);
        var nextIsLandscape = DeviceOrientations.IsLandscape(nextOrientation);
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

}
