using Sprint.Api.Data;
using Xunit;

namespace Sprint.Api.Tests;

public class DatabaseUrlTests
{
    [Fact]
    public void Parses_libpq_url_into_npgsql_keywords()
    {
        var conn = DatabaseUrl.ToNpgsql("postgres://sprint:changeme@db:5432/sprint?sslmode=disable");
        Assert.Contains("Host=db", conn);
        Assert.Contains("Port=5432", conn);
        Assert.Contains("Database=sprint", conn);
        Assert.Contains("Username=sprint", conn);
        Assert.Contains("Password=changeme", conn);
        Assert.Contains("SSL Mode=Disable", conn);
    }

    [Fact]
    public void Passes_through_an_existing_keyword_string()
    {
        const string keyword = "Host=localhost;Database=sprint;Username=sprint";
        Assert.Equal(keyword, DatabaseUrl.ToNpgsql(keyword));
    }

    [Fact]
    public void Empty_url_throws()
    {
        Assert.Throws<ArgumentException>(() => DatabaseUrl.ToNpgsql(""));
    }
}
