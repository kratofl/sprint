using System.Reflection;
using HotChocolate.Execution;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Sprint.Api;
using Sprint.Api.Auth;
using Sprint.Api.Data;
using Sprint.Api.GraphQL;
using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Sprint.Contracts;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ── Listen port (parity with the Go server's PORT env; default 8080) ──────────
var port = config["PORT"];
if (!string.IsNullOrWhiteSpace(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// ── Server metadata ───────────────────────────────────────────────────────────
var version = Assembly.GetExecutingAssembly()
    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "dev";
builder.Services.AddSingleton(new ServerInfo(version));

// ── Auth (HS256 JWT, shared key for issuing + validating) ──────────────────────
var signingKey = JwtTokenService.KeyFromSecret(config["JWT_SECRET"]);
var jwt = new JwtTokenService(signingKey);
builder.Services.AddSingleton(jwt);
builder.Services.AddSingleton<PasswordHasher>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = jwt.ValidationParameters;
    });
builder.Services.AddAuthorization();

// ── Relational store (Postgres) ────────────────────────────────────────────────
var databaseUrl = config["DATABASE_URL"]
                  ?? "postgres://sprint:changeme@localhost:5432/sprint?sslmode=disable";
builder.Services.AddDbContextFactory<SprintDbContext>(options =>
    options.UseNpgsql(DatabaseUrl.ToNpgsql(databaseUrl)));

// ── Time-series store (InfluxDB when configured, else no-op) ────────────────────
var influxUrl = config["INFLUXDB_URL"];
var influxToken = config["INFLUXDB_TOKEN"];
if (!string.IsNullOrWhiteSpace(influxUrl) && !string.IsNullOrWhiteSpace(influxToken))
{
    builder.Services.AddSingleton(new InfluxOptions
    {
        Url = influxUrl,
        Token = influxToken,
        Org = config["INFLUXDB_ORG"] ?? "sprint",
        Bucket = config["INFLUXDB_BUCKET"] ?? "telemetry"
    });
    builder.Services.AddSingleton<ITelemetryStore, InfluxTelemetryStore>();
}
else
{
    builder.Services.AddSingleton<ITelemetryStore, NullTelemetryStore>();
}

// ── Domain services ─────────────────────────────────────────────────────────────
builder.Services.AddSingleton<UserService>();
builder.Services.AddSingleton<InviteService>();
builder.Services.AddSingleton<CatalogService>();
builder.Services.AddHostedService<InviteReaper>();

// ── GraphQL ─────────────────────────────────────────────────────────────────────
builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .AddSubscriptionType<Subscription>()
    .AddInMemorySubscriptions();

var app = builder.Build();

// ── Schema export (offline; no DB) ───────────────────────────────────────────────
// `dotnet run --project api/Sprint.Api -- export-schema web/schema.graphql`
// refreshes the committed SDL that web/codegen.ts consumes.
if (args is ["export-schema", var schemaPath])
{
    var exportExecutor = await app.Services.GetRequestExecutorAsync();
    await File.WriteAllTextAsync(schemaPath, exportExecutor.Schema.ToString());
    Console.WriteLine($"Wrote GraphQL schema to {schemaPath}");
    return;
}

// ── Schema bootstrap ─────────────────────────────────────────────────────────────
// EnsureCreated builds the schema from the model without a migrations toolchain.
await using (var db = await app.Services
    .GetRequiredService<IDbContextFactory<SprintDbContext>>().CreateDbContextAsync())
{
    await db.Database.EnsureCreatedAsync();
}

app.UseWebSockets();
app.UseAuthentication();
app.UseAuthorization();

// REST liveness shim — kept so the docker healthcheck, the Next.js /api/health route,
// and the next.config proxy keep working unchanged.
app.MapGet("/api/health", (ServerInfo info) =>
    Results.Ok(new HealthStatus { Status = "ok", Version = info.Version }));

app.MapGraphQL("/graphql");

app.Run();

public partial class Program;
