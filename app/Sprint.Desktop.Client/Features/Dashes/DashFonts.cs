using SkiaSharp;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Loads and caches the bundled dash typefaces. Telemetry values use Saira Semi
/// Condensed: its open counters and compact width remain legible on small wheel
/// screens without the geometric softness of the previous display face. Labels
/// stay in Inter so hierarchy remains quiet and familiar.
/// Falls back to the platform default so headless test runs never crash if the
/// TTFs are absent from the output directory.
/// </summary>
internal static class DashFonts
{
    private const string FontDir = "Assets/Fonts";

    public static SKTypeface Value { get; } = Load("SairaSemiCondensed-Bold.ttf", SKFontStyle.Bold);
    public static SKTypeface ValueRegular { get; } = Load("SairaSemiCondensed-Medium.ttf", SKFontStyle.Normal);
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
