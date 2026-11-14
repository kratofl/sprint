# Web design mockups

Local and gitignored, except this file (it keeps the folder the mockup page imports from). A
mockup is `<name>.tsx` here, default-exporting a `Mockup` (`lib/mockup.ts`): options A, B and C
in the app's own components and tokens. Shoot it from `web/` with
`node scripts/mockup.mjs <name>`; the pictures and the comparison sheet land in `shots/<name>/`.
Once an option is picked, build it into the real page and delete the mockup.
