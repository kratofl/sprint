using Sprint.Desktop.Features.Devices;
using SkiaSharp;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Maps logical dash coordinates directly onto the native screen canvas while
/// preserving the screen pipeline's rotation, margin, and offset semantics.
/// </summary>
internal static class ScreenCanvasTransform
{
    public static SKMatrix Create(
        int nativeWidth,
        int nativeHeight,
        DeviceOrientationTransform transform,
        int margin,
        int offsetX,
        int offsetY)
    {
        margin = Math.Max(0, margin);
        offsetX = Math.Max(0, offsetX);
        offsetY = Math.Max(0, offsetY);
        var innerWidth = nativeWidth - margin * 2;
        var innerHeight = nativeHeight - margin * 2;
        var scaleX = innerWidth / (float)nativeWidth;
        var scaleY = innerHeight / (float)nativeHeight;

        float logicalXToNativeX;
        float logicalYToNativeX;
        float nativeXTranslation;
        float logicalXToNativeY;
        float logicalYToNativeY;
        float nativeYTranslation;
        int screenShiftX;
        int screenShiftY;
        switch (transform.PixelRotation)
        {
            case PixelRotation.Clockwise90:
                (logicalXToNativeX, logicalYToNativeX, nativeXTranslation) =
                    (0, -1, transform.LogicalHeight);
                (logicalXToNativeY, logicalYToNativeY, nativeYTranslation) =
                    (1, 0, 0);
                (screenShiftX, screenShiftY) = (-offsetY, offsetX);
                break;
            case PixelRotation.Clockwise180:
                (logicalXToNativeX, logicalYToNativeX, nativeXTranslation) =
                    (-1, 0, transform.LogicalWidth);
                (logicalXToNativeY, logicalYToNativeY, nativeYTranslation) =
                    (0, -1, transform.LogicalHeight);
                (screenShiftX, screenShiftY) = (-offsetX, -offsetY);
                break;
            case PixelRotation.Clockwise270:
                (logicalXToNativeX, logicalYToNativeX, nativeXTranslation) =
                    (0, 1, 0);
                (logicalXToNativeY, logicalYToNativeY, nativeYTranslation) =
                    (-1, 0, transform.LogicalWidth);
                (screenShiftX, screenShiftY) = (offsetY, -offsetX);
                break;
            default:
                (logicalXToNativeX, logicalYToNativeX, nativeXTranslation) =
                    (1, 0, 0);
                (logicalXToNativeY, logicalYToNativeY, nativeYTranslation) =
                    (0, 1, 0);
                (screenShiftX, screenShiftY) = (offsetX, offsetY);
                break;
        }

        return new SKMatrix(
            scaleX * logicalXToNativeX,
            scaleX * logicalYToNativeX,
            margin + screenShiftX + scaleX * nativeXTranslation,
            scaleY * logicalXToNativeY,
            scaleY * logicalYToNativeY,
            margin + screenShiftY + scaleY * nativeYTranslation,
            0,
            0,
            1);
    }
}
