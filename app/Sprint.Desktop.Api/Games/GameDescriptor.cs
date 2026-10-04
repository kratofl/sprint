namespace Sprint.Desktop.Api.Games;

/// <summary>
/// What a game is, as advertised to the desktop: identity, display name, how telemetry
/// reaches Sprint, and whether this machine can currently talk to it. It sits in the
/// shared contract rather than the games project so consumers can list and gate games
/// without depending on any game implementation.
/// </summary>
public sealed record GameDescriptor(
    string Id,
    string Name,
    string Transport,
    bool Available);
