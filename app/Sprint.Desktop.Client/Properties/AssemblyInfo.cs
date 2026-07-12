using System.Runtime.CompilerServices;

// Exposes the engine's internal Step()/StepOutcome testing seam (and other internals)
// to the desktop test project, mirroring Sprint.Games. Keeps the one-iteration reader
// seam out of the public surface while letting tests drive it deterministically.
[assembly: InternalsVisibleTo("Sprint.Desktop.Tests")]
