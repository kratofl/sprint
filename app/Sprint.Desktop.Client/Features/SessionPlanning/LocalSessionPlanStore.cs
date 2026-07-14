using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Desktop-local <see cref="ISessionPlanStore"/>: one JSON file per plan under
/// <c>%AppData%/Sprint/session-plans/</c> (mirroring <see cref="DesktopRuntime"/>'s
/// convention), plus a small <c>active.json</c> pointer for the single active plan.
/// One-file-per-plan keeps writes to the edited plan cheap and isolates a corrupt
/// file to a single plan rather than the whole history.
/// </summary>
public sealed class LocalSessionPlanStore : ISessionPlanStore
{
    private const string ActivePointerFile = "active.json";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _root;
    private readonly ILog _log;

    public LocalSessionPlanStore(string? dataRoot = null, ILog? log = null)
    {
        _root = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint",
            "session-plans");
        _log = log ?? NullLog.Instance;
        Directory.CreateDirectory(_root);
    }

    public IReadOnlyList<SessionPlan> LoadAll()
    {
        var plans = new List<SessionPlan>();
        foreach (var file in Directory.EnumerateFiles(_root, "*.json"))
        {
            if (string.Equals(Path.GetFileName(file), ActivePointerFile, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var plan = LoadPlan(file);
            if (plan is { Id.Length: > 0 })
            {
                plans.Add(plan);
            }
        }

        return plans;
    }

    public void Save(SessionPlan plan)
    {
        if (string.IsNullOrEmpty(plan.Id))
        {
            throw new ArgumentException("A plan must have an id before it can be saved.", nameof(plan));
        }

        WriteJson(PlanPath(plan.Id), plan);
    }

    public void Delete(string planId)
    {
        if (string.IsNullOrEmpty(planId))
        {
            return;
        }

        try
        {
            var path = PlanPath(planId);
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            if (string.Equals(LoadActivePlanId(), planId, StringComparison.Ordinal))
            {
                SaveActivePlanId(null);
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"Failed to delete session plan '{planId}'", ex);
        }
    }

    public string? LoadActivePlanId()
    {
        var pointer = LoadJson<ActivePointer>(Path.Combine(_root, ActivePointerFile));
        return string.IsNullOrEmpty(pointer?.PlanId) ? null : pointer.PlanId;
    }

    public void SaveActivePlanId(string? planId) =>
        WriteJson(Path.Combine(_root, ActivePointerFile), new ActivePointer { PlanId = planId });

    private SessionPlan? LoadPlan(string path) => LoadJson<SessionPlan>(path);

    private string PlanPath(string planId) => Path.Combine(_root, SafeFileName(planId) + ".json");

    private T? LoadJson<T>(string path)
    {
        if (!File.Exists(path))
        {
            return default;
        }

        try
        {
            using var stream = File.OpenRead(path);
            return JsonSerializer.Deserialize<T>(stream, JsonOptions);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // A corrupt/locked file must not sink the whole planner; skip it and
            // leave a breadcrumb instead of silently dropping user history.
            _log.Warn($"Ignoring unreadable session-plan file at {path}", ex);
            return default;
        }
    }

    private void WriteJson<T>(string path, T value)
    {
        try
        {
            using var stream = File.Create(path);
            JsonSerializer.Serialize(stream, value, JsonOptions);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Error($"Failed to persist session-plan file at {path}", ex);
        }
    }

    // Plan ids are service-generated hex ids, but guard against path traversal in
    // case a synced/imported id ever carries separators.
    private static string SafeFileName(string planId)
    {
        Span<char> buffer = stackalloc char[planId.Length];
        for (var i = 0; i < planId.Length; i++)
        {
            var c = planId[i];
            buffer[i] = Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 ? '_' : c;
        }

        return new string(buffer);
    }

    private sealed record ActivePointer
    {
        [JsonPropertyName("planId")]
        public string? PlanId { get; init; }
    }
}
