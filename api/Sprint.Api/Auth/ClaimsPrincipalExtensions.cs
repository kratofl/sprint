using System.Security.Claims;
using HotChocolate;

namespace Sprint.Api.Auth;

public static class ClaimsPrincipalExtensions
{
    /// <summary>The authenticated user's id (the <c>user_id</c> JWT claim), or null if unauthenticated.</summary>
    public static string? UserId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(JwtTokenService.UserIdClaim);

    /// <summary>The authenticated user's id, throwing when absent (use behind <c>[Authorize]</c>).</summary>
    public static string RequireUserId(this ClaimsPrincipal principal) =>
        principal.UserId() ?? throw new GraphQLException("Not authenticated.");
}
