namespace Sprint.Api.Tests;

/// <summary>A clock tests move by hand.</summary>
internal sealed class TestClock : TimeProvider
{
    public DateTimeOffset Now { get; set; } = new(2026, 10, 1, 18, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => this.Now;

    public void Advance(TimeSpan by) => this.Now = this.Now.Add(by);
}
