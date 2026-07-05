using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using HotChocolate;
using Microsoft.IdentityModel.Tokens;

namespace Sprint.Api.Auth;

/// <summary>
/// Issues and validates HS256 JWTs. Faithful port of the Go <c>auth</c> package:
/// 24h TTL, claims <c>user_id</c> + <c>email</c>. The same signing key backs both
/// this issuer and the JwtBearer validation middleware (see <c>Program</c>).
/// </summary>
public sealed class JwtTokenService
{
    /// <summary>Custom claim types, matching the Go token so existing tokens stay compatible.</summary>
    public const string UserIdClaim = "user_id";
    public const string EmailClaim = "email";

    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    private readonly SymmetricSecurityKey _key;

    public JwtTokenService(SymmetricSecurityKey key) => _key = key;

    /// <summary>Creates and signs a token for the given user.</summary>
    public string Issue(string userId, string email)
    {
        var now = DateTime.UtcNow;
        var creds = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            claims:
            [
                new Claim(UserIdClaim, userId),
                new Claim(EmailClaim, email)
            ],
            notBefore: now,
            expires: now.Add(Ttl),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Validates a raw JWT and returns its <c>user_id</c> claim. Used by the
    /// subscription resolvers, which carry the token as an argument (mirroring the
    /// Go relay's query-param auth) rather than via the HTTP Authorization header.
    /// </summary>
    public string ValidateAndGetUserId(string rawToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
            throw new GraphQLException("Missing token.");
        try
        {
            var principal = new JwtSecurityTokenHandler()
                .ValidateToken(rawToken, ValidationParameters, out _);
            return principal.FindFirst(UserIdClaim)?.Value
                   ?? throw new GraphQLException("Invalid token.");
        }
        catch (GraphQLException)
        {
            throw;
        }
        catch (Exception)
        {
            throw new GraphQLException("Invalid token.");
        }
    }

    /// <summary>Validation parameters shared with the JwtBearer middleware.</summary>
    public TokenValidationParameters ValidationParameters => new()
    {
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = _key,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ClockSkew = TimeSpan.FromSeconds(30)
    };

    /// <summary>Builds a signing key from the configured secret (dev fallback mirrors the Go default).</summary>
    public static SymmetricSecurityKey KeyFromSecret(string? secret)
    {
        var value = string.IsNullOrEmpty(secret)
            ? "changeme-set-JWT_SECRET-in-production"
            : secret;
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(value));
    }
}
