# FactorioLab DSP dataset

Vendored, unmodified, from [factoriolab/factoriolab](https://github.com/factoriolab/factoriolab)
(MIT). `scripts/buildGameData.mjs` reads these and emits `public/data/game.json`
plus `public/icons/*.webp`; nothing else in the app touches them.

| file | upstream path |
|---|---|
| `data.json` | `public/data/dsp/data.json` |
| `defaults.json` | `public/data/dsp/defaults.json` |
| `icons.webp` | `public/data/dsp/icons.webp` |

- Pulled: 2026-09-05
- Upstream commit: `377ed37c5969f654897d108e09273765742207c7` ("fix(dsp): Add holo beacon", 2026-08-07)
- Game version the data pins: DSP 0.10.29.21950

## Updating

    curl -sfLo vendor/factoriolab/data.json     https://raw.githubusercontent.com/factoriolab/factoriolab/main/public/data/dsp/data.json
    curl -sfLo vendor/factoriolab/defaults.json https://raw.githubusercontent.com/factoriolab/factoriolab/main/public/data/dsp/defaults.json
    curl -sfLo vendor/factoriolab/icons.webp    https://raw.githubusercontent.com/factoriolab/factoriolab/main/public/data/dsp/icons.webp
    npm run build-data

Then record the new commit sha above, and read the generator's warnings - it
prints anything it had to drop.

`i18n/zh.json` is deliberately not vendored: `src/Worker.js` has a `translate`
hook but the app only ever feeds it `{}`.
