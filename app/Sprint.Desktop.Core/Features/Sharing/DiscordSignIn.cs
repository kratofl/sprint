using System.Security.Cryptography;
using System.Text;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>How a Discord sign-in ended. Sent to the renderer by name.</summary>
public enum DiscordSignInOutcome
{
    SignedIn,

    /// <summary>The driver cancelled it in Sprint, or started another one.</summary>
    Cancelled,

    /// <summary>Nothing came back from the browser in time.</summary>
    TimedOut,

    /// <summary>The server or Discord said no; <see cref="DiscordSignInResult.Error"/> says why.</summary>
    Failed,
}

public sealed record DiscordSignInResult(DiscordSignInOutcome Outcome, string Error)
{
    public static DiscordSignInResult Of(DiscordSignInOutcome outcome) => new(outcome, "");
}

/// <summary>Where to send the browser, or why there is nowhere to send it (<see cref="AuthorizeUrl"/> null).</summary>
public sealed record DiscordSignInStart(Uri? AuthorizeUrl, string Error);

/// <summary>
/// One Discord sign-in at a time. <see cref="Begin"/> returns the server's Discord start URL with
/// this host's loopback callback as the redirect and a fresh nonce as the state; the browser comes
/// back to that callback with a single-use ticket, which <see cref="WaitAsync"/> redeems.
/// <para>
/// The callback route is unauthenticated (a browser cannot carry the host's bearer token), so the
/// nonce is what makes it safe: only the answer carrying the nonce of the attempt in flight is
/// taken, and only once. A new attempt, a cancel or a timeout retires the nonce.
/// </para>
/// </summary>
public sealed class DiscordSignIn(CloudAccount account)
{
    private readonly Lock _gate = new();
    private Attempt? _attempt;

    /// <summary>Starts an attempt against <paramref name="serverUrl"/>, cancelling any attempt still in flight.</summary>
    public DiscordSignInStart Begin(string serverUrl, Uri callback)
    {
        if (CloudAccount.ServerAddress(serverUrl) is not { } server)
            return new DiscordSignInStart(null, "Enter the server address, starting with https:// or http://.");

        string nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        Attempt attempt = new(nonce, server.ToString());
        Attempt? previous;
        lock (this._gate)
        {
            previous = this._attempt;
            this._attempt = attempt;
        }

        previous?.Answer.TrySetResult(Answer.Cancelled);
        string query = $"client=desktop&redirect={Uri.EscapeDataString(callback.ToString())}&state={nonce}";
        return new DiscordSignInStart(new Uri(server, $"api/auth/discord/start?{query}"), "");
    }

    /// <summary>
    /// The loopback callback's answer. True when it belonged to the attempt in flight and was
    /// taken; false for an unknown, used or retired state, which changes nothing.
    /// </summary>
    public bool Complete(string? state, string? ticket, string? error)
    {
        Attempt? attempt;
        lock (this._gate)
        {
            attempt = this._attempt;
            if (attempt is null || state is null || !attempt.Matches(state) || attempt.Answered)
                return false;
            attempt.Answered = true;
        }

        attempt.Answer.TrySetResult(ticket is { Length: > 0 }
            ? new Answer(ticket, "")
            : new Answer(null, error is { Length: > 0 } ? error : "Discord did not finish the sign-in. Try again."));
        return true;
    }

    /// <summary>
    /// Waits for the browser leg of the attempt in flight, then signs in with its ticket. Gives up
    /// after <paramref name="timeout"/>; the attempt is retired either way.
    /// </summary>
    public async Task<DiscordSignInResult> WaitAsync(TimeSpan timeout, CancellationToken ct = default)
    {
        Attempt? attempt;
        lock (this._gate)
            attempt = this._attempt;
        if (attempt is null)
            return new DiscordSignInResult(DiscordSignInOutcome.Failed, "No Discord sign-in is in progress.");

        Answer answer;
        try
        {
            answer = await attempt.Answer.Task.WaitAsync(timeout, ct).ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            this.Retire(attempt);
            return DiscordSignInResult.Of(DiscordSignInOutcome.TimedOut);
        }

        this.Retire(attempt);
        if (ReferenceEquals(answer, Answer.Cancelled))
            return DiscordSignInResult.Of(DiscordSignInOutcome.Cancelled);
        if (answer.Ticket is not { } ticket)
            return new DiscordSignInResult(DiscordSignInOutcome.Failed, answer.Error);

        CloudSignInResult signedIn = await account.SignInWithTicketAsync(attempt.ServerUrl, ticket, ct).ConfigureAwait(false);
        return signedIn.Ok
            ? DiscordSignInResult.Of(DiscordSignInOutcome.SignedIn)
            : new DiscordSignInResult(DiscordSignInOutcome.Failed, signedIn.Error);
    }

    /// <summary>Cancels the attempt in flight, if any; its wait ends as <see cref="DiscordSignInOutcome.Cancelled"/>.</summary>
    public void Cancel()
    {
        Attempt? attempt;
        lock (this._gate)
        {
            attempt = this._attempt;
            this._attempt = null;
        }

        attempt?.Answer.TrySetResult(Answer.Cancelled);
    }

    private void Retire(Attempt attempt)
    {
        lock (this._gate)
        {
            if (ReferenceEquals(this._attempt, attempt))
                this._attempt = null;
        }
    }

    private sealed class Attempt(string nonce, string serverUrl)
    {
        private readonly byte[] _nonce = Encoding.UTF8.GetBytes(nonce);

        public string ServerUrl { get; } = serverUrl;

        public TaskCompletionSource<Answer> Answer { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        /// <summary>Set under the gate once a callback was taken, so a second one is refused.</summary>
        public bool Answered { get; set; }

        public bool Matches(string state) => CryptographicOperations.FixedTimeEquals(this._nonce, Encoding.UTF8.GetBytes(state));
    }

    /// <summary>What the browser leg brought back: a ticket, or the error to show.</summary>
    private sealed record Answer(string? Ticket, string Error)
    {
        public static Answer Cancelled { get; } = new(null, "");
    }
}
