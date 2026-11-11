# Site Director: an SCP Foundation manager

Run an SCP Foundation containment site for one year. Build it, staff it, study what you hold, and keep it all locked away. Things will escape. Groups of Interest will come knocking. The public must never find out.

A turn-based management game, not an idle grinder: every turn is one week, every week asks for a few real decisions, and a full posting takes roughly 30–45 minutes. You can (and will) lose.

## How it plays

- **Your site** is split into three zones: the **Office Zone**, **Light Containment** and **Heavy Containment**. Build containment chambers (Standard, Reinforced, Maximum), research labs, staff quarters, barracks, D-Class blocks, generators, security checkpoints, armories, a medical bay, break rooms, administration, amnestics labs and reality anchor arrays. Expand zones when you run out of space.
- **Resources:** funds (a weekly O5 budget against upkeep and salaries), **O5 approval**, **public exposure** (the Veil), **morale**, **power**, and **research**.
- **Personnel:** researchers, engineers, medics, security and D-Class, each with housing limits, salaries and jobs. Mobile Task Forces (Epsilon-11, Nu-7, Alpha-1) once you have researched and armed them.
- **14 anomalies with their own rules,** among them SCP-173 (cleaning crews blink), SCP-096 (a leaked photo sets it off), SCP-106 (the Femur Breaker), SCP-682 (if it stays loose, the site is lost), SCP-079 (hacks your power and doors), SCP-914 (refine equipment, from scrap to miracles), SCP-999, SCP-500 and SCP-131 (who keep an eye on 173).
- **Breaches** are decisions: lockdown and sweep, send in the MTF, use the anomaly's own procedure, or seal the zone and wait. Unresolved breaches cost lives, exposure and approval every week, and can spread.
- **Groups of Interest:** Chaos Insurgency raids, the Serpent's Hand freeing anomalies, GOC demands, Marshall, Carter & Dark offers, the Church of the Broken God, Are We Cool Yet? art, and infiltrators.
- **Good and bad news:** grants, recruits, breakthroughs, commendations, budget cuts, riots, leaks, audits, earthquakes…
- **Quarterly O5 reviews** with two goals each quarter.
- **Research tree** (18 projects): containment protocols, MTF units, reality anchors, amnestics, the Femur Breaker, acid containment for 682, an air-gapped network for 079…
- **Three difficulties:** Safe, Euclid, Keter. An optional endless mode after you survive the year.

### Losing
- O5 approval reaches 0.
- Exposure reaches 100.
- Four weeks over budget.
- Three anomalies loose at once.
- A Keter anomaly loose for three weeks.
- SCP-682 loose for two weeks.
- Nobody left to run the site.

## Running it

No build step and nothing to install. Serve the folder and open it:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

It is plain HTML, CSS and ES modules, so it also works on GitHub Pages. Progress saves in the browser; the ⚙️ menu gives you a save code to move a game between devices.

## Balance testing

`tools/sim.mjs` plays hundreds of postings with a "smart" bot (or a "lazy" one that only ends weeks) and reports win rates and how games are lost:

```bash
node tools/sim.mjs 200 all smart     # every difficulty
node tools/sim.mjs 150 euclid lazy
```

## Licence and credits

Based on the [SCP Foundation](https://scp-wiki.wikidot.com/) wiki. SCP Foundation content is licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), and this game is shared under the same licence. The anomalies, organisations and concepts come from the wiki's many authors; every description in the game is written fresh for it.
