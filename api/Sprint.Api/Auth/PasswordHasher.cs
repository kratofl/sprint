namespace Sprint.Api.Auth;

/// <summary>bcrypt password hashing — the .NET equivalent of the Go <c>x/crypto/bcrypt</c> usage.</summary>
public sealed class PasswordHasher
{
    /// <summary>Hashes a plaintext password at the library's default work factor.</summary>
    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password);

    /// <summary>Constant-time verification of a plaintext password against a stored hash.</summary>
    public bool Verify(string password, string hash)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}
