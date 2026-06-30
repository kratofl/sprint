namespace Sprint.Games.LeMansUltimate;

internal static class LmuParser
{
    public static LmuParsedFrame Parse(ReadOnlySpan<byte> buffer)
    {
        _ = LmuBinary.Slice(buffer, 0, LmuBinary.TotalBufferSize);

        var scoringInfo = ParseScoringInfo(LmuBinary.Slice(buffer, LmuBinary.ScoringStart, LmuBinary.ScoringInfoSize));
        var playerIndex = LmuBinary.ReadByte(buffer, LmuBinary.PlayerIndexOffset);
        var playerHasVehicle = LmuBinary.ReadBool(buffer, LmuBinary.PlayerHasVehicleOffset);

        if (playerIndex >= LmuBinary.MaxVehicles)
        {
            throw new LmuDecodeException($"LMU player index {playerIndex} is outside max vehicle count {LmuBinary.MaxVehicles}");
        }

        if (!PlayerInCar(playerHasVehicle, scoringInfo))
        {
            return new LmuParsedFrame
            {
                ScoringInfo = scoringInfo,
                PlayerHasVehicle = playerHasVehicle,
                PlayerIndex = playerIndex
            };
        }

        throw new LmuDecodeException("LMU player is in car, but vehicle parsing is not wired yet");
    }

    public static bool PlayerInCar(bool playerHasVehicle, LmuScoringInfo scoringInfo) =>
        playerHasVehicle && scoringInfo.InRealtime;

    private static LmuScoringInfo ParseScoringInfo(ReadOnlySpan<byte> bytes)
    {
        return new LmuScoringInfo
        {
            TrackName = LmuBinary.ReadNullTerminatedString(LmuBinary.Slice(bytes, 0, 64)),
            Session = LmuBinary.ReadInt32(bytes, 64),
            CurrentElapsedTime = LmuBinary.ReadDouble(bytes, 68),
            MaxLaps = LmuBinary.ReadInt32(bytes, 84),
            LapDistance = LmuBinary.ReadDouble(bytes, 88),
            NumVehicles = LmuBinary.ReadInt32(bytes, 104),
            GamePhase = LmuBinary.ReadByte(bytes, 108),
            InRealtime = LmuBinary.ReadBool(bytes, 114)
        };
    }
}
