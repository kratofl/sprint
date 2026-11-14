using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Dashes;

namespace Sprint.Desktop.Host;

/// <summary>
/// The JSON spelling of everything the host serves (<c>/api/state</c>, the browser displays' feed) and of what
/// it hands the wheel-dash renderer: the dash layout as the app reads it, and the telemetry frame
/// in the contract's own names, which the renderer reads as they are (<see cref="DashFrameJson"/>).
/// One definition, so the wheel can never see a layout or frame spelled differently from the app.
/// </summary>
public static class HostJson
{
    /// <summary>
    /// Enums cross the wire as names, not ordinals: the TypeScript client models them as string
    /// unions, and a bare number is unreadable in a payload dump. The dash document's own enums are
    /// the exception: a dash crosses the wire whole (and comes back whole with dash.save), so they
    /// keep the spelling of the dash files and the renderer's unions. A converter in the options
    /// outranks one on the type, so theirs go first.
    /// </summary>
    public static JsonSerializerOptions Create()
    {
        JsonSerializerOptions json = new(JsonSerializerDefaults.Web);
        json.Converters.Add(new DashStyleJsonConverter());
        json.Converters.Add(new DashColorSystemJsonConverter());
        json.Converters.Add(new DashGroupModeJsonConverter());
        json.Converters.Add(new JsonStringEnumConverter());
        return json;
    }
}
