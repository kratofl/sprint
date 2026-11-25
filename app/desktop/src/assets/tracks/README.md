# Track turns

`lmu-turns.json` is each Le Mans Ultimate track's turns by their real number, at the apex as a
share of the lap, from [Lovely Track Data](https://github.com/Lovely-Sim-Racing/lovely-track-data)
by Lovely Sim Racing, which its author offers for anyone to use. Analysis numbers a lap's corners
by it (`trackTurns.ts`). Keys are LMU's own track names in lower case, as the data names them.

Refresh it with `node app/desktop/scripts/sync-track-turns.mjs`. The data gives apexes to two
decimals (about 60 m at Monza), so a chicane's turns land together; Analysis shows them as one.
