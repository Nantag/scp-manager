// Everything that interrupts your week: breaches, recoveries, raids, good news, bad news and O5 reviews.
// An event: { id, kind, weight, when(S), setup(S) → ctx | null, title(S,c), text(S,c), choices(S,c) → [{ label, hint, need(S,c) → '' | why-not, run(S,c) → result text }] }
import { clamp, chance, int, pick, weighted, money, rnd } from './util.js';
import { SCPS, ROOMS, ZONES, CLASS_TIER, MTF, GOI, STAFF } from './data.js';
import { addScp } from './state.js';
import {
  D, has, note, def, tierOf, roomById, scpByUid, security, readyMtf, mtfPower, casualties, recontain, autoContain,
  freeChamber, checkOver, roomsOf, armoryMult, startBreach,
} from './sim.js';

const fx = (S, o) => {
  if (o.funds) S.funds += o.funds;
  for (const k of ['approval', 'exposure', 'morale']) if (o[k]) S[k] = clamp(S[k] + o[k], 0, 100);
  if (o.rp) { S.rp += o.rp; S.stats.rpTotal += o.rp; }
};
const sign = (n, unit = '') => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}${unit}`;
const fmtFx = o => [o.funds && `${o.funds > 0 ? '+' : '−'}${money(Math.abs(o.funds))}`, o.rp && `${sign(o.rp)} research`, o.approval && `approval ${sign(o.approval)}`, o.exposure && `exposure ${sign(o.exposure)}`, o.morale && `morale ${sign(o.morale)}`].filter(Boolean).join(', ');
const apply = (S, o, text) => { fx(S, o); const f = fmtFx(o); return f ? `${text} (${f})` : text; };

export const EVENTS = [];
const ev = e => EVENTS.push({ weight: 1, kind: 'bad', ...e });
export const eventDef = id => EVENTS.find(e => e.id === id);

export function queue(S, id, ctx = {}) { S.queue.push({ id, ctx }); }
export function pending(S) {
  while (S.queue.length) {
    const q = S.queue[0], e = eventDef(q.id);
    try {
      if (!e || (q.ctx.uid && !scpByUid(S, q.ctx.uid))) throw 0;
      if (e.id === 'breach' && scpByUid(S, q.ctx.uid).state !== 'breached') throw 0;
      const choices = (typeof e.choices === 'function' ? e.choices(S, q.ctx) : e.choices).map(c => ({ ...c, why: c.need ? c.need(S, q.ctx) : '' }));
      return { e, ctx: q.ctx, title: e.title(S, q.ctx), text: e.text(S, q.ctx), choices };
    } catch { S.queue.shift(); }
  }
  return null;
}
export function resolve(S, idx) {
  const p = pending(S); if (!p) return null;
  const c = p.choices[idx]; if (!c || c.why) return { error: c?.why || 'Not possible.' };
  S.queue.shift();
  const result = c.run(S, p.ctx) || '';
  S.log.push({ week: S.week, text: `${p.title}: ${c.label}. ${result}`, kind: p.e.kind === 'good' ? 'good' : p.e.kind === 'breach' || p.e.kind === 'bad' ? 'bad' : '' });
  autoContain(S); checkOver(S);
  return { result, title: p.title, choice: c.label };
}

// ── drawing the week's events ────────────────────────────────────────────────
export function drawEvents(S) {
  const n = 1 + (chance(S, 0.45) ? 1 : 0);
  S.recent ||= [];
  for (let i = 0; i < n; i++) {
    const pool = EVENTS.filter(e => e.weight && !S.recent.includes(e.id) && (!e.when || e.when(S)));
    const e = weighted(S, pool, x => (typeof x.weight === 'function' ? x.weight(S) : x.weight)); if (!e) break;
    const ctx = e.setup ? e.setup(S) : {}; if (ctx === null) continue;
    queue(S, e.id, ctx);
    S.recent.push(e.id); if (S.recent.length > 8) S.recent.shift();
  }
}

// ── breaches ─────────────────────────────────────────────────────────────────
const threat = (S, s) => Math.max(5, def(s).danger * 10 * D(S).threat);
const zoneOf = (S, s) => (s.room ? roomById(S, s.room)?.zone : null) || 'lcz';
const odds = (power, th, k = 1.2) => clamp(power / (power + th) * k, 0.05, 0.95);
export const lockdownOdds = (S, s) => clamp(odds(security(S, zoneOf(S, s)), threat(S, s)) + (has(S, 'drills') ? 0.1 : 0) + (s.id === '682' && has(S, 'acid') ? 0.1 : 0), 0.05, 0.95);
export const mtfOdds = (S, s) => odds(readyMtf(S).reduce((a, u) => a + mtfPower(S, u), 0) + security(S, zoneOf(S, s)) * 0.5, threat(S, s), 1.35);

ev({
  id: 'breach', kind: 'breach', weight: 0,
  title: (S, c) => `⚠️ Containment breach: SCP-${scpByUid(S, c.uid).id}`,
  text: (S, c) => {
    const s = scpByUid(S, c.uid), d = def(s), z = ZONES[zoneOf(S, s)].name;
    if (!d.danger) return `SCP-${s.id} (${d.name}) has wandered out of its chamber in the ${z}. It does not seem to mean any harm.`;
    return s.breachWeeks ? `SCP-${s.id} (${d.name}) is still loose in the ${z}: week ${s.breachWeeks + 1}. ${d.cls === 'Keter' ? 'If it stays out much longer, the site is lost.' : 'Every week it stays out costs lives and exposure.'}`
      : `Alarms across the ${z}. SCP-${s.id} (${d.name}) has breached containment.`;
  },
  choices: (S, c) => {
    const s = scpByUid(S, c.uid), d = def(s), list = [];
    if (!d.danger) return [{ label: 'Coax it back inside', hint: 'Nobody gets hurt.', run: S => apply(S, { morale: s.id === '999' ? 6 : 1 }, recontain(S, s, s.id === '999' ? 'after a very happy tour of the cafeteria' : 'without incident')) }];
    const lp = lockdownOdds(S, s);
    list.push({ label: 'Lockdown and security sweep', hint: `${Math.round(lp * 100)}% to recontain · security ${security(S, zoneOf(S, s))} vs threat ${Math.round(threat(S, s))}`, run: S => {
      if (chance(S, lp)) { const cz = casualties(S, int(S, 0, Math.ceil(d.danger / 3)), ['guard', 'dclass']); return recontain(S, s, 'by site security') + (cz.text ? ` ${cz.text}.` : ''); }
      const cz = casualties(S, int(S, 1, d.danger), ['guard', 'dclass', 'researcher']); return `The sweep failed. ${cz.text || 'Nobody died, somehow'}. It is still loose.`;
    } });
    const units = readyMtf(S);
    if (S.mtf.length) list.push({ label: `Send in the MTF (${units.map(u => u.name).join(', ') || 'none ready'})`, hint: units.length ? `${Math.round(mtfOdds(S, s) * 100)}% to recontain` : 'Your units are wounded or already deployed this week.', need: () => (units.length ? '' : 'No MTF unit is ready.'), run: S => {
      const p = mtfOdds(S, s), ok = chance(S, p); let lost = [];
      for (const u of units) { u.busy = S.week; u.hp -= int(S, 5, 12 + d.danger * 4) * (ok ? 0.6 : 1); if (u.hp <= 0) lost.push(u); }
      S.mtf = S.mtf.filter(u => !lost.includes(u));
      const lostTxt = lost.length ? ` ${lost.map(u => u.name).join(', ')} ${lost.length > 1 ? 'were' : 'was'} wiped out.` : '';
      return (ok ? recontain(S, s, 'by the Mobile Task Force') : 'The MTF was pushed back. It is still loose.') + lostTxt;
    } });
    // anomaly-specific procedures
    if (s.id === '106') list.push(has(S, 'femur')
      ? { label: 'Procedure 106 "Femur Breaker"', hint: '95% to recontain. Costs one D-Class.', need: S => (S.staff.dclass ? '' : 'No D-Class available.'), run: S => { S.staff.dclass--; S.stats.dclassUsed++; S.stats.deaths++; S.morale = clamp(S.morale - 4, 0, 100); return chance(S, 0.95) ? recontain(S, s, 'after it followed the screams back to its chamber') + ' Nobody who heard it will forget the sound.' : 'Even the femur breaker did not draw it back this time.'; } }
      : { label: 'Procedure 106 "Femur Breaker"', hint: 'Research it first.', need: () => 'Research Procedure 106 first.', run: () => '' });
    if (s.id === '096') list.push({ label: 'Let it reach its target', hint: 'It always stops once it has killed whoever saw its face. Costly, loud and public.', run: S => { const cz = casualties(S, int(S, 1, 3), ['researcher', 'guard', 'dclass']); fx(S, { exposure: 8, approval: -3 }); return recontain(S, s, 'once it was done') + ` ${cz.text || 'Its target was alone'}. It was seen by civilians on its way (exposure +8).`; } });
    if (s.id === '173') list.push({ label: 'Blink protocol (3 D-Class)', hint: '85% to recontain. Teams keep it in sight while they push it home.', need: S => (S.staff.dclass >= 3 ? '' : 'Needs 3 D-Class.'), run: S => { const dead = int(S, 0, 2); S.staff.dclass -= dead; S.stats.deaths += dead; S.stats.dclassUsed += dead; return chance(S, 0.85) ? recontain(S, s, 'by a team that did not blink') + (dead ? ` ${dead} D-Class did.` : '') : `Someone blinked. ${dead} D-Class lost and it is still loose.`; } });
    if (s.id === '035') list.push({ label: 'Isolate the host', hint: '75% to recontain. The host will not survive.', run: S => { S.stats.deaths++; if (S.staff.researcher > 0) S.staff.researcher--; return chance(S, 0.75) ? recontain(S, s, 'and the mask was pried off its host') : 'The host talked its way past the guards. It is still loose.'; } });
    list.push({ label: 'Seal the zone and wait', hint: 'No attempt this week: fewer casualties, but it stays loose.', run: S => { s.sealed = S.week; return 'Blast doors down. Everyone on the wrong side is on their own.'; } });
    return list;
  },
});

// ── recoveries ───────────────────────────────────────────────────────────────
const RECOVERY = {
  '131': 'Two little cyclopean creatures followed a field agent home from a scrapyard. They seem to want to stay.',
  '294': 'A coffee vending machine in a university staff room has been serving drinks that should not exist.',
  '500': 'A small plastic box of red pills turned up in a hospital raid. One cured a terminal patient overnight.',
  '173': 'A concrete statue found at the scene of several deaths. The police officers who brought it in kept staring at it.',
  '096': 'A very tall, pale figure has been sitting in a remote valley, weeping. Recovery teams have been told not to look up.',
  '012': 'An unfinished musical score was recovered from an archaeological dig. Two of the archaeologists are dead.',
  '049': 'A man in a plague doctor\'s outfit walked into a rural clinic offering to "cure" everyone. He surrendered politely.',
  '079': 'An old Exidy Sorcerer computer in a university lab has been rewriting its own code and threatening the staff.',
  '939': 'Hikers keep disappearing in a cave system after hearing voices calling for help. A recovery team has cornered the things inside.',
  '035': 'A porcelain comedy mask was seized from an estate sale. Its last three owners died by their own hand.',
  '106': 'An old man who walks through walls has been leaving corroded footprints through a city\'s sewers. MTF has him cornered.',
  '682': 'A massive reptile has torn through a coastal town. After three days of fighting, it has finally been subdued. For now.',
};
ev({
  id: 'recovery', kind: 'acq',
  weight: S => 2.4 + (S.scps.filter(s => s.state === 'provisional').length ? -1.2 : 0),
  setup: S => {
    const owned = new Set(S.scps.map(s => s.id));
    const cands = Object.keys(RECOVERY).filter(id => !owned.has(id) && !(S.flags.gone || []).includes(id));
    if (!cands.length) return null;
    const w = id => { const t = CLASS_TIER[SCPS[id].cls]; return t === 1 ? 3 : t === 2 ? (S.week > 3 ? 2.5 : 0.6) : (S.week > 8 ? 1.4 + S.week / 30 : 0); };
    const id = weighted(S, cands, w); return id ? { id } : null;
  },
  title: (S, c) => `📦 Recovery: SCP-${c.id}`,
  text: (S, c) => { const d = SCPS[c.id], t = CLASS_TIER[d.cls]; return `${RECOVERY[c.id]}\n\nClass: ${d.cls}. ${freeChamber(S, t) ? 'You have a suitable chamber free.' : `You have no free ${t === 3 ? 'Maximum' : t === 2 ? 'Reinforced (or better)' : ''} chamber: it would sit in provisional containment (4× breach risk) until you build one.`}`; },
  choices: (S, c) => {
    const d = SCPS[c.id], t = CLASS_TIER[d.cls];
    const take = extra => S => { addScp(S, c.id); S.stats.acquired++; if (S.quarter) S.quarter.acquired++; autoContain(S); return apply(S, { approval: t * 2, rp: t * 8, ...extra }, `SCP-${c.id} is now in your care.`); };
    const list = [{ label: 'Contain it here', hint: `Approval +${t * 2}, research +${t * 8}.`, run: take({}) }];
    if (t === 3) list.push({ label: 'Contain it, but demand extra funding', hint: '+$400K, approval only +2.', run: S => { addScp(S, c.id); S.stats.acquired++; if (S.quarter) S.quarter.acquired++; autoContain(S); return apply(S, { funds: 400, approval: 2, rp: 24 }, `SCP-${c.id} arrived with a budget supplement.`); } });
    list.push({ label: 'Transfer it to another site', hint: 'Approval −2.', run: S => { (S.flags.gone ||= []).push(c.id); return apply(S, { approval: -2 }, 'Another site took it. The O5 Council expected more of you.'); } });
    return list;
  },
});

// ── groups of interest ───────────────────────────────────────────────────────
const defense = S => Math.round(S.staff.guard * 1.5 * armoryMult(S) + roomsOf(S, 'checkpoint').length * 8 + (has(S, 'autodef') ? 25 : 0) + (has(S, 'intel') ? 15 : 0) + (S.flags.intel > S.week ? 20 : 0));
const raidStr = (S, base) => Math.round(base * (0.8 + S.week / 40) * D(S).raid);
const raidOdds = (S, base, mtf = false) => odds(defense(S) + (mtf ? readyMtf(S).reduce((a, u) => a + mtfPower(S, u), 0) : 0), raidStr(S, base));
const useMtf = (S, won) => { for (const u of readyMtf(S)) { u.busy = S.week; u.hp -= int(S, 5, won ? 20 : 40); } const lost = S.mtf.filter(u => u.hp <= 0); S.mtf = S.mtf.filter(u => u.hp > 0); return lost.length ? ` ${lost.map(u => u.name).join(', ')} did not come back.` : ''; };
const raidChoices = (S, base, onLose, extra = []) => {
  const list = [{ label: 'Fight them off', hint: `${Math.round(raidOdds(S, base) * 100)}% · defense ${defense(S)} vs ${raidStr(S, base)}`, run: S => { S.stats.raids++; if (chance(S, raidOdds(S, base))) { S.stats.raidsWon++; const cz = casualties(S, int(S, 0, 2), ['guard']); return apply(S, { approval: 3 }, `Raid repelled.${cz.text ? ' ' + cz.text + '.' : ''}`); } const cz = casualties(S, int(S, 2, 5), ['guard', 'dclass', 'researcher']); return `The raiders broke through. ${cz.text}. ${onLose(S)}`; } }];
  if (readyMtf(S).length) list.push({ label: 'Fight them off with the MTF', hint: `${Math.round(raidOdds(S, base, true) * 100)}%`, run: S => { S.stats.raids++; const p = raidOdds(S, base, true); if (chance(S, p)) { S.stats.raidsWon++; return apply(S, { approval: 4 }, 'The MTF crushed the raid.' + useMtf(S, true)); } const t = useMtf(S, false), cz = casualties(S, int(S, 1, 4), ['guard', 'dclass']); return `Even the MTF could not hold them.${t} ${cz.text}. ${onLose(S)}`; } });
  return [...list, ...extra];
};
const stealable = S => S.scps.filter(s => s.state === 'contained');
const loseScp = (S, s, how) => { S.scps = S.scps.filter(x => x !== s); S.stats.lost++; (S.flags.gone ||= []).push(s.id); fx(S, { approval: -8 - tierOf(s) * 2, exposure: 4 }); return `SCP-${s.id} ${how}. (approval −${8 + tierOf(s) * 2}, exposure +4)`; };

ev({ id: 'ci_raid', kind: 'goi', weight: S => (S.week > 4 ? 1.1 : 0) * D(S).raid, setup: S => { const t = stealable(S); return t.length ? { uid: pick(S, t).uid } : null; },
  title: () => `${GOI.ci.icon} Chaos Insurgency raid`, text: (S, c) => `Armed Insurgency operatives are hitting the site${S.flags.intel > S.week ? ' (your informant warned you: defenses are ready)' : ''}. Their target: SCP-${scpByUid(S, c.uid).id}.`,
  choices: (S, c) => raidChoices(S, 45, S => loseScp(S, scpByUid(S, c.uid), 'was taken by the Insurgency'), [{ label: 'Let them have it', hint: 'Nobody dies. You lose the anomaly.', run: S => loseScp(S, scpByUid(S, c.uid), 'was handed over without a fight') }]) });
ev({ id: 'sh_raid', kind: 'goi', weight: S => (S.week > 6 ? 0.8 : 0) * D(S).raid, setup: S => { const t = S.scps.filter(s => s.state === 'contained' && def(s).breach > 0); return t.length ? { uid: pick(S, t).uid } : null; },
  title: () => `${GOI.sh.icon} The Serpent's Hand`, text: (S, c) => `Serpent's Hand agents slipped through a "way" into the site. They want to free SCP-${scpByUid(S, c.uid).id}: in their eyes, it is a prisoner.`,
  choices: (S, c) => raidChoices(S, 35, S => { startBreach(S, scpByUid(S, c.uid)); return `They opened SCP-${scpByUid(S, c.uid).id}'s chamber on the way out.`; }) });
ev({ id: 'goc_demand', kind: 'goi', weight: S => (S.scps.some(s => ['682', '049', '106', '939'].includes(s.id)) ? 1 : 0), setup: S => { const t = S.scps.filter(s => ['682', '049', '106', '939'].includes(s.id)); return t.length ? { uid: pick(S, t).uid } : null; },
  title: () => `${GOI.goc.icon} Global Occult Coalition`, text: (S, c) => `The GOC has learned you hold SCP-${scpByUid(S, c.uid).id}. They demand it be handed over for destruction, and they have a strike team nearby to make the point.`,
  choices: (S, c) => [
    { label: 'Hand it over', hint: 'The O5 Council will be furious.', run: S => loseScp(S, scpByUid(S, c.uid), 'was handed to the GOC for "decommissioning"') },
    { label: 'Refuse', hint: '50%: they back down. Otherwise, an airstrike on your perimeter.', run: S => { if (chance(S, 0.5)) return apply(S, { approval: 3 }, 'They blinked first.'); const cz = casualties(S, int(S, 1, 4), ['guard', 'engineer']); for (const r of S.rooms.filter(() => chance(S, 0.2))) r.dmg = Math.min(1, r.dmg + 0.4); return apply(S, { approval: 1, exposure: 6 }, `A "gas leak" took out part of the site. ${cz.text}.`); } },
    { label: 'Share research data instead', hint: 'Costs 60 research.', need: S => (S.rp >= 60 ? '' : 'Needs 60 research.'), run: S => apply(S, { rp: -60, approval: 1 }, 'The GOC took the data and left, unhappy but satisfied.') },
  ] });
ev({ id: 'mcd_offer', kind: 'goi', weight: S => (S.scps.some(s => def(s).cls === 'Safe') ? 0.7 : 0), setup: S => { const t = S.scps.filter(s => def(s).cls === 'Safe' && s.state === 'contained'); return t.length ? { uid: pick(S, t).uid } : null; },
  title: () => `${GOI.mcd.icon} Marshall, Carter & Dark`, text: (S, c) => `A very polite man from MC&D Ltd. has a very discreet offer: $1.5M for SCP-${scpByUid(S, c.uid).id}, no questions asked.`,
  choices: (S, c) => [
    { label: 'Sell it', hint: '+$1.5M. 40% the O5 Council finds out.', run: S => { const s = scpByUid(S, c.uid); S.scps = S.scps.filter(x => x !== s); (S.flags.gone ||= []).push(s.id); fx(S, { funds: 1500 }); return chance(S, 0.4) ? apply(S, { approval: -18 }, 'The O5 Council found out.') : 'The money arrived. Nobody needs to know.'; } },
    { label: 'Decline', hint: 'Approval +1.', run: S => apply(S, { approval: 1 }, 'He tipped his hat and left a business card.') },
    { label: 'Report him to the O5 Council', hint: 'Approval +4, but MC&D will remember.', run: S => { S.flags.mcdAngry = true; return apply(S, { approval: 4 }, 'An Ethics Committee commendation is on its way.'); } },
  ] });
ev({ id: 'cotbg', kind: 'goi', weight: S => (S.week > 5 ? 0.7 : 0) * D(S).raid,
  title: () => `${GOI.cotbg.icon} Church of the Broken God`, text: S => `Cultists with clockwork implants are trying to break in${S.scps.some(s => s.id === '914') ? ' to "free the holy machine", SCP-914' : ' to scavenge parts from your generators'}.`,
  choices: S => raidChoices(S, 35, S => { const g = S.scps.find(s => s.id === '914'); if (g) return loseScp(S, g, 'was dismantled and carried off piece by piece'); const r = S.rooms.find(x => x.type === 'gen'); if (r) r.dmg = 1; return 'They gutted one of your generators.'; }) });
ev({ id: 'awcy', kind: 'goi', weight: 0.7,
  title: () => `${GOI.awcy.icon} Are We Cool Yet?`, text: () => 'An anomalous art collective left an "installation" in the town near the site: a sculpture that sings the site\'s coordinates.',
  choices: [
    { label: 'Clean it up quietly', hint: '−$120K.', run: S => apply(S, { funds: -120, exposure: 1 }, 'Gone before the press noticed.') },
    { label: 'Ignore it', hint: 'Exposure +8.', run: S => apply(S, { exposure: 8 }, 'Tourists are taking selfies with it.') },
    { label: 'Study it first', hint: '+30 research, exposure +4.', run: S => apply(S, { rp: 30, exposure: 4 }, 'Fascinating, and loud.') },
  ] });
ev({ id: 'infiltrator', kind: 'goi', weight: S => (S.week > 3 ? 0.8 : 0),
  title: () => '🕵️ Infiltrator suspected', text: S => `Security thinks someone on staff is passing information to the Chaos Insurgency.${has(S, 'intel') ? ' Your counter-intelligence team already has a name.' : ''}`,
  choices: S => [
    { label: 'Launch an investigation', hint: has(S, 'intel') ? 'Certain to catch them.' : '−$100K, 65% to catch them.', run: S => { if (!has(S, 'intel')) fx(S, { funds: -100 }); if (has(S, 'intel') || chance(S, 0.65)) { S.staff.researcher = Math.max(0, S.staff.researcher - 1); S.flags.intel = S.week + 6; return apply(S, { approval: 3 }, 'Caught: a researcher on the Insurgency payroll. They talked, and you know their next moves (raid defense +20 for 6 weeks).'); } return apply(S, { morale: -4 }, 'Weeks of interviews, no result. Everyone feels watched.'); } },
    { label: 'Feed them false information', hint: '50%: an Insurgency cell walks into a trap.', run: S => chance(S, 0.5) ? apply(S, { approval: 6, rp: 20 }, 'The Insurgency hit a decoy warehouse. MTF was waiting.') : apply(S, { exposure: 4 }, 'They figured it out.') },
    { label: 'Ignore it', run: S => { S.flags.intel = 0; return 'You have bigger problems. Probably.'; } },
  ] });

// ── good news ────────────────────────────────────────────────────────────────
const good = e => ev({ kind: 'good', ...e });
good({ id: 'grant', weight: 1, title: () => '💰 Budget supplement', text: () => 'The O5 Council liked your last report. An extra budget line has been approved.', choices: [{ label: 'Excellent', run: S => apply(S, { funds: 300 + S.week * 6 }, 'Funds received.') }] });
good({ id: 'recruits', weight: 1, title: () => '🎓 Promising recruits', text: () => 'A batch of brilliant graduates passed the Foundation\'s screening. They could start here this week.',
  choices: [{ label: 'Take two researchers', hint: 'Free, if you have room in Staff Quarters.', need: S => (S.staff.researcher + S.staff.engineer + S.staff.medic + 2 <= roomsOf(S, 'quarters').length * 8 ? '' : 'No room in Staff Quarters.'), run: S => { S.staff.researcher += 2; return 'Two eager new researchers arrived.'; } },
    { label: 'Take an engineer and a medic', need: S => (S.staff.researcher + S.staff.engineer + S.staff.medic + 2 <= roomsOf(S, 'quarters').length * 8 ? '' : 'No room in Staff Quarters.'), run: S => { S.staff.engineer++; S.staff.medic++; return 'Welcome aboard.'; } },
    { label: 'Pass them to another site', run: S => apply(S, { approval: 1 }, 'Site-19 sends its thanks.') }] });
good({ id: 'breakthrough', weight: 1, when: S => S.scps.length > 0, setup: S => ({ uid: pick(S, S.scps).uid }), title: (S, c) => `🔬 Breakthrough on SCP-${scpByUid(S, c.uid).id}`, text: (S, c) => `A late-night idea about SCP-${scpByUid(S, c.uid).id} turned out to be right. The whole lab is buzzing.`, choices: (S, c) => [{ label: 'Publish internally', run: S => apply(S, { rp: 25 + def(scpByUid(S, c.uid)).rp * 3, approval: 2 }, 'The paper is circulating among the Site Directors.') }] });
good({ id: 'commendation', weight: S => (S.approval > 55 ? 0.8 : 0.3), title: () => '🎖️ O5 commendation', text: () => 'An O5 Council member singled out your site as "a model of containment discipline".', choices: [{ label: 'Celebrate with the staff', run: S => apply(S, { approval: 4, morale: 8 }, 'Cake in the break room.') }, { label: 'Ask for funding instead', run: S => apply(S, { approval: 2, funds: 250 }, 'They appreciated the directness.') }] });
good({ id: 'dshipment', weight: 0.8, title: () => '🟠 D-Class transfer', text: () => 'A prison transfer program has a surplus of D-Class personnel. Cheap.', choices: [{ label: 'Take 5 ($20K)', need: S => (S.staff.dclass + 5 <= roomsOf(S, 'dblock').length * 12 ? (S.funds >= 20 ? '' : 'Not enough funds.') : 'No room in the D-Class Blocks.'), run: S => { S.staff.dclass += 5; return apply(S, { funds: -20 }, 'Five new orange jumpsuits.'); } }, { label: 'Decline', run: () => 'Maybe next time.' }] });
good({ id: '999visit', weight: S => (S.scps.some(s => s.id === '999' && s.state === 'contained') ? 0.8 : 0), title: () => '🟠 SCP-999 escaped… to the break room', text: () => 'SCP-999 got out again and is going desk to desk hugging people. Nobody is hurrying to put it back.', choices: [{ label: 'Let it finish its rounds', run: S => apply(S, { morale: 12 }, 'Morale has never been higher.') }] });
good({ id: 'cooperation', weight: 0.6, title: () => '🤝 Inter-site cooperation', text: () => 'Site-19 is sharing data from a joint project.', choices: [{ label: 'Accept the research', run: S => apply(S, { rp: 45 }, 'Forty pages of excellent data.') }, { label: 'Ask them to lend MTF support', hint: 'Heals your MTF units fully.', need: S => (S.mtf.length ? '' : 'You have no MTF units.'), run: S => { S.mtf.forEach(u => { u.hp = 100; }); return 'Their medics patched up your teams.'; } }] });
good({ id: 'defector', weight: S => (S.week > 6 ? 0.5 : 0), title: () => '🏳️ Insurgency defector', text: () => 'A Chaos Insurgency operative walked up to your gate with their hands raised. They want protection, and they know things.', choices: [{ label: 'Debrief them', run: S => { S.flags.intel = S.week + 8; return apply(S, { rp: 20 }, 'Raid defense +20 for 8 weeks.'); } }, { label: 'Hand them to Internal Security', run: S => apply(S, { approval: 3 }, 'Procedure followed.') }] });
good({ id: 'quietweek', weight: 0.8, title: () => '😌 A quiet week', text: () => 'No alarms. No incidents. Someone brought donuts.', choices: [{ label: 'Enjoy it while it lasts', run: S => apply(S, { morale: 5 }, 'Bliss.') }] });
good({ id: 'publicity', weight: S => (S.exposure > 25 ? 0.9 : 0), title: () => '📰 Cover story holds', text: () => 'Your cover story ("chemical plant accident") is all over the news, and the public believed it.', choices: [{ label: 'Good work, everyone', run: S => apply(S, { exposure: -10 }, 'The Veil holds.') }] });
good({ id: 'oldtech', weight: 0.5, title: () => '📦 Decommissioned equipment', text: () => 'A closing site is giving away containment equipment.', choices: [{ label: 'Repair our damaged rooms with it', run: S => { S.rooms.forEach(r => { r.dmg = 0; }); return 'Every damaged room is good as new.'; } }, { label: 'Sell it on', run: S => apply(S, { funds: 220 }, 'Sold.') }] });

// ── bad news ─────────────────────────────────────────────────────────────────
ev({ id: 'budgetcut', weight: 0.9, title: () => '📉 Budget review', text: () => 'The O5 Council is trimming costs across all sites.', choices: [{ label: 'Accept the cut', run: S => apply(S, { funds: -200 - S.week * 4 }, 'The accountants are smiling. Nobody else is.') }, { label: 'Argue your case', hint: '50%: no cut and approval +3. Otherwise a bigger cut and approval −4.', run: S => chance(S, 0.5) ? apply(S, { approval: 3 }, 'They agreed: your site stays fully funded.') : apply(S, { funds: -320 - S.week * 4, approval: -4 }, 'That went badly.') }] });
ev({ id: 'riot', weight: S => (S.staff.dclass > 6 ? 1 : 0), title: () => '🟠 D-Class riot', text: () => 'The D-Class blocks have erupted. Someone overheard what monthly termination means.', choices: [
  { label: 'Security response', hint: 'Uses your guards.', run: S => { const p = clamp(S.staff.guard / (S.staff.guard + S.staff.dclass * 0.6), 0.2, 0.9); if (chance(S, p)) { const cz = casualties(S, int(S, 0, 2), ['dclass']); return `Order restored.${cz.text ? ' ' + cz.text + '.' : ''}`; } const cz = casualties(S, int(S, 1, 3), ['guard', 'dclass']); S.staff.dclass = Math.max(0, S.staff.dclass - int(S, 1, 3)); return apply(S, { exposure: 3 }, `It got ugly, and a few escaped into the woods. ${cz.text}.`); } },
  { label: 'Promise better conditions', hint: '−$100K.', run: S => apply(S, { funds: -100, morale: 2 }, 'Better food, real mattresses. They calmed down.') },
] });
ev({ id: 'leak', weight: 1, title: () => '📸 Leak', text: S => `Photos taken inside ${S.site} have appeared on an anonymous forum.`, choices: S => [
  { label: 'Scrub the internet', hint: `−${money(has(S, 'amnC') ? 90 : 150)}.`, run: S => apply(S, { funds: has(S, 'amnC') ? -90 : -150, exposure: 2 }, 'Mostly gone.') },
  { label: 'Discredit them as fakes', hint: '60%: it works. Otherwise exposure +12.', run: S => chance(S, 0.6) ? apply(S, { exposure: 1 }, 'Everyone thinks it is a horror game marketing campaign.') : apply(S, { exposure: 12 }, 'People are not buying it.') },
  { label: 'Ignore it', run: S => apply(S, { exposure: 7 }, 'It spread.') },
] });
ev({ id: 'photo096', weight: S => (S.scps.some(s => s.id === '096' && s.state === 'contained') ? 1.2 : 0), setup: S => ({ uid: S.scps.find(s => s.id === '096').uid }), title: () => '🙈 A photo of SCP-096', text: () => 'A blurry tourist photo of a remote valley has gone viral. In the background, unmistakably, is SCP-096\'s face. Thousands have seen it.',
  choices: [
    { label: 'Emergency takedown and amnestics', hint: '−$300K, 75% it works in time.', need: S => (S.funds >= 300 ? '' : 'Not enough funds.'), run: (S, c) => { fx(S, { funds: -300 }); if (chance(S, has(S, 'amnC') ? 0.9 : 0.75)) return apply(S, { exposure: 3 }, 'Every copy was found. SCP-096 never stirred.'); startBreach(S, scpByUid(S, c.uid)); return 'Too late: one copy got through. SCP-096 is screaming.'; } },
    { label: 'Hope nobody looks closely', run: (S, c) => { if (chance(S, 0.35)) return 'Somehow, it blew over.'; startBreach(S, scpByUid(S, c.uid)); return 'Someone looked closely. SCP-096 is screaming.'; } },
  ] });
ev({ id: 'quake', weight: 0.5, title: () => '🌋 Earthquake', text: () => 'A tremor rolled through the region. The site held, mostly.', choices: [{ label: 'Damage report', run: S => { const hit = S.rooms.filter(() => chance(S, 0.25)); hit.forEach(r => { r.dmg = Math.min(1, r.dmg + 0.35); }); return `${hit.length} rooms damaged. Engineers will repair them over time, or pay to fix them now.`; } }] });
ev({ id: 'burnout', weight: S => (S.morale < 50 ? 1.4 : 0.3), title: () => '😩 Burnout', text: () => 'Your staff are exhausted. Two senior researchers asked for transfers.', choices: [
  { label: 'Let them go', run: S => { S.staff.researcher = Math.max(0, S.staff.researcher - 2); return 'They are gone.'; } },
  { label: 'Give everyone a week off', hint: '−$150K, no research this week from tests.', run: S => apply(S, { funds: -150, morale: 15 }, 'They came back human.') },
  { label: 'Order them to stay', run: S => apply(S, { morale: -8 }, 'They stayed. They are not happy about it.') },
] });
ev({ id: 'audit', weight: 0.6, title: () => '⚖️ Ethics Committee audit', text: S => `The Ethics Committee wants to review ${S.stats.dclassUsed > 6 ? 'how many D-Class have died in your tests' : 'your testing records'}.`, choices: [
  { label: 'Full cooperation', run: S => S.stats.dclassUsed > 6 ? apply(S, { approval: -5, morale: 2 }, 'They were not pleased. New restrictions, but you are still in charge.') : apply(S, { approval: 3 }, 'A clean report.') },
  { label: 'Clean up the paperwork first', hint: '70% it works.', run: S => chance(S, 0.7) ? 'Nothing to see here.' : apply(S, { approval: -10 }, 'They noticed the shredder.') },
] });
ev({ id: 'powerfail', weight: S => (S.rooms.some(r => r.type === 'gen') ? 0.7 : 0), title: () => '⚡ Generator failure', text: () => 'A generator coolant line burst.', choices: [{ label: 'Emergency repair ($120K)', need: S => (S.funds >= 120 ? '' : 'Not enough funds.'), run: S => apply(S, { funds: -120 }, 'Back online within hours.') }, { label: 'Let engineers handle it', run: S => { const g = S.rooms.find(r => r.type === 'gen'); g.dmg = Math.min(1, g.dmg + 0.6); S.flags.blackout = S.week + 1; return 'Blackout expected next week (generators at half output).'; } }] });
ev({ id: 'journalist', weight: S => (S.exposure > 15 ? 0.9 : 0.3), title: () => '🗞️ Nosy journalist', text: () => 'A local journalist has been photographing your perimeter fence from the woods.', choices: [
  { label: 'Class-A amnestics', hint: '−$60K.', run: S => apply(S, { funds: -60, exposure: -2 }, 'They remember a lovely hike.') },
  { label: 'Offer them a job', hint: 'They could be useful.', run: S => chance(S, 0.6) ? apply(S, { exposure: -4, approval: 1 }, 'They took it. Your new PR officer.') : apply(S, { exposure: 6 }, 'They published the offer.') },
  { label: 'Ignore them', run: S => apply(S, { exposure: 5 }, 'The article was "a mysterious facility in the woods".') },
] });

// ── quarterly O5 review ──────────────────────────────────────────────────────
export const GOALS = [
  { id: 'rp', text: q => `Produce at least ${q.target} research`, setup: S => ({ target: 90 + Math.floor(S.week / 13) * 70 }), check: (S, q) => q.rp >= q.target },
  { id: 'acquire', text: () => 'Bring in at least 2 new anomalies', check: (S, q) => q.acquired >= 2 },
  { id: 'exposure', text: () => 'Keep public exposure under 30', check: S => S.exposure < 30 },
  { id: 'morale', text: () => 'Keep morale above 55', check: S => S.morale > 55 },
  { id: 'nolong', text: () => 'Never let a breach last more than a week', check: (S, q) => !q.longBreach },
  { id: 'mtf', text: () => 'Have at least one MTF unit stationed', check: S => S.mtf.length > 0, when: S => S.week >= 12 },
  { id: 'funds', text: () => 'Hold at least $1M in the bank', check: S => S.funds >= 1000 },
  { id: 'safe', text: () => 'Lose fewer than 10 personnel', check: (S, q) => S.stats.deaths - q.deaths0 < 10 },
];
export function startQuarter(S) {
  const pool = GOALS.filter(g => !g.when || g.when(S));
  const a = pick(S, pool), b = pick(S, pool.filter(g => g !== a));
  S.quarter = { n: Math.ceil(S.week / 13), rp: 0, acquired: 0, breaches: 0, longBreach: false, deaths0: S.stats.deaths, goals: [a, b].map(g => ({ id: g.id, ...(g.setup ? g.setup(S) : {}) })) };
  note(S, `New quarter. The O5 Council expects: ${S.quarter.goals.map(g => goalText(g)).join('; ')}.`, '');
}
export const goalText = g => GOALS.find(x => x.id === g.id).text(g);
export const goalMet = (S, g) => GOALS.find(x => x.id === g.id).check(S, { ...S.quarter, ...g });
export function quarterReview(S) {
  if (!S.quarter) return;
  const res = S.quarter.goals.map(g => ({ g, ok: goalMet(S, g) }));
  queue(S, 'review', { res: res.map(r => ({ text: goalText(r.g), ok: r.ok })) });
}
ev({ id: 'review', kind: 'review', weight: 0,
  title: () => '🏛️ Quarterly O5 review',
  text: (S, c) => c.res.map(r => `${r.ok ? '✅' : '❌'} ${r.text}`).join('\n'),
  choices: (S, c) => [{ label: 'Accept the verdict', run: S => {
    const won = c.res.filter(r => r.ok).length;
    const o = won === 2 ? { approval: 10, funds: 350 } : won === 1 ? { approval: 0, funds: 100 } : { approval: -15 };
    return apply(S, o, won === 2 ? 'Outstanding. The Council is impressed.' : won === 1 ? 'Adequate.' : 'The Council is deeply disappointed.');
  } }],
});

// ── anomaly actions (from the Anomalies screen) ──────────────────────────────
export const SPECIAL = {
  '999': { label: '🤗 Visit it', run: S => { S.morale = clamp(S.morale + 7, 0, 100); return 'Twenty minutes with SCP-999. Everyone came back smiling (morale +7).'; } },
  '079': { label: '💬 Interrogate', run: S => { const g = 25; S.rp += g; S.stats.rpTotal += g; if (!has(S, 'airgap') && chance(S, 0.3)) { S.flags.blackout = S.week + 1; return `It answered, spitefully (+${g} research). Then it got into the grid: blackout next week.`; } return `It answered, spitefully (+${g} research).`; } },
  '914': { label: '⚙️ Refine equipment', event: true },
  '500': { label: '💊 Pills left', info: S => `${S.flags.pills} of 47` },
};
export function special(S, uid) {
  const s = scpByUid(S, uid); const sp = SPECIAL[s?.id];
  if (!sp || sp.info) return { ok: false, msg: 'Nothing to do.' };
  if (s.state !== 'contained') return { ok: false, msg: 'Not while it is loose or unhoused.' };
  if (S.used['sp' + uid] === S.week) return { ok: false, msg: 'Once a week.' };
  if (s.id === '914' && S.flags.jam914 > S.week) return { ok: false, msg: `SCP-914 is jammed until week ${S.flags.jam914}.` };
  S.used['sp' + uid] = S.week;
  if (sp.event) { queue(S, 'refine914', { uid }); return { ok: true, msg: '', opened: true }; }
  return { ok: true, msg: sp.run(S) };
}
const cal = S => (has(S, 'calib') ? 0.15 : 0);
ev({ id: 'refine914', kind: 'action', weight: 0, title: () => '⚙️ SCP-914', text: () => 'You load $120K of surplus equipment into the intake booth. Which setting?',
  choices: [
    { label: 'Rough', hint: 'Breaks it down: research from the pieces.', need: S => (S.funds >= 120 ? '' : 'Not enough funds.'), run: S => apply(S, { funds: -120, rp: 22 }, 'A neat pile of components. Instructive.') },
    { label: '1:1', hint: 'Something different of similar value.', need: S => (S.funds >= 120 ? '' : 'Not enough funds.'), run: S => apply(S, { funds: -120 + int(S, 60, 240) }, 'Different equipment came out.') },
    { label: 'Fine', hint: 'Usually better. Sometimes strange.', need: S => (S.funds >= 120 ? '' : 'Not enough funds.'), run: S => { fx(S, { funds: -120 }); const r = rnd(S); if (r < 0.45 + cal(S)) return apply(S, { funds: 380 }, 'Beautifully improved equipment.'); if (r < 0.85) return apply(S, { rp: 45 }, 'Impossible alloys. The lab is thrilled.'); const cz = casualties(S, 1, ['researcher', 'engineer']); return `Something with too many joints came out. ${cz.text || 'Everyone got clear in time'}.`; } },
    { label: 'Very Fine', hint: 'A miracle, or a disaster.', need: S => (S.funds >= 120 ? '' : 'Not enough funds.'), run: S => { fx(S, { funds: -120 }); const r = rnd(S); if (r < 0.3 + cal(S)) return pick(S, [() => apply(S, { rp: 150 }, 'A device nobody understands but everyone wants to study.'), () => apply(S, { funds: 1000 }, 'Equipment so advanced another site paid a fortune for it.'), () => { S.rooms.forEach(r => { r.dmg = 0; }); return apply(S, { morale: 12 }, 'A self-repairing nanite paste. Every room on site is like new.'); }])(); if (r < 0.75) return 'It came out as a fine grey powder. Nothing else.'; S.flags.jam914 = S.week + 3; const cz = casualties(S, int(S, 1, 2), ['researcher', 'engineer']); return `The output was alive and angry. ${cz.text || 'Everyone survived'}. SCP-914 is jammed for 3 weeks.`; } },
    { label: 'Cancel', run: S => { delete S.used['sp' + S.scps.find(s => s.id === '914').uid]; return 'Maybe later.'; } },
  ] });
