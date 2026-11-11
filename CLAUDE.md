# CLAUDE.md

Site Director: a turn-based SCP Foundation site manager. Vanilla HTML/CSS/ES modules, no build step, no package manager. Serve with `python3 -m http.server` and open `index.html`.

- `js/data.js`: rooms, staff, MTF, anomalies (`SCPS`), research (`TECH`), difficulties, groups of interest.
- `js/state.js`: `newGame`, save/load, save codes. The whole game is one plain object `S`.
- `js/sim.js`: the rules (economy, power, research, security, breach chances, casualties, actions) and `endWeek`.
- `js/events.js`: every event (`ev({...})`), breaches, recoveries, raids, quarterly reviews, anomaly actions (`SPECIAL`). Events queue in `S.queue` and are resolved with `pending` / `resolve`.
- `js/ui.js`: rendering and input (event delegation on `data-a`).
- All randomness must go through `rnd/chance/int/pick/weighted` in `js/util.js` (seeded, stored in `S.rng`), never `Math.random()` in game logic.
- Money is in thousands of dollars (`money(1250)` → "$1.25M").
- Balance check after any rules change: `node tools/sim.mjs 200 all smart` (aim for roughly Safe ~85–90%, Euclid ~70%, Keter ~55% for the bot) and `node tools/sim.mjs 150 euclid lazy` (should mostly lose). Both must report `errors: 0`.
- SCP content is CC BY-SA 3.0: keep the attribution in the README and the title screen, and write descriptions in your own words.
- Escape any player-entered text (site name) with `esc()`.
