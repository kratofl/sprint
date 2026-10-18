using System.Text.Json;

namespace Sprint.Api.Services;

/// <summary>Reading a session key from client input. Keys are the desktop's session ids: short, printable.</summary>
public static class SessionKeys
{
    public const int MaxLength = 200;

    /// <summary>The trimmed key, or null when it is missing, too long or holds control characters.</summary>
    public static string? Clean(string? key)
    {
        string trimmed = (key ?? "").Trim();
        return trimmed.Length is 0 or > MaxLength || trimmed.Any(char.IsControl) ? null : trimmed;
    }

    /// <summary>
    /// The <c>id</c> of an uploaded session payload: the desktop's session id, which desktops that
    /// predate <c>SaveSessionInput.sessionKey</c> only sent there.
    /// </summary>
    public static string? FromPayload(string? data)
    {
        if (string.IsNullOrWhiteSpace(data))
            return null;
        try
        {
            using JsonDocument document = JsonDocument.Parse(data);
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("id", out JsonElement id)
                && id.ValueKind == JsonValueKind.String
                ? Clean(id.GetString())
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
