# Sprint Desktop Tests

## Agent UI Review

Run this after desktop UI changes when an agent needs to inspect the rendered app:

```powershell
dotnet test app\Sprint.Desktop.Tests\Sprint.Desktop.Tests.csproj --filter AgentUiReview
```

The test writes an agent-local report and screenshots to:

```text
app/Sprint.Desktop.Tests/artifacts/ui-review/latest/
```

Open `report.html` for the full journey, or inspect the PNGs directly. Agents must inspect the generated screenshots before claiming desktop UI work is complete. The harness drives real Avalonia controls through Home, Devices, Setups, Settings, Help, and Dash Editor, and records visible text plus semantic failures next to each image.
