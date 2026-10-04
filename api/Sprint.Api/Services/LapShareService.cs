using System.Security.Cryptography;
using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;
using Sprint.Contracts;

namespace Sprint.Api.Services;

/// <summary>
/// Per-lap share codes (#197).
/// <para>
/// No friend graph. Sharing mints an unguessable code; whoever holds it can pull that lap; the
/// owner can revoke it. There are no requests, accepts, blocks or visibility rules to design,
/// and it fits the case that actually happens — "here, try my Spa lap". A friend graph can
/// layer on later without touching the trace, the HUD or the corpus.
/// </para>
/// </summary>
public sealed class LapShareService(IDbContextFactory<SprintDbContext> dbFactory)
{
    /// <summary>Ceiling on an accepted payload. A Le Mans lap compresses to well under this.</summary>
    public const int MaxPayloadBytes = 4 * 1024 * 1024;

    /// <summary>
    /// Crockford-ish base32 over 128 random bits: no vowels, so no code spells anything, and
    /// no 0/O or 1/I to misread when somebody types one off a Discord message.
    /// </summary>
    private const string CodeAlphabet = "23456789BCDFGHJKLMNPQRSTVWXYZ";

    private const int CodeLength = 12;

    /// <summary>Mints a code for a lap. The code is random, never derived from the lap.</summary>
    /// <remarks>
    /// Deriving it from the lap's identity would let anyone who knows what you drove compute
    /// the code for it, which is the whole security of a share link.
    /// </remarks>
    public async Task<SharedLapSummary> ShareAsync(string ownerId, ShareLapInput input, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var payload = DecodePayload(input.PayloadBase64);
        if (string.IsNullOrWhiteSpace(input.TrackCourse) || string.IsNullOrWhiteSpace(input.CarModel))
        {
            throw new GraphQLException("A shared lap needs a track and a car.");
        }

        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var entity = new LapTraceEntity
        {
            Id = Ids.New(),
            OwnerId = ownerId,
            ShareCode = await UniqueCodeAsync(db, ct),
            Game = input.Game,
            TrackCourse = input.TrackCourse,
            CarModel = input.CarModel,
            LapNumber = input.LapNumber,
            LapTimeSeconds = input.LapTimeSeconds,
            DrivenAt = input.DrivenAt,
            Payload = payload,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.LapTraces.Add(entity);
        await db.SaveChangesAsync(ct);
        return Summary(entity);
    }

    /// <summary>
    /// The lap behind a code. Throws with a message that distinguishes "no such code" from
    /// "that code was revoked" — the holder deserves the true one, and the fixes differ.
    /// </summary>
    public async Task<SharedLapDto> FetchAsync(string code, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var entity = await db.LapTraces.FirstOrDefaultAsync(t => t.ShareCode == code, ct)
            ?? throw new GraphQLException("No lap exists for that code.");

        if (entity.Revoked)
        {
            throw new GraphQLException("That share code has been revoked by its owner.");
        }

        var owner = await db.Users.FindAsync([entity.OwnerId], ct);

        return new SharedLapDto
        {
            ShareCode = entity.ShareCode,
            // Never the email: a lap credited to an address is both wrong and a disclosure.
            SharedBy = DisplayNameOf(owner),
            Game = entity.Game,
            TrackCourse = entity.TrackCourse,
            CarModel = entity.CarModel,
            LapNumber = entity.LapNumber,
            LapTimeSeconds = entity.LapTimeSeconds,
            DrivenAt = entity.DrivenAt,
            PayloadBase64 = Convert.ToBase64String(entity.Payload),
        };
    }

    /// <summary>Withdraws a code. Only its owner can, and it stays listed to them as revoked.</summary>
    public async Task<SharedLapSummary> RevokeAsync(string ownerId, string code, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);

        var entity = await db.LapTraces.FirstOrDefaultAsync(t => t.ShareCode == code, ct)
            ?? throw new GraphQLException("No lap exists for that code.");

        if (!string.Equals(entity.OwnerId, ownerId, StringComparison.Ordinal))
        {
            // Deliberately the same message a stranger's unknown code gets: telling them the
            // code exists but belongs to someone else confirms a code they should not have.
            throw new GraphQLException("No lap exists for that code.");
        }

        entity.Revoked = true;
        await db.SaveChangesAsync(ct);
        return Summary(entity);
    }

    /// <summary>Everything this driver has shared, newest first.</summary>
    public async Task<IReadOnlyList<SharedLapSummary>> ListMineAsync(string ownerId, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var rows = await db.LapTraces
            .Where(t => t.OwnerId == ownerId)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(ct);

        return [.. rows.Select(Summary)];
    }

    private static string DisplayNameOf(UserEntity? owner) =>
        owner?.DisplayName is { Length: > 0 } name ? name : "Unknown driver";

    private static byte[] DecodePayload(string base64)
    {
        if (string.IsNullOrWhiteSpace(base64))
        {
            throw new GraphQLException("A shared lap needs its trace payload.");
        }

        byte[] payload;
        try
        {
            payload = Convert.FromBase64String(base64);
        }
        catch (FormatException)
        {
            throw new GraphQLException("The trace payload is not valid base64.");
        }

        return payload.Length is 0 or > MaxPayloadBytes
            ? throw new GraphQLException("The trace payload is empty or too large.")
            : payload;
    }

    private static async Task<string> UniqueCodeAsync(SprintDbContext db, CancellationToken ct)
    {
        // 29^12 is far beyond collision territory, but a unique index would throw on the
        // astronomically unlikely clash and a retry is two lines.
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var code = NewCode();
            if (!await db.LapTraces.AnyAsync(t => t.ShareCode == code, ct))
            {
                return code;
            }
        }

        throw new GraphQLException("Could not mint a share code. Try again.");
    }

    private static string NewCode()
    {
        Span<char> code = stackalloc char[CodeLength];
        for (var i = 0; i < CodeLength; i++)
        {
            code[i] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
        }

        return new string(code);
    }

    private static SharedLapSummary Summary(LapTraceEntity entity) => new()
    {
        Id = entity.Id,
        ShareCode = entity.ShareCode,
        Game = entity.Game,
        TrackCourse = entity.TrackCourse,
        CarModel = entity.CarModel,
        LapNumber = entity.LapNumber,
        LapTimeSeconds = entity.LapTimeSeconds,
        Revoked = entity.Revoked,
        CreatedAt = entity.CreatedAt,
    };
}
