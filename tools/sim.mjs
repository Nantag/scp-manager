// Balance bot: plays many postings and reports how they end.
// node tools/sim.mjs [games] [difficulty|all] [policy: smart|lazy]
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { newGame } = await import('../js/state.js');
const SIM = await import('../js/sim.js');
const { pending, resolve, special } = await import('../js/events.js');
const { ROOMS, TECH, CLASS_TIER } = await import('../js/data.js');

const N = +process.argv[2] || 200, DIFFS = process.argv[3] && process.argv[3] !== 'all' ? [process.argv[3]] : ['safe', 'euclid', 'keter'], POLICY = process.argv[4] || 'smart';
const ORDER = ['proto1', 'e11', 'femur', 'amnB', 'drills', 'airgap', 'psych', 'proto2', 'acid', 'sra', 'intel', 'autodef', 'nu7', 'lobby', 'amnC', 'calib', 'proto3', 'a1'];

function smartWeek(S) {
  const { build, hire, research, formMtf, testScp, capacity, housed, power, roomsOf, usedIn, slotsIn, expand, freeChamber, def, breachChance, repair, repairCost } = SIM;
  const room = (zone, type) => build(S, zone, type).ok;
  const space = z => usedIn(S, z) < slotsIn(S, z) || (S.funds > 900 && expand(S, z).ok);
  // chambers for whatever is waiting, plus one spare of each kind
  for (const s of S.scps.filter(x => x.state === 'provisional')) { const t = CLASS_TIER[def(s).cls]; const z = t === 3 ? 'hcz' : 'lcz'; if (space(z)) room(z, t === 3 ? 'cont3' : t === 2 ? 'cont2' : 'cont1'); }
  if (S.funds > 1100 && !freeChamber(S, 2) && space('lcz')) room('lcz', 'cont2');
  if (S.funds > 1500 && S.week > 8 && !freeChamber(S, 3) && space('hcz')) room('hcz', 'cont3');
  // power & engineers
  let p = power(S); if (p.deficit > 0) { const z = ['office', 'lcz', 'hcz'].find(z => usedIn(S, z) < slotsIn(S, z)); if (z) room(z, 'gen'); }
  if (S.staff.engineer < roomsOf(S, 'gen').length + 1) hire(S, 'engineer');
  // housing
  if (housed(S, 'researcher') >= capacity(S, 'researcher') - 1 && space('office')) room('office', 'quarters');
  if (housed(S, 'guard') >= capacity(S, 'guard') - 1) room(usedIn(S, 'lcz') < slotsIn(S, 'lcz') ? 'lcz' : 'office', 'barracks');
  if (housed(S, 'dclass') >= capacity(S, 'dclass') - 1 && space('lcz')) room('lcz', 'dblock');
  // staff (only while the weekly balance can carry it)
  const afford = () => SIM.net(S) > 25;
  while (S.staff.researcher < Math.ceil(S.scps.length * 1.5) && afford() && hire(S, 'researcher').ok);
  while (S.staff.guard < 8 + S.scps.length * 2 && S.funds > 400 && afford() && hire(S, 'guard').ok);
  while (S.staff.dclass < 8 && hire(S, 'dclass').ok);
  if (S.staff.medic < 2) hire(S, 'medic');
  // useful rooms
  for (const [z, t] of [['lcz', 'checkpoint'], ['office', 'medbay'], ['office', 'lab'], ['hcz', 'checkpoint'], ['office', 'armory'], ['office', 'amnestics'], ['hcz', 'sra']]) if (!roomsOf(S, t).length && S.funds > ROOMS[t].cost + 400 && afford() && space(z)) room(z, t);
  for (const r of S.rooms.filter(r => r.dmg > 0.4)) if (S.funds > repairCost(r) + 500) repair(S, r.id);
  // research and MTF
  for (const id of ORDER) research(S, id);
  if (S.funds > 1500 && SIM.net(S) > 80) formMtf(S, SIM.has(S, 'nu7') ? 'nu7' : 'e11');
  // cut costs when bleeding money
  if (SIM.net(S) < 0 && S.funds < 600) { if (S.staff.guard > 10) SIM.dismiss(S, 'guard', 2); if (S.mtf.length && S.funds < 200) SIM.disband(S, S.mtf[0].id); }
  // tests on safe-ish anomalies
  for (const s of S.scps.filter(s => s.state === 'contained')) if (S.staff.dclass > 6 && breachChance(S, s) < 0.05) testScp(S, s.uid);
  const v = S.scps.find(s => s.id === '999'); if (v) special(S, v.uid);
}
function decide(S, p) {
  const ok = p.choices.map((c, i) => ({ c, i })).filter(x => !x.c.why);
  if (POLICY === 'smart' && p.e.id === 'breach') {
    const score = x => { const m = /(\d+)%/.exec(x.c.hint || ''); return m ? +m[1] : x.c.label.startsWith('Seal') ? 1 : 0; };
    return ok.sort((a, b) => score(b) - score(a))[0].i;
  }
  if (POLICY === 'smart' && p.e.id === 'recovery') return ok[0].i;            // contain it
  return ok[Math.floor(Math.random() * ok.length)].i;
}

const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
for (const diff of DIFFS) {
  const res = { won: 0, reasons: {}, weeks: [], breaches: [], deaths: [], scps: [], grades: {}, errors: 0, funds: [], appr: [], expo: [], mor: [], acq: [], minAppr: [], raids: [] };
  for (let g = 0; g < N; g++) {
    const S = SIM.beginPosting(newGame({ diff, seed: 1000 + g }));
    try {
      let guard = 0;
      while (!S.over && guard++ < 60) {
        if (POLICY === 'smart') smartWeek(S);
        const r = SIM.endWeek(S); if (!r.ok) { console.log('endWeek refused:', r.msg); break; }
        let p, k = 0;
        while (!S.over && (p = pending(S)) && k++ < 30) { const out = resolve(S, decide(S, p)); if (out?.error) { console.log('choice error', p.e.id, out.error); S.queue.shift(); } }
      }
      if (S.over?.won) res.won++; else { const key = (S.over?.reason || 'unfinished').split(/[.:]/)[0].slice(0, 60); res.reasons[key] = (res.reasons[key] || 0) + 1; }
      res.funds.push(Math.round(S.funds)); res.appr.push(Math.round(S.approval)); res.expo.push(Math.round(S.exposure)); res.mor.push(Math.round(S.morale)); res.acq.push(S.stats.acquired); res.minAppr.push(Math.min(...S.hist.map(h => h.a))); res.raids.push(S.stats.raids);
      res.weeks.push(S.week - 1); res.breaches.push(S.stats.breaches); res.deaths.push(S.stats.deaths); res.scps.push(S.scps.length);
      const gr = SIM.grade(S).grade; res.grades[gr] = (res.grades[gr] || 0) + 1;
      if (S.log.some(l => /undefined|NaN|\[object/.test(l.text))) { res.errors++; if (res.errors < 3) console.log('BAD TEXT', S.log.find(l => /undefined|NaN|\[object/.test(l.text))); }
    } catch (e) { res.errors++; if (res.errors < 4) console.log('ERR', e.stack.split('\n').slice(0, 4).join(' | ')); }
  }
  console.log(`\n== ${diff} · ${POLICY} · ${N} games ==`);
  console.log({ winRate: Math.round(res.won / N * 100) + '%', medianWeeks: median(res.weeks), medBreaches: median(res.breaches), medDeaths: median(res.deaths), medAnomalies: median(res.scps), grades: res.grades, errors: res.errors });
  console.log({ endFunds: median(res.funds), endApproval: median(res.appr), lowestApproval: median(res.minAppr), endExposure: median(res.expo), endMorale: median(res.mor), acquired: median(res.acq), raids: median(res.raids) });
  console.log('losses:', Object.entries(res.reasons).sort((a, b) => b[1] - a[1]));
}
