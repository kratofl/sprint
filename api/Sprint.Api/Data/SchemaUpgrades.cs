using Microsoft.EntityFrameworkCore;

namespace Sprint.Api.Data;

/// <summary>
/// Brings a database created by an older API up to the current model. EnsureCreated builds a
/// fresh database from the model but never alters an existing one, so every column or table
/// added after a database exists needs an idempotent statement here — or older deployments
/// (and every developer's local Postgres) fail on the first query that touches it.
/// <para>Postgres only; the in-memory test provider has no schema to upgrade.</para>
/// </summary>
public static class SchemaUpgrades
{
    private static readonly string[] Statements =
    [
        """ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "IsAdmin" boolean NOT NULL DEFAULT false""",
        // A server that predates roles still gets an admin: its oldest account, as a fresh server would.
        """
        UPDATE "Users" SET "IsAdmin" = true
        WHERE "Id" = (SELECT "Id" FROM "Users" ORDER BY "CreatedAt" LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM "Users" WHERE "IsAdmin")
        """,
        """ALTER TABLE "Sessions" ADD COLUMN IF NOT EXISTS "StartedAt" timestamp with time zone NULL""",
        // ExecuteSqlRaw runs the text through string.Format, so a literal brace is doubled.
        """ALTER TABLE "Sessions" ADD COLUMN IF NOT EXISTS "Data" text NOT NULL DEFAULT '{{}}'""",
        """
        CREATE TABLE IF NOT EXISTS "ServerSettings" (
            "Id" text NOT NULL PRIMARY KEY,
            "InstanceName" text NOT NULL,
            "AllowRegistration" boolean NOT NULL,
            "UpdatedAt" timestamp with time zone NOT NULL
        )
        """,
        // Discord sign-in: an account may have no email (unverified on Discord) and no password.
        """ALTER TABLE "Users" ALTER COLUMN "Email" DROP NOT NULL""",
        """ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "DiscordId" text NULL""",
        """ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "AvatarUrl" text NULL""",
        """CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_DiscordId" ON "Users" ("DiscordId")""",
        // Session keys: rows from before keys existed are keyed by their own id, permanently.
        """ALTER TABLE "Sessions" ADD COLUMN IF NOT EXISTS "SessionKey" text NOT NULL DEFAULT ''""",
        """UPDATE "Sessions" SET "SessionKey" = "Id" WHERE "SessionKey" = ''""",
        """CREATE UNIQUE INDEX IF NOT EXISTS "IX_Sessions_OwnerId_SessionKey" ON "Sessions" ("OwnerId", "SessionKey")""",
        // Race engineers.
        """
        CREATE TABLE IF NOT EXISTS "EngineerInvites" (
            "Token" text NOT NULL PRIMARY KEY,
            "DriverId" text NOT NULL,
            "CreatedAt" timestamp with time zone NOT NULL,
            "ExpiresAt" timestamp with time zone NOT NULL,
            "UsedAt" timestamp with time zone NULL,
            "UsedById" text NULL,
            "RevokedAt" timestamp with time zone NULL
        )
        """,
        """CREATE INDEX IF NOT EXISTS "IX_EngineerInvites_DriverId" ON "EngineerInvites" ("DriverId")""",
        """
        CREATE TABLE IF NOT EXISTS "EngineerLinks" (
            "DriverId" text NOT NULL,
            "EngineerId" text NOT NULL,
            "CreatedAt" timestamp with time zone NOT NULL,
            CONSTRAINT "PK_EngineerLinks" PRIMARY KEY ("DriverId", "EngineerId")
        )
        """,
        """CREATE INDEX IF NOT EXISTS "IX_EngineerLinks_EngineerId" ON "EngineerLinks" ("EngineerId")""",
        """
        CREATE TABLE IF NOT EXISTS "SessionEngineerExclusions" (
            "DriverId" text NOT NULL,
            "SessionKey" text NOT NULL,
            "EngineerId" text NOT NULL,
            "CreatedAt" timestamp with time zone NOT NULL,
            CONSTRAINT "PK_SessionEngineerExclusions" PRIMARY KEY ("DriverId", "SessionKey", "EngineerId")
        )
        """,
    ];

    public static async Task ApplyAsync(SprintDbContext db, CancellationToken ct = default)
    {
        if (!db.Database.IsNpgsql())
            return;

        foreach (string statement in Statements)
            await db.Database.ExecuteSqlRawAsync(statement, ct);
    }
}
