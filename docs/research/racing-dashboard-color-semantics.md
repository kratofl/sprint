# Racing dashboard color semantics

Research date: 2026-07-15

## Question

What color meanings are defensible for Sprint wheel and racing-dashboard
surfaces, especially for traction-control activity, cold or low values, normal
values, warnings, and errors?

## Findings

### There is no universal racing-dashboard semantic palette

Professional motorsport displays are generally authored per car or team rather
than governed by one cross-series UI color standard. AiM exposes freely
configurable RGB shift and alarm LEDs, including trigger, color, blink behavior,
and reset conditions. MoTeC Display Creator allows teams to design their own
graphics, icons, states, and warnings. Bosch DDU displays likewise provide
user-configurable pages, conditional formatting, alarms, and RGB LEDs.

Sources: [AiM RaceStudio 3 configuration](https://www.aim-sportline.com/docs/racestudio3/manual/html/configuration.html),
[AiM GS-Dash](https://www.aim-sportline.com/en/products/gs-dash/index.htm),
[MoTeC Display Creator](https://www.motec.com.au/products/Display%20Creator),
[Bosch DDU 9 manual](https://www.bosch-motorsport.com/media/downloads/ddu_9_manual.pdf),
[Bosch DDU 10](https://www.bosch-motorsport.com/ja/%E4%BA%A7%E5%93%81%EF%BC%88%E8%8B%B1%E8%AF%AD%EF%BC%89/displays/display-ddu-10/).

FIA rules do mandate colors for particular safety functions, but these are
narrow protocols rather than a general cockpit UI vocabulary. For example, the
LMDh electrical-safety indicator uses solid green for a safe energy-recovery
system and flashing red for danger or a system defect; the same regulation also
reserves blue for a medical light. That does not establish green as generic
“success,” red as every error, or blue as generic information throughout the
dashboard.

Source: [FIA LMDh Technical Regulations, section 14.29](https://www.fia.com/sites/default/files/lmdh_technical_regulations_2024.10.22.pdf).

### Blue is a strong convention for traction-control intervention, but not a rule

Several first-party iRacing car manuals, which document the modeled in-car
displays, use blue specifically for active TC intervention:

- The Chevrolet Corvette Z06 GT3.R overlays blue LEDs as TC cuts more torque;
  green LEDs separately show approach to the rear-tire slip target.
- The Porsche 963 GTP flashes both LED clusters blue when TC intervenes.
- The BMW M Hybrid V8 uses blue LED clusters for TC intervention and varies the
  presentation with intervention severity.
- The Lamborghini Huracán GT3 EVO illuminates both its TC and ABS settings blue
  when the respective system is active.

Sources: [iRacing Chevrolet Corvette Z06 GT3.R manual](https://s100.iracing.com/wp-content/uploads/2024/06/Chevrolet-Corvette-Z06-GT3_manual_V2.pdf),
[iRacing Porsche 963 GTP manual](https://s100.iracing.com/wp-content/uploads/2023/09/Porsche-963-GTP-Manual-V2.pdf),
[iRacing BMW M Hybrid V8 manual](https://s100.iracing.com/wp-content/uploads/2025/01/BMW-M-Hybrid-V8-V2.pdf),
[iRacing Lamborghini Huracán GT3 EVO manual](https://s100.iracing.com/wp-content/uploads/2023/10/UM-Lamborghini-Huracan-GT3-Evo-Manual.pdf).

This convention is not universal. The Dallara P217 LMP2 manual uses red for TC
activation as well as for wheel-lock indicators. Sprint therefore should treat
`tc-active` as a named state whose default may be blue, while allowing a
car-specific profile to preserve a source dashboard's different convention.

Source: [iRacing Dallara P217 LMP2 manual](https://s100.iracing.com/wp-content/uploads/2025/03/UM-Dallara-P217-LMP2-V2.pdf).

### Blue is also a strong convention for cold or too-low telemetry

The Ford Mustang GT3 display uses blue for cool brake rotors, underinflated
tires, and cold tire carcasses; white denotes the desired operating range and
red denotes too high or overheated. The McLaren 720S GT3 similarly uses blue for
cold brake rotors and underinflated tires, white for the optimum range, and red
for overheated or overinflated values. The Ferrari 296 GT3 follows the same
blue/neutral/red progression for low, optimum, and high tire pressure and for
cold, optimum, and hot brake temperatures.

Sources: [iRacing Ford Mustang GT3 manual](https://s100.iracing.com/wp-content/uploads/2024/06/Mustang-GT3_Manual_V2.pdf),
[iRacing McLaren 720S GT3 manual](https://s100.iracing.com/wp-content/uploads/2024/09/Mclaren-720S-GT3.pdf),
[iRacing Ferrari 296 GT3 manual index](https://www.iracing.com/resources/user-manuals/).

Blue therefore should not be named `informational` on a wheel dashboard. It
means a specific operating state: cold/low for bounded telemetry, or active
electronic intervention when attached to TC/ABS. Those meanings are
distinguished by the data field, position, label/icon, and behavior rather than
by color alone.

### “Good” is contextual; neutral white is often the normal operating state

The GT3 examples above commonly render values in white when they are within the
operating window. Green is used when an explicit target or enabled condition
needs acknowledgement: the Corvette's green slip lights show progress toward a
target, and its pit-limiter display uses green at or below target speed. The
Aston Martin Vantage GT3 EVO similarly uses green at the pit-speed target,
orange above it, and white when too slow.

Sources: [iRacing Chevrolet Corvette Z06 GT3.R manual](https://s100.iracing.com/wp-content/uploads/2024/06/Chevrolet-Corvette-Z06-GT3_manual_V2.pdf),
[iRacing Aston Martin Vantage GT3 EVO manual](https://s100.iracing.com/wp-content/uploads/2026/01/Aston-Martin-GT3-Evo-V1.pdf).

This supports two separate states:

- `neutral`: no judgment or no attention required; normally white/gray on a
  dark surface.
- `in-range` or `on-target`: an explicitly evaluated desired condition; green
  may be used when that distinction is operationally useful.

Calling green `success` imports a generic application concept that is usually
absent from a live racing display. `Good`, `in-range`, or `on-target` is the
better domain language.

### Orange, yellow, and red cannot be reduced to one universal severity ladder

Car-specific examples use these colors for different functions:

- On the Corvette pit-limiter page, green means at/below target, orange means
  moderately above target, and red means far above target.
- The Aston Martin uses orange above pit-lane target and green on target.
- The Corvette uses orange for rear-wheel lockup and red for front-wheel
  lockup, encoding location rather than generic severity.
- The Porsche 911 GT3 R shift sequence progresses green, yellow, then red with
  RPM, while its pit limiter uses orange for overspeed.
- FIA LMDh electrical-safety signage uses flashing red specifically for danger
  or system defect.

Sources: [iRacing Chevrolet Corvette Z06 GT3.R manual](https://s100.iracing.com/wp-content/uploads/2024/06/Chevrolet-Corvette-Z06-GT3_manual_V2.pdf),
[iRacing Aston Martin Vantage GT3 EVO manual](https://s100.iracing.com/wp-content/uploads/2026/01/Aston-Martin-GT3-Evo-V1.pdf),
[iRacing Porsche 911 GT3 R manual](https://s100.iracing.com/wp-content/uploads/2023/09/UM-Porsche-911-GT3-R-Manual-V2.pdf),
[FIA LMDh Technical Regulations](https://www.fia.com/sites/default/files/lmdh_technical_regulations_2024.10.22.pdf).

Sprint can choose orange for an actionable warning and red for an error or
critical condition, but that is a Sprint convention, not a racing-wide
standard. Yellow is best retained as an optional caution/range color or as a
car-authentic encoded state rather than made mandatory in every palette.

## Design-system implications

Use domain states, not generic application semantics:

| State | Default rendering | Meaning |
| --- | --- | --- |
| `neutral` | white/gray | Raw value or state requiring no judgment |
| `in-range` / `on-target` | green when useful; otherwise neutral | Explicitly evaluated desired operating state |
| `cold-low` | blue | Below operating temperature, pressure, or other lower bound |
| `assist-active` | blue by default, with label/icon/placement | TC/ABS intervention; never inferred from blue alone |
| `warning` | orange | Action or attention required soon |
| `critical` / `error` | red | Immediate risk, invalid state, or system defect |

Additional rules:

1. Do not define generic `informational` or `success` colors for wheel and dash
   surfaces. Those concepts belong to the application UI, not the live racing
   semantic layer.
2. Never communicate state by color alone. Pair it with a stable field
   position, label or icon, threshold direction, and where appropriate a
   bounded animation such as flashing for intervention or criticality.
3. Keep `cold-low` separate from `assist-active` in the token/API vocabulary
   even if both render blue by default.
4. Let game/car adapters override the visual mapping when Sprint intentionally
   reproduces a source dashboard. This is necessary for cases such as the
   Dallara P217's red TC indicator.
5. Treat yellow/orange/red severity as a Sprint-authored hierarchy only on
   Sprint-designed dashboards; do not reinterpret colors in authentic
   car-specific layouts.

## Uncertainties and limits

- Simulator manuals are first-party documentation of their modeled cars, but
  they are not homologation documents from the vehicle manufacturers. They are
  strong evidence of implemented cockpit conventions, not proof that every
  real vehicle uses precisely the same thresholds or colors.
- FIA documents standardize a few safety indicators, not the whole dashboard.
  Absence of a general palette in the reviewed rules should not be read as
  proof that no series, manufacturer, or team has a narrower specification.
- Orange versus yellow warning thresholds vary by vehicle and function. Sprint
  should validate its own thresholds per telemetry channel rather than attach
  severity only from the color name.
