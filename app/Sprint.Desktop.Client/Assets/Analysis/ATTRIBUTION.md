# Analysis artwork

## Le Mans Ultimate logo

- File: `game-le-mans-ultimate.png`
- Creator: Le Mans Ultimate
- Source: https://commons.wikimedia.org/wiki/File:LeMansUltimateLogo.png
- License: Public-domain text logo (trademark rights may still apply)
- Changes: none

## Porsche 963

- File: `car-porsche-963.jpg`
- Creator: MrWalkr
- Source: https://commons.wikimedia.org/wiki/File:Porsche_963.jpg
- License: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/
- Changes: resized by Wikimedia's thumbnail service; displayed with a center crop in the app

## Ferrari 296 GT3

- File: `car-ferrari-296-gt3.jpg`
- Creator: Alexandre Prévot
- Source: https://commons.wikimedia.org/wiki/File:Ferrari_296_GT3_(54971924786).jpg
- License: CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/
- Changes: resized by Wikimedia's thumbnail service; displayed with a center crop in the app

## Retained generated prototype car art

- File: `car-generic-generated.png`
- Creator: OpenAI image generation, generated for Sprint
- Source: project-generated asset; no third-party image source
- Changes: none; retained for prototype/reference use; the Analysis car picker does not use it as
  an identity fallback
- Prompt summary: unbranded modern endurance race car on a matte near-black studio backdrop,
  centered for a wide UI crop, with restrained graphite and ember-orange details and no logos,
  text, people, watermark, glow, or track environment

## Retained generated GT car art

- File: `car-generic-gt-generated.png`
- Creator: OpenAI image generation, generated for Sprint
- Source: project-generated asset; no third-party image source
- Changes: none; retained for prototype/reference use; the Analysis car picker does not use it as
  an identity fallback
- Prompt summary: unbranded, production-derived modern GT3 endurance car on a matte near-black
  studio backdrop, centered for a wide UI crop, with restrained graphite and ember-orange details
  and no logos, text, people, watermark, glow, or track environment

## Circuit layouts

Every `track-*.svg` here is a **derivative** of the Wikimedia Commons circuit map named below.
The same processing was applied to all of them:

- the single circuit path was extracted from the source map and everything else — labels, corner
  numbers, kerbs, pit lanes, north arrows, scale bars — was discarded;
- for sources that draw the circuit as a filled ribbon, the outer contour of that ribbon was kept
  as the line;
- the result is stored as one `<path>` with a tight `viewBox`, and Sprint fits and recolours it at
  runtime (`TrackLayoutView`), so the drawn line weight is the same for every circuit.

File names follow the circuit identity in `GameTrackCatalog`, and every layout of a circuit shares
its outline.

| File | Source | Creator | License |
| --- | --- | --- | --- |
| `track-algarve.svg` | [Autódromo do Algarve alt.svg](https://commons.wikimedia.org/wiki/File:Aut%C3%B3dromo_do_Algarve_alt.svg) | Sentoan; derivative work by Gpmat | CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/ |
| `track-bahrain.svg` | [Circuit Bahrain 2004.svg](https://commons.wikimedia.org/wiki/File:Circuit_Bahrain_2004.svg) | AlexJ | CC0 — https://creativecommons.org/publicdomain/zero/1.0/ |
| `track-barcelona.svg` | [Formula1 Circuit Catalunya 2021.svg](https://commons.wikimedia.org/wiki/File:Formula1_Circuit_Catalunya_2021.svg) | GabrielStella | CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/ |
| `track-cota.svg` | [Austin Formula One circuit-2.svg](https://commons.wikimedia.org/wiki/File:Austin_Formula_One_circuit-2.svg) | Ronny Astrada | CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/ |
| `track-daytona.svg` | [Daytona International Speedway - Road Course.svg](https://commons.wikimedia.org/wiki/File:Daytona_International_Speedway_-_Road_Course.svg) | Will Pittenger | Public domain |
| `track-fuji.svg` | [Fuji.svg](https://commons.wikimedia.org/wiki/File:Fuji.svg) | Will Pittenger | CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/ |
| `track-imola.svg` | [Imola.svg](https://commons.wikimedia.org/wiki/File:Imola.svg) | Will Pittenger | CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/ |
| `track-interlagos.svg` | [Circuit Interlagos.svg](https://commons.wikimedia.org/wiki/File:Circuit_Interlagos.svg) | Ch1902 | Public domain |
| `track-le-mans.svg` | [Circuit de la Sarthe.svg](https://commons.wikimedia.org/wiki/File:Circuit_de_la_Sarthe.svg) | Paul Skinner | CC BY-SA 2.0 UK — https://creativecommons.org/licenses/by-sa/2.0/uk/ |
| `track-monza.svg` | [Autodromo monza.svg](https://commons.wikimedia.org/wiki/File:Autodromo_monza.svg) | Wikimedia Commons contributor | Public domain |
| `track-paul-ricard.svg` | [Circuit Paul Ricard 2020 layout map.svg](https://commons.wikimedia.org/wiki/File:Circuit_Paul_Ricard_2020_layout_map.svg) | Antonsusi | CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/ |
| `track-sebring.svg` | [Sebring International Raceway.svg](https://commons.wikimedia.org/wiki/File:Sebring_International_Raceway.svg) | Wikimedia Commons contributor | Public domain |
| `track-silverstone.svg` | [Silverstone Circuit 2010 version-v2.svg](https://commons.wikimedia.org/wiki/File:Silverstone_Circuit_2010_version-v2.svg) | Ronny Astrada | CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/ |
| `track-spa.svg` | [Spa-Francorchamps of Belgium.svg](https://commons.wikimedia.org/wiki/File:Spa-Francorchamps_of_Belgium.svg) | Will Pittenger | CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/ |
