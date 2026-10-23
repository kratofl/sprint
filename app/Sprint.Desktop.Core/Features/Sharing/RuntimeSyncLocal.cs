using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>
/// The desktop's real stores as <see cref="CloudSync"/> sees them: recorded sessions (lap
/// history), the driver's own setups (never the shipped templates) and dashes.
/// <para>
/// Everything is exchanged as camelCase JSON, whatever casing a store uses on disk, so the sync
/// can read every payload's <c>id</c> the same way. A dash's "default" flag belongs to this PC,
/// not the account: it is left out of what is uploaded and kept as it is here on download, so a
/// second PC never ends up with two default dashes.
/// </para>
/// </summary>
public sealed class RuntimeSyncLocal(DesktopRuntime runtime, ILapHistoryStore history, ILog? log = null) : ICloudSyncLocal
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly ILog _log = log ?? NullLog.Instance;

    public IReadOnlyList<SyncItem> Items()
    {
        List<SyncItem> items = [];
        foreach (LapHistorySession session in history.LoadAll())
        {
            LapHistoryContext context = session.Context;
            SyncSessionInfo info = new(context.Game, context.TrackCourse, context.CarModel, session.Kind.ToString(), session.StartedAt, session.EndedAt is not null);
            items.Add(new SyncItem(SyncKind.Session, session.Id, $"{context.TrackCourse} {session.Kind}".Trim(), JsonSerializer.Serialize(session, Json), info));
        }

        foreach (SetupProgram setup in runtime.SetupPrograms.Where(program => !program.IsTemplate).ToList())
            items.Add(new SyncItem(SyncKind.Setup, setup.Id, setup.Name, JsonSerializer.Serialize(setup, Json), null));

        foreach (DashLayout dash in runtime.DashLayouts.ToList())
            items.Add(new SyncItem(SyncKind.Dash, dash.Id, dash.Name, WithoutDefaultFlag(dash), null));

        return items;
    }

    public void Write(SyncKind kind, string json)
    {
        try
        {
            switch (kind)
            {
                case SyncKind.Session:
                    if (JsonSerializer.Deserialize<LapHistorySession>(json, Json) is { Id.Length: > 0 } session)
                        history.Save(session);
                    break;
                case SyncKind.Setup:
                    if (JsonSerializer.Deserialize<SetupProgram>(json, Json) is { Id.Length: > 0 } setup)
                        this.WriteSetup(setup);
                    break;
                case SyncKind.Dash:
                    if (JsonSerializer.Deserialize<DashLayout>(json, Json) is { Id.Length: > 0 } dash)
                        this.WriteDash(dash);
                    break;
            }
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            // A payload this version cannot read (or an invalid dash) is skipped, not fatal:
            // the rest of the download still lands.
            this._log.Warn($"Skipped a downloaded {kind} that could not be stored", ex);
        }
    }

    public void DeleteSession(string id) => history.Delete(id);

    private void WriteSetup(SetupProgram setup)
    {
        setup.IsTemplate = false;
        int index = runtime.SetupPrograms.ToList().FindIndex(program => program.Id == setup.Id);
        if (index >= 0)
            runtime.SetupPrograms[index] = setup;
        else
            runtime.SetupPrograms.Add(setup);
        runtime.SaveSetupPrograms();
    }

    private void WriteDash(DashLayout dash)
    {
        int index = runtime.DashLayouts.ToList().FindIndex(layout => layout.Id == dash.Id);
        dash.IsDefault = index >= 0 && runtime.DashLayouts[index].IsDefault;
        runtime.SaveDashLayout(dash);
        if (index >= 0)
            runtime.DashLayouts[index] = dash;
        else
            runtime.DashLayouts.Add(dash);
    }

    private static string WithoutDefaultFlag(DashLayout dash)
    {
        JsonNode node = JsonSerializer.SerializeToNode(dash, Json) ?? new JsonObject();
        if (node is JsonObject json)
            json.Remove("default");
        return node.ToJsonString();
    }
}
