using System.Security.Cryptography;

namespace Sprint.Api.Services;

/// <summary>Crypto-random hex identifiers — the .NET equivalent of the Go <c>newID()</c> / <c>newCode()</c> helpers (16 random bytes).</summary>
public static class Ids
{
    public static string New() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
}
