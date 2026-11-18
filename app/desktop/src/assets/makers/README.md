# Maker marks

From [Simple Icons](https://simpleicons.org) 16.38.0 (CC0 1.0). The marks remain their makers'
trademarks; Sprint shows them only to name the car. Each file is named after the make as
`CarNames.MakeOf` returns it, in lower-case letters only (`Aston Martin` → `astonmartin.svg`,
`Mercedes-AMG` → `mercedesamg.svg`, copied from Simple Icons' `amg`; `corvette.svg` is Simple
Icons' `chevrolet`, as LMU names the Corvette's maker Chevrolet). A make without a file shows its
first letter.

`colors.json` is each make's primary colour, the badge's fill (`makerBadge.ts` picks the ink).
For makes with a mark it is Simple Icons' own brand colour; for the letter-only makes (Alpine,
Genesis, Ginetta, Glickenhaus, Isotta Fraschini, Lexus, Ligier, Oreca, Vanwall) it is our pick of
the colour the brand races in. A make missing from it gets a neutral badge.
