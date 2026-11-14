using Sprint.Api.Auth;
using Xunit;

namespace Sprint.Api.Tests;

public class PasswordHasherTests
{
    private readonly PasswordHasher _hasher = new();

    [Fact]
    public void Hash_then_verify_round_trips()
    {
        string hash = this._hasher.Hash("s3cret-pw");
        Assert.True(this._hasher.Verify("s3cret-pw", hash));
    }

    [Fact]
    public void Verify_rejects_wrong_password()
    {
        string hash = this._hasher.Hash("s3cret-pw");
        Assert.False(this._hasher.Verify("not-it", hash));
    }

    [Fact]
    public void Verify_rejects_malformed_hash_without_throwing()
    {
        Assert.False(this._hasher.Verify("anything", "not-a-bcrypt-hash"));
    }
}

public class JwtTokenServiceTests
{
    private static JwtTokenService NewService(string secret = "test-secret-that-is-long-enough-to-be-valid-hs256") =>
        new(JwtTokenService.KeyFromSecret(secret));

    [Fact]
    public void Issued_token_validates_and_carries_user_id()
    {
        JwtTokenService svc = NewService();
        string token = svc.Issue("user-123", "a@b.c");
        Assert.Equal("user-123", svc.ValidateAndGetUserId(token));
    }

    [Fact]
    public void Token_signed_with_a_different_secret_is_rejected()
    {
        string token = NewService("secret-number-one-aaaaaaaaaaaaaaaaaaaaaaa").Issue("u", "e");
        JwtTokenService other = NewService("secret-number-two-bbbbbbbbbbbbbbbbbbbbbbb");
        Assert.Throws<HotChocolate.GraphQLException>(() => other.ValidateAndGetUserId(token));
    }

    [Fact]
    public void Garbage_token_is_rejected()
    {
        Assert.Throws<HotChocolate.GraphQLException>(() => NewService().ValidateAndGetUserId("not.a.jwt"));
    }
}
