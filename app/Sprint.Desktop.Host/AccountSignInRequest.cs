namespace Sprint.Desktop.Host;

/// <summary>Body of <c>POST /api/account/sign-in</c>. Nullable because it is whatever the renderer sent.</summary>
/// <remarks><c>CreateAccount</c> registers a new account on the server instead of signing in.</remarks>
public sealed record AccountSignInRequest(string? ServerUrl, string? Email, string? Password, bool CreateAccount = false)
{
    /// <summary>False when a field is missing — the boundary's one check; the address itself is checked by CloudAccount.</summary>
    public bool IsComplete =>
        !string.IsNullOrWhiteSpace(this.ServerUrl) && !string.IsNullOrWhiteSpace(this.Email) && !string.IsNullOrEmpty(this.Password);
}
