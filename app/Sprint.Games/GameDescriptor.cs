namespace Sprint.Games;

public sealed record GameDescriptor(
    string Id,
    string Name,
    string Transport,
    bool Available);
