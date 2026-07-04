using SkiaSharp;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Loads and caches the bundled dash typefaces (matrix 4.5 font row). Values use
/// the display face (Space Grotesk); labels use the UI face (Inter) — the same
/// Figma identity exposed via <c>Graphite.FontStack</c>/<c>DisplayFontStack</c>.
/// Falls back to the platform default so headless test runs never crash if the
/// TTFs are absent from the output directory.
/// </summary>
internal static class DashFonts
{
    private const string FontDir = "Assets/Fonts";

    public static SKTypeface Value { get; } = Load("SpaceGrotesk-Bold.ttf", SKFontStyle.Bold);
    public static SKTypeface ValueRegular { get; } = Load("SpaceGrotesk-Regular.ttf", SKFontStyle.Normal);
    public static SKTypeface Label { get; } = Load("Inter-Regular.ttf", SKFontStyle.Normal);
    public static SKTypeface LabelBold { get; } = Load("Inter-Bold.ttf", SKFontStyle.Bold);

    private static SKTypeface Load(string fileName, SKFontStyle style)
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, FontDir, fileName);
            if (File.Exists(path))
            {
                var typeface = SKTypeface.FromFile(path);
                if (typeface is not null)
                {
                    return typeface;
                }
            }
        }
        catch (IOException)
        {
            // Fall through to the default typeface below.
        }

        return SKTypeface.FromFamilyName(null, style) ?? SKTypeface.Default;
    }
}
