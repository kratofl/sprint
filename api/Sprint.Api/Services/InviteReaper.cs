namespace Sprint.Api.Services;

/// <summary>Hourly background sweep that deletes expired invite codes — the .NET equivalent of the Go <c>reapLoop</c> goroutine.</summary>
public sealed class InviteReaper(InviteService invites, ILogger<InviteReaper> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                var removed = await invites.ReapExpiredAsync(stoppingToken);
                if (removed > 0)
                    logger.LogInformation("invite reaper: removed {Count} expired code(s)", removed);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "invite reaper: sweep failed");
            }
        }
    }
}
