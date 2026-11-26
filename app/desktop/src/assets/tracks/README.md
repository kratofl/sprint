# Track data

Sprint bundles two extracts of [Lovely Track Data](https://github.com/Lovely-Sim-Racing/lovely-track-data)
by Lovely Sim Racing, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
Keys are LMU's own track names in lower case, as the data names them. Refresh both with
`node app/desktop/scripts/sync-track-data.mjs`.

- `lmu-turns.json` (here) is each Le Mans Ultimate track's turns by their real number, at the apex
  as a share of the lap. Analysis numbers a lap's corners by it (`trackTurns.ts`). The data gives
  apexes to two decimals (about 60 m at Monza), so a chicane's turns land together; Analysis shows
  them as one.
- `app/Sprint.Games/LeMansUltimate/lmu-pit-loss.json` is each track's typical pit loss per class
  (`hyp`, `lmp2`, `lmp3`, `gte`, `gt3`), from drivers' online races: `dt` is what a drive-through
  loses, `pit` what a typical race stop loses, both against staying on track. Until a session
  measures a stop, the dash and the pit wall show it as the lane loss (`dt`) plus the standing time
  (`pit` − `dt`) for the player's class (`GamePitLossCatalog.cs`). An ELMS LMP2 reads `lmp2`.
