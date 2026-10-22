using Microsoft.Win32;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Host.DrivingGuide;

/// <summary>Whether the VR layer can be used here, and whether the OpenXR loader will load it.</summary>
/// <param name="Detail">Why it is unavailable, worded for the driver. Null when available.</param>
public sealed record OpenXrLayerState(bool Available, bool Registered, string? Detail);

/// <summary>
/// Registers the driving guide's OpenXR API layer with the OpenXR loader, per user
/// (<c>HKCU\Software\Khronos\OpenXR\1\ApiLayers\Implicit</c>, value = manifest path, DWORD 0),
/// so turning VR on needs no admin rights. Turning it off deletes only our value.
/// <para>
/// <see cref="Reconcile"/> runs at start and after every <c>guide.update</c>: the setting is
/// the intent, the registry is the fact. A moved install heals itself, and a value left behind
/// by a removed install points at a missing file, which the loader skips.
/// </para>
/// </summary>
internal sealed class OpenXrLayerRegistration
{
    private const string ImplicitLayersKey = @"Software\Khronos\OpenXR\1\ApiLayers\Implicit";
    private const string ManifestFileName = "XR_APILAYER_SPRINT_driving_guide.json";

    /// <summary>Dev runs point at a locally built layer with this; packaged builds find it beside the host.</summary>
    private const string ManifestOverride = "SPRINT_OPENXR_LAYER_MANIFEST";

    private readonly ILog _log;
    private readonly string? _manifestPath;
    private OpenXrLayerState _state;

    public OpenXrLayerRegistration(ILog log)
    {
        this._log = log;
        this._manifestPath = FindManifest();
        this._state = this.Describe();
    }

    public OpenXrLayerState State => Volatile.Read(ref this._state);

    public void Reconcile(DrivingGuideSettings settings)
    {
        if (!OperatingSystem.IsWindows() || !HostEffects.Enabled)
        {
            return;
        }

        try
        {
            using RegistryKey key = Registry.CurrentUser.CreateSubKey(ImplicitLayersKey, writable: true);
            // Values of ours from an install that moved; a different path is still ours by file name.
            foreach (string stale in key.GetValueNames().Where(name =>
                string.Equals(Path.GetFileName(name), ManifestFileName, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(name, this._manifestPath, StringComparison.OrdinalIgnoreCase)))
            {
                key.DeleteValue(stale, throwOnMissingValue: false);
                this._log.Info($"OpenXR layer: removed stale registration {stale}");
            }

            if (this._manifestPath is null)
            {
                return;
            }

            bool registered = key.GetValue(this._manifestPath) is not null;
            if (settings.VrHeadset && !registered)
            {
                key.SetValue(this._manifestPath, 0, RegistryValueKind.DWord);
                this._log.Info($"OpenXR layer: registered {this._manifestPath}");
            }
            else if (!settings.VrHeadset && registered)
            {
                key.DeleteValue(this._manifestPath, throwOnMissingValue: false);
                this._log.Info("OpenXR layer: unregistered");
            }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            this._log.Warn("OpenXR layer: could not update the registration", ex);
        }
        finally
        {
            Volatile.Write(ref this._state, this.Describe());
        }
    }

    private OpenXrLayerState Describe()
    {
        if (!OperatingSystem.IsWindows())
        {
            return new OpenXrLayerState(false, false, "VR needs Windows.");
        }

        if (this._manifestPath is null)
        {
            return new OpenXrLayerState(false, false, "This build does not include the VR layer.");
        }

        try
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(ImplicitLayersKey);
            return new OpenXrLayerState(true, key?.GetValue(this._manifestPath) is not null, null);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            return new OpenXrLayerState(true, false, "Sprint could not read the OpenXR registration.");
        }
    }

    private static string? FindManifest()
    {
        if (Environment.GetEnvironmentVariable(ManifestOverride) is { Length: > 0 } overridden)
        {
            return File.Exists(overridden) ? Path.GetFullPath(overridden) : null;
        }

        // Packaged: resources/host/<host> and resources/openxr-layer/<manifest>.
        string packaged = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "openxr-layer", ManifestFileName));
        return File.Exists(packaged) ? packaged : null;
    }
}
