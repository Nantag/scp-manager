// The rules: what everything costs, what it produces, and what happens when you press "End Week".
import { clamp, rnd, chance, int, pick } from './util.js';
import { ROOMS, ZONES, EXPAND_COST, STAFF, MTF, SCPS, CLASS_TIER, TECH, DIFFICULTY } from './data.js';
import { YEAR, save } from './state.js';
import { queue, drawEvents, quarterReview, startQuarter } from './events.js';

export const D = S => DIFFICULTY[S.diff];
export const has = (S, t) => !!S.tech[t];
const fail = msg => ({ ok: false, msg });
const okr = msg => ({ ok: true, msg });
export function note(S, text, kind = '') { S.report.push({ text, kind }); S.log.push({ week: S.week, text, kind }); if (S.log.length > 400) S.log.shift(); }

// ── the site ─────────────────────────────────────────────────────────────────
export const roomsOf = (S, type, zone) => S.rooms.filter(r => r.type === type && (!zone || r.zone === zone));
export const slotsIn = (S, zone) => ZONES[zone].slots + (S.slots[zone] || 0);
export const usedIn = (S, zone) => S.rooms.filter(r => r.zone === zone).length;
export const roomById = (S, id) => S.rooms.find(r => r.id === id);
export const scpIn = (S, roomId) => S.scps.find(s => s.room === roomId);
export const scpByUid = (S, uid) => S.scps.find(s => s.uid === uid);
export const def = s => SCPS[s.id];
export const tierOf = s => CLASS_TIER[def(s).cls];

export const capacity = (S, kind) => {
  if (kind === 'guard') return roomsOf(S, 'barracks').length * ROOMS.barracks.cap;
  if (kind === 'dclass') return roomsOf(S, 'dblock').length * ROOMS.dblock.cap;
  return roomsOf(S, 'quarters').length * ROOMS.quarters.cap;      // researchers + engineers + medics share quarters
};
export const housed = (S, kind) => kind === 'guard' || kind === 'dclass' ? S.staff[kind] : S.staff.researcher + S.staff.engineer + S.staff.medic;
export const totalStaff = S => Object.values(S.staff).reduce((a, b) => a + b, 0);

export function power(S) {
  const gens = roomsOf(S, 'gen').length;
  const staffed = Math.min(gens, S.staff.engineer);
  let supply = (staffed + (gens - staffed) * 0.5) * -ROOMS.gen.power;
  if (S.flags.blackout === S.week) supply *= 0.5;
  const demand = S.rooms.reduce((a, r) => a + Math.max(0, ROOMS[r.type].power), 0);
  return { supply, demand, deficit: demand > 0 ? Math.max(0, demand - supply) / demand : 0 };
}
export const labMult = S => 1 + 0.25 * roomsOf(S, 'lab').length;
export const armoryMult = S => 1 + 0.25 * Math.min(3, roomsOf(S, 'armory').length);
export const mtfCap = S => roomsOf(S, 'armory').length * 2;
// where morale settles if nothing dramatic happens; it moves part of the way there each week
export function moraleTarget(S) {
  const calm = S.scps.filter(s => s.state !== 'breached');
  return clamp(48 + Math.min(15, roomsOf(S, 'lounge').length * 5) + (has(S, 'psych') ? 8 : 0)
    + (calm.some(s => s.id === '999') ? 7 : 0) + (calm.some(s => s.id === '294') ? 4 : 0)
    - S.scps.filter(s => s.state === 'breached').length * 8 - (S.funds < 0 ? 8 : 0), 5, 95);
}
export const moraleMult = S => (S.morale < 30 ? 0.7 : S.morale < 50 ? 0.9 : S.morale > 80 ? 1.15 : 1);

export function budget(S) {
  return Math.round(D(S).budget + S.approval * 2 + roomsOf(S, 'admin').length * 50 + (has(S, 'lobby') ? 70 : 0));
}
// each anomaly costs something to keep: specialist staff, consumables, paperwork
export const SCP_UPKEEP = { Safe: 5, Euclid: 15, Keter: 35 };
export const upkeep = S => S.rooms.reduce((a, r) => a + ROOMS[r.type].upkeep, 0) + S.mtf.reduce((a, u) => a + MTF[u.type].upkeep, 0) + S.scps.reduce((a, s) => a + SCP_UPKEEP[def(s).cls], 0);
export const salaries = S => Object.entries(S.staff).reduce((a, [k, n]) => a + n * STAFF[k].salary, 0);
export const net = S => budget(S) - upkeep(S) - salaries(S);

export function rpRate(S) {
  const active = S.scps.filter(s => s.state !== 'breached');
  const need = active.length * 1.5;
  const staffing = need ? Math.min(1, S.staff.researcher / need) : 0;
  const base = active.reduce((a, s) => a + def(s).rp, 0);
  return Math.round(base * staffing * labMult(S) * moraleMult(S) * (1 - power(S).deficit * 0.5));
}

// security strength in a zone: guards, checkpoints, armories, automated defenses
export function security(S, zone) {
  return Math.round((S.staff.guard * 1.5 + roomsOf(S, 'checkpoint', zone).length * 14) * armoryMult(S) + (has(S, 'autodef') ? 25 : 0));
}
export const mtfPower = (S, u) => Math.round(MTF[u.type].power * (u.hp / 100) * armoryMult(S));
export const readyMtf = S => S.mtf.filter(u => u.hp >= 30 && u.busy !== S.week);

export function breachChance(S, s) {
  const d = def(s);
  if (s.state === 'breached' || !d.breach) return 0;
  let p = d.breach * D(S).breach;
  const room = s.room ? roomById(S, s.room) : null;
  if (!room) p *= 4;                                              // provisional containment
  else {
    const extra = ROOMS[room.type].tier - tierOf(s);
    if (extra > 0) p *= 0.6 ** extra;
    p *= 1 + room.dmg * 1.5;
    if (roomsOf(S, 'sra', room.zone).length) p *= 0.7;
  }
  for (const t of ['proto1', 'proto2', 'proto3']) if (has(S, t)) p *= 0.85;
  p *= 1 + power(S).deficit * 1.5;
  p *= S.morale < 30 ? 1.4 : S.morale > 75 ? 0.85 : 1;
  if (s.id === '173' && S.scps.some(x => x.id === '131' && x.state !== 'breached')) p *= 0.4;
  if (s.id === '682' && has(S, 'acid')) p *= 0.6;
  if (S.used['test' + s.uid] === S.week) p += d.test.risk;
  return clamp(p, 0, 0.6);
}

// ── people dying ─────────────────────────────────────────────────────────────
// n deaths, taken from the listed staff kinds in order of exposure. Medbays and SCP-500 save some.
export function casualties(S, n, prefer = ['dclass', 'guard', 'researcher', 'engineer', 'medic']) {
  if (n <= 0) return { dead: 0, saved: 0, text: '' };
  const medbays = Math.min(roomsOf(S, 'medbay').length, S.staff.medic);
  let saveP = Math.min(0.45, medbays * 0.15) + (has(S, 'drills') ? 0.1 : 0);
  let dead = 0, saved = 0; const lost = {};
  for (let i = 0; i < n; i++) {
    const pool = prefer.filter(k => S.staff[k] > 0);
    if (!pool.length) break;
    if (chance(S, saveP)) { saved++; continue; }
    if (S.scps.some(x => x.id === '500') && S.flags.pills > 0 && chance(S, 0.5)) { S.flags.pills--; saved++; continue; }
    const k = chance(S, 0.6) ? pool[0] : pick(S, pool);
    S.staff[k]--; lost[k] = (lost[k] || 0) + 1; dead++;
  }
  S.stats.deaths += dead; S.stats.saved += saved;
  S.morale = clamp(S.morale - Math.min(12, dead * 1.5), 0, 100);
  S.approval = clamp(S.approval - Math.min(6, dead * 0.25), 0, 100);
  const text = dead ? `${Object.entries(lost).map(([k, c]) => `${c} ${c === 1 ? STAFF[k].one : STAFF[k].name.toLowerCase()}`).join(', ')} killed${saved ? ` (${saved} saved by medical staff)` : ''}` : saved ? `${saved} wounded, all saved by medical staff` : '';
  return { dead, saved, text };
}

// ── actions ──────────────────────────────────────────────────────────────────
const spend = (S, c) => { if (S.funds < c) return false; S.funds -= c; return true; };
export function canBuild(S, zone, type) {
  const r = ROOMS[type];
  if (!r.zones.includes(zone)) return `Can't go in the ${ZONES[zone].name}.`;
  if (r.tech && !has(S, r.tech)) return `Research ${TECH[r.tech].name} first.`;
  if (usedIn(S, zone) >= slotsIn(S, zone)) return 'No free space in this zone.';
  if (S.funds < r.cost) return 'Not enough funds.';
  return '';
}
export function build(S, zone, type) {
  const why = canBuild(S, zone, type); if (why) return fail(why);
  spend(S, ROOMS[type].cost);
  S.rooms.push({ id: S.nextId++, type, zone, dmg: 0 });
  autoContain(S);
  return okr(`${ROOMS[type].name} built in the ${ZONES[zone].name}.`);
}
export function demolish(S, roomId) {
  const r = roomById(S, roomId); if (!r) return fail('No such room.');
  if (scpIn(S, roomId)) return fail('An anomaly is contained here. Transfer it first.');
  S.rooms = S.rooms.filter(x => x !== r);
  S.funds += Math.round(ROOMS[r.type].cost * 0.3);
  return okr(`${ROOMS[r.type].name} demolished (+30% of its cost back).`);
}
export const repairCost = r => Math.round(ROOMS[r.type].cost * r.dmg * 0.6);
export function repair(S, roomId) {
  const r = roomById(S, roomId); if (!r || !r.dmg) return fail('Nothing to repair.');
  if (!spend(S, repairCost(r))) return fail('Not enough funds.');
  r.dmg = 0; return okr(`${ROOMS[r.type].name} repaired.`);
}
export function expand(S, zone) {
  const n = S.slots[zone] || 0;
  if (slotsIn(S, zone) >= ZONES[zone].max) return fail('This zone cannot be expanded further.');
  if (!spend(S, EXPAND_COST(n))) return fail('Not enough funds.');
  S.slots[zone] = n + 1; return okr(`The ${ZONES[zone].name} was expanded.`);
}
export function hire(S, kind, n = 1) {
  const st = STAFF[kind];
  if (housed(S, kind) + n > capacity(S, kind)) return fail(`No room: build more ${kind === 'guard' ? 'Barracks' : kind === 'dclass' ? 'D-Class Blocks' : 'Staff Quarters'}.`);
  if (!spend(S, st.hire * n)) return fail('Not enough funds.');
  S.staff[kind] += n; return okr(`Hired ${n} ${n === 1 ? st.one : st.name.toLowerCase()}.`);
}
export function dismiss(S, kind, n = 1) {
  if (S.staff[kind] < n) return fail('Nobody to dismiss.');
  S.staff[kind] -= n; if (kind !== 'dclass') S.morale = clamp(S.morale - n, 0, 100);
  return okr(`${n} ${n === 1 ? STAFF[kind].one : STAFF[kind].name.toLowerCase()} ${kind === 'dclass' ? 'returned to the program' : 'reassigned elsewhere'}.`);
}
export function canResearch(S, id) {
  const t = TECH[id];
  if (has(S, id)) return 'Done.';
  if (t.req && !has(S, t.req)) return `Needs ${TECH[t.req].name}.`;
  if (S.rp < t.rp) return `Needs ${t.rp} research.`;
  return '';
}
export function research(S, id) {
  const why = canResearch(S, id); if (why) return fail(why);
  S.rp -= TECH[id].rp; S.tech[id] = S.week;
  return okr(`Research complete: ${TECH[id].name}.`);
}
export function formMtf(S, type) {
  const m = MTF[type];
  if (!has(S, m.tech)) return fail(`Research ${TECH[m.tech].name} first.`);
  if (S.mtf.length >= mtfCap(S)) return fail('Every armory supports 2 units: build another Armory.');
  if (!spend(S, m.cost)) return fail('Not enough funds.');
  const n = S.mtf.filter(u => u.type === type).length + 1;
  S.mtf.push({ id: S.nextId++, type, hp: 100, name: `${m.short}-${['A', 'B', 'C', 'D', 'E', 'F'][n - 1] || n}` });
  return okr(`${m.name} unit ${S.mtf[S.mtf.length - 1].name} is now stationed on site.`);
}
export function disband(S, id) { S.mtf = S.mtf.filter(u => u.id !== id); return okr('Unit reassigned to another site.'); }

// Find chambers for anything waiting in provisional containment (strongest threats first).
export function autoContain(S) {
  const waiting = S.scps.filter(s => s.state === 'provisional').sort((a, b) => tierOf(b) - tierOf(a));
  for (const s of waiting) {
    const free = S.rooms.filter(r => ROOMS[r.type].tier >= tierOf(s) && !scpIn(S, r.id)).sort((a, b) => ROOMS[a.type].tier - ROOMS[b.type].tier);
    if (free.length) { s.room = free[0].id; s.state = 'contained'; note(S, `SCP-${s.id} moved into a ${ROOMS[free[0].type].name}.`, 'good'); }
  }
}
export function freeChamber(S, tier) { return S.rooms.some(r => ROOMS[r.type].tier >= tier && !scpIn(S, r.id)); }

export function transfer(S, uid) {
  const s = scpByUid(S, uid); if (!s) return fail('Unknown anomaly.');
  if (s.state === 'breached') return fail('It is loose. Recontain it first.');
  S.scps = S.scps.filter(x => x !== s); S.approval = clamp(S.approval - 4, 0, 100);
  return okr(`SCP-${s.id} was transferred to another site. The O5 Council noticed.`);
}
export function testScp(S, uid) {
  const s = scpByUid(S, uid); if (!s) return fail('Unknown anomaly.');
  if (s.state !== 'contained') return fail(s.state === 'breached' ? 'It is loose!' : 'It needs a proper chamber first.');
  if (S.used['test' + uid] === S.week) return fail('Already tested this week.');
  if (S.staff.dclass < 1 && def(s).test.death > 0) return fail('No D-Class available for testing.');
  S.used['test' + uid] = S.week; S.stats.tests++;
  const t = def(s).test, gain = Math.round(t.rp * labMult(S) * moraleMult(S) * (0.7 + rnd(S) * 0.6));
  S.rp += gain; S.stats.rpTotal += gain;
  let text = `Test on SCP-${s.id}: +${gain} research.`;
  if (t.death && chance(S, t.death)) { S.staff.dclass--; S.stats.dclassUsed++; S.stats.deaths++; text += ' The D-Class subject did not survive.'; S.morale = clamp(S.morale - 1, 0, 100); }
  if (t.risk) text += ' Containment is under extra strain this week.';
  return okr(text);
}

// first turn of a new posting: the O5 Council sets its goals right away
export function beginPosting(S) { if (!S.quarter) startQuarter(S); S.report = []; return S; }

// ── End Week ─────────────────────────────────────────────────────────────────
export function endWeek(S) {
  if (S.over) return fail('This posting is over.');
  if (S.queue.length) return fail('Deal with the open reports first.');
  S.report = [];
  const startStaff = totalStaff(S);
  // money
  const b = budget(S), u = upkeep(S), w = salaries(S);
  S.funds += b - u - w;
  note(S, `Budget ${b >= 0 ? '+' : ''}$${b}K, upkeep −$${u}K, salaries −$${w}K.`, '');
  if (S.funds < 0) { S.flags.broke++; S.approval = clamp(S.approval - 3, 0, 100); S.morale = clamp(S.morale - 3, 0, 100); note(S, `The site is over budget (${S.flags.broke}/4 weeks). The O5 Council is losing patience.`, 'bad'); }
  else S.flags.broke = 0;
  // research
  const rp = rpRate(S); S.rp += rp; S.stats.rpTotal += rp;
  if (S.quarter) S.quarter.rp += rp;
  // housing
  const crowded = ['researcher', 'guard', 'dclass'].filter(k => housed(S, k) > capacity(S, k));
  if (crowded.length) { S.morale = clamp(S.morale - 4, 0, 100); note(S, 'Staff are sleeping in corridors: not enough housing.', 'bad'); }
  // anomalies at rest
  weeklyAnomalies(S);
  // active breaches get worse
  for (const s of S.scps.filter(x => x.state === 'breached')) breachTick(S, s);
  // new breaches
  for (const s of S.scps.filter(x => x.state !== 'breached')) if (chance(S, breachChance(S, s))) startBreach(S, s);
  // repairs & recovery
  const spare = Math.max(0, S.staff.engineer - roomsOf(S, 'gen').length);
  let fix = spare * 0.25;
  for (const r of S.rooms.filter(x => x.dmg > 0).sort((a, b) => b.dmg - a.dmg)) { const d = Math.min(r.dmg, fix); r.dmg = Math.round((r.dmg - d) * 100) / 100; fix -= d; if (fix <= 0) break; }
  for (const m of S.mtf) m.hp = Math.min(100, m.hp + (roomsOf(S, 'medbay').length ? 20 : 10));
  // drifts
  S.morale = clamp(S.morale + (moraleTarget(S) - S.morale) * (has(S, 'psych') ? 0.22 : 0.15), 0, 100);
  const amn = roomsOf(S, 'amnestics').length * (has(S, 'amnC') ? 4.5 : 3);
  const creep = S.scps.reduce((a, s) => a + ({ Safe: 0.15, Euclid: 0.35, Keter: 0.6 })[def(s).cls], 0);   // the more you hold, the more leaks
  S.exposure = clamp(S.exposure - 1 - amn + creep, 0, 100);
  const breached = S.scps.filter(x => x.state === 'breached').length;
  const expect = 10 + S.week * 0.6;
  S.approval = clamp(S.approval + (50 - S.approval) * 0.06 + (rp >= expect ? 1 : -1.5) + roomsOf(S, 'admin').length * 0.5 - (S.exposure > 40 ? 1.5 : 0) - breached * 2, 0, 100);
  S.stats.peakExposure = Math.max(S.stats.peakExposure, S.exposure);
  // the week's news
  drawEvents(S);
  if (S.week % 13 === 0) quarterReview(S);
  if (startStaff !== totalStaff(S)) { /* losses already reported */ }
  S.hist.push({ w: S.week, f: Math.round(S.funds), a: Math.round(S.approval), e: Math.round(S.exposure), m: Math.round(S.morale), rp: S.rp });
  S.week++;
  if (!S.quarter || S.week % 13 === 1) startQuarter(S);
  autoContain(S);
  checkOver(S);
  if (!S.over && S.week > YEAR && !S.endless) S.over = { won: true, reason: 'You kept the site standing for a full year. The O5 Council has reviewed your tenure.' };
  save(S);
  return okr('Week complete.');
}

function weeklyAnomalies(S) {
  for (const s of S.scps.filter(x => x.state !== 'breached')) {
    switch (s.id) {
      case '173': if (s.state === 'contained' && S.staff.dclass > 0 && chance(S, 0.06)) { S.staff.dclass--; S.stats.deaths++; note(S, 'A D-Class cleaning crew blinked at the same time near SCP-173. One of them did not walk out.', 'bad'); } break;
      case '012': if (S.staff.dclass > 0) break; if (chance(S, 0.2) && S.staff.researcher > 0) { S.staff.researcher--; S.stats.deaths++; S.morale = clamp(S.morale - 4, 0, 100); note(S, 'With no D-Class to occupy it, SCP-012 drew in a researcher. They tried to finish the composition.', 'bad'); } break;
      case '035': if (chance(S, 0.07) && S.staff.researcher > 0) { S.staff.researcher--; S.rp += 15; S.stats.deaths++; note(S, 'A researcher was talked into putting on SCP-035. The host lasted four days. The notes they left were extraordinary (+15 research).', 'bad'); } break;
      case '079': if (!has(S, 'airgap') && chance(S, 0.12)) {
        if (chance(S, 0.5)) { S.flags.blackout = S.week + 1; note(S, 'SCP-079 got into the power grid. Expect a blackout next week (generators at half output).', 'bad'); }
        else { const other = S.scps.filter(x => x.state === 'contained' && x.id !== '079' && def(x).breach > 0); if (other.length) { const o = pick(S, other); note(S, `SCP-079 opened the doors of SCP-${o.id}'s chamber.`, 'bad'); startBreach(S, o); } }
      } break;
    }
  }
}

export function startBreach(S, s) {
  if (s.state === 'breached') return;
  s.state = 'breached'; s.breachWeeks = 0; S.stats.breaches++;
  if (S.quarter) S.quarter.breaches++;
  queue(S, 'breach', { uid: s.uid });
}
function breachTick(S, s) {
  const d = def(s);
  s.breachWeeks++;
  if (S.quarter && s.breachWeeks >= 2) S.quarter.longBreach = true;
  const zone = s.room ? roomById(S, s.room)?.zone : 'lcz';
  const sealed = s.sealed === S.week - 1;
  const n = Math.max(0, Math.round(int(S, 1, d.danger) * (sealed ? 0.4 : 1) * D(S).threat * (has(S, 'drills') ? 0.75 : 1)));
  const c = casualties(S, n, ['dclass', 'guard', 'researcher', 'engineer', 'medic']);
  if (s.id === '049' && c.dead) note(S, `${c.dead} of SCP-049's victims got back up as its "cured" instances.`, 'bad');
  S.exposure = clamp(S.exposure + d.danger * 0.6 * (sealed ? 0.4 : 1), 0, 100);
  S.approval = clamp(S.approval - d.danger * 0.4, 0, 100);
  S.morale = clamp(S.morale - 3, 0, 100);
  const room = s.room && roomById(S, s.room); if (room) room.dmg = Math.min(1, room.dmg + 0.2);
  for (const r of S.rooms.filter(x => x.zone === zone && chance(S, 0.12))) r.dmg = Math.min(1, r.dmg + 0.25);
  note(S, `SCP-${s.id} is still loose in the ${ZONES[zone].name} (week ${s.breachWeeks}). ${c.text ? cap(c.text) + '.' : 'No casualties this week.'}`, 'bad');
  // breaches spread
  if (chance(S, 0.12 + d.danger * 0.01)) {
    const near = S.scps.filter(x => x.state !== 'breached' && x.room && roomById(S, x.room)?.zone === zone && def(x).breach > 0);
    if (near.length) { const o = pick(S, near); note(S, `The chaos let SCP-${o.id} slip out too.`, 'bad'); startBreach(S, o); }
  }
  queue(S, 'breach', { uid: s.uid });
}
const cap = s => s[0].toUpperCase() + s.slice(1);

export function recontain(S, s, how) {
  s.state = s.room ? 'contained' : 'provisional'; s.breachWeeks = 0; S.stats.recontained++;
  S.approval = clamp(S.approval + 2, 0, 100);
  return `SCP-${s.id} was recontained${how ? ' ' + how : ''}.`;
}

export function checkOver(S) {
  if (S.over) return S.over;
  const loose = S.scps.filter(s => s.state === 'breached');
  const keterLong = loose.find(s => def(s).cls === 'Keter' && s.breachWeeks >= 3);
  const lizard = loose.find(s => s.id === '682' && s.breachWeeks >= 2);
  let reason = null;
  if (S.approval <= 0) reason = 'The O5 Council has lost all confidence in you. You have been relieved of command, and your memories of this posting will be removed.';
  else if (S.exposure >= 100) reason = 'The Veil has fallen. Footage from your site is on every screen in the world. The Foundation will clean this up, without you.';
  else if (S.flags.broke >= 4) reason = 'Four weeks over budget. The O5 Council has frozen your accounts and replaced you with someone who can count.';
  else if (loose.length >= 3) reason = `Three anomalies are loose at once. The site is overrun, and Command has authorized the on-site warhead. ${S.site} no longer exists.`;
  else if (lizard) reason = 'SCP-682 has been loose for two weeks and is adapting faster than you can respond. The O5 Council has ordered the site sealed and destroyed.';
  else if (keterLong) reason = `SCP-${keterLong.id} has been loose for three weeks. The surrounding area is lost and so is your site.`;
  else if (S.staff.researcher + S.staff.engineer + S.staff.medic + S.staff.guard === 0) reason = 'There is no one left to run the site.';
  if (reason) S.over = { won: false, reason };
  return S.over;
}

// end-of-posting evaluation
export function grade(S) {
  const score = S.approval * 1.2 + Math.min(60, S.stats.rpTotal / 40) + S.scps.length * 4 - S.stats.deaths * 0.4 - S.stats.peakExposure * 0.3 + (S.over?.won ? 30 : 0);
  const g = score >= 150 ? 'S' : score >= 120 ? 'A' : score >= 95 ? 'B' : score >= 70 ? 'C' : score >= 45 ? 'D' : 'F';
  return { score: Math.round(score), grade: g };
}
