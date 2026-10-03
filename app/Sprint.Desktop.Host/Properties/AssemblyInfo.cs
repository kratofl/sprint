using System.Runtime.CompilerServices;

// Exposes TelemetryIngestionPipeline's internal Ingest()/IngestCount testing seam to the Host
// test project, mirroring Sprint.Desktop.Core's AssemblyInfo.cs. Keeps the per-frame fan-out
// out of the public surface (Poll is the only thing the host's publish loop needs) while
// letting a test drive and count it deterministically.
[assembly: InternalsVisibleTo("Sprint.Desktop.Host.Tests")]
