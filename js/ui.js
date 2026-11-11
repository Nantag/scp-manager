// Rendering and input. Everything is redrawn from S after each action (it is small enough).
import { esc, money, pct, plural } from './util.js';
import { ZONES, ROOMS, STAFF, MTF, SCPS, TECH, DIFFICULTY, CLASS_TIER, EXPAND_COST } from './data.js';
import { newGame, load, save, wipe, exportCode, importCode, YEAR } from './state.js';
import * as G from './sim.js';
import { pending, resolve, special, SPECIAL, goalText, goalMet, lockdownOdds } from './events.js';

let S = load();
const ui = { tab: 'overview', modal: null, diff: 'euclid', site: '', confirm: null };
const app = document.getElementById('app'), modalEl = document.getElementById('modal'), card = document.getElementById('modal-card');
const $ = s => document.querySelector(s);

export function toast(msg, kind = '') {
  if (!msg) return;
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
}
const run = (r, after) => { if (!r) return; if (!r.ok) toast(r.msg, 'bad'); else { if (r.msg) toast(r.msg, 'good'); after?.(); } save(S); render(); };

// ── title ────────────────────────────────────────────────────────────────────
function titleScreen() {
  const saved = load();
  return `<div class="title">
    <div class="seal">SECURE · CONTAIN · PROTECT</div>
    <h1>Site Director</h1>
    <p class="lead">The O5 Council has given you a containment site, a budget and one year. Build it, staff it, study what you hold, and keep it all locked away. Things will escape. Groups of Interest will come knocking. The public must never find out.</p>
    ${saved && !saved.over ? `<h3>Current posting</h3><div class="panel"><b>${esc(saved.site)}</b> · week ${saved.week} of ${YEAR} · ${DIFFICULTY[saved.diff].name}<div class="btns" style="margin-top:.6rem"><button class="btn primary" data-a="continue">Continue</button></div></div>` : ''}
    <h3>New posting</h3>
    <div class="form-row"><input id="sitename" maxlength="24" placeholder="Site name (optional, e.g. Site-64)" value="${esc(ui.site)}" data-a="sitename" style="flex:1;min-width:200px"></div>
    <div class="diffs">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="diff ${k} ${ui.diff === k ? 'on' : ''}" data-a="diff" data-k="${k}"><b>${d.name}</b><span class="small muted">${d.desc}</span></button>`).join('')}</div>
    <div class="btns"><button class="btn primary" data-a="start">Take command</button>${saved ? '' : ''}</div>
    <h3>Load a save code</h3>
    <div class="form-row"><input id="importcode" placeholder="Paste a save code" style="flex:1;min-width:200px"><button class="btn" data-a="import">Load</button></div>
    <div class="credits">
      <b>How to play.</b> Each turn is one week. Build rooms in your three zones, hire staff, run tests on your anomalies and spend research on upgrades, then press <b>End Week</b>. Reports and emergencies will need your decision. Survive ${YEAR} weeks without losing the O5 Council's confidence, the public's ignorance, your budget or the site itself.<br><br>
      Based on the <a href="https://scp-wiki.wikidot.com/" target="_blank" rel="noopener">SCP Foundation</a> wiki. SCP Foundation content is licensed under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>; this game is shared under the same licence. All descriptions here are written for the game.
    </div>
  </div>`;
}

// ── game shell ───────────────────────────────────────────────────────────────
const TABS = [['overview', '📋 Overview'], ['site', '🏗️ Site'], ['anomalies', '🗃️ Anomalies'], ['staff', '👥 Personnel'], ['research', '🔬 Research'], ['log', '📜 Log']];
function chips() {
  const n = G.net(S), p = G.power(S), lvl = (v, lo, mid, inv) => (inv ? (v >= lo ? 'low' : v >= mid ? 'mid' : '') : (v <= lo ? 'low' : v <= mid ? 'mid' : ''));
  return `<div class="res">
    <span class="chip ${S.funds < 0 ? 'low' : ''}" title="Funds (weekly net)">💰 <b>${money(S.funds)}</b><span class="${n < 0 ? 'bad' : 'muted'}">${n >= 0 ? '+' : ''}${money(n)}/wk</span></span>
    <span class="chip ${lvl(S.approval, 20, 40)}" title="O5 Council approval: at 0 you are relieved of command">🏛️ <b>${Math.round(S.approval)}</b>approval</span>
    <span class="chip ${lvl(S.exposure, 75, 45, true)}" title="Public exposure: at 100 the Veil collapses">👁️ <b>${Math.round(S.exposure)}</b>exposure</span>
    <span class="chip ${lvl(S.morale, 30, 50)}" title="Staff morale">🙂 <b>${Math.round(S.morale)}</b>morale</span>
    <span class="chip ${p.deficit > 0 ? 'low' : ''}" title="Power supply / demand">⚡ <b>${Math.round(p.supply)}/${p.demand}</b>MW</span>
    <span class="chip" title="Research points (per week)">🔬 <b>${Math.round(S.rp)}</b><span class="muted">+${G.rpRate(S)}/wk</span></span>
  </div>`;
}
function gameScreen() {
  const al = alerts(), loose = S.scps.filter(s => s.state === 'breached').length, open = S.queue.length;
  const body = { overview, site: siteTab, anomalies: anomaliesTab, staff: staffTab, research: researchTab, log: logTab }[ui.tab]();
  return `<div class="top">
    <div class="top-row"><span class="site-name">🔒 ${esc(S.site)}</span><span class="week">WEEK ${S.week}${S.endless ? '' : ' / ' + YEAR}</span><span class="spacer"></span><button class="btn small" data-a="settings">⚙️</button></div>
    ${chips()}
    <div class="tabs">${TABS.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}${(k === 'anomalies' && loose) || (k === 'overview' && al.some(a => a.kind === 'bad')) ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
  </div>
  <main>${body}</main>
  <div class="footer"><div class="footer-in">
    <span class="small muted">${loose ? `<span class="bad">⚠️ ${plural(loose, 'anomaly', 'anomalies')} loose</span>` : 'All anomalies contained'}</span>
    ${open ? `<button class="btn primary end reports" data-a="openEvent">Open reports (${open})</button>` : `<button class="btn primary end" data-a="endWeek">End Week ▶</button>`}
  </div></div>`;
}

// things the Director should know right now
function alerts() {
  const out = [], p = G.power(S);
  for (const s of S.scps.filter(x => x.state === 'breached')) out.push({ kind: 'bad', text: `SCP-${s.id} is loose${s.breachWeeks ? ` (week ${s.breachWeeks + 1})` : ''}.`, tab: 'anomalies' });
  for (const s of S.scps.filter(x => x.state === 'provisional')) out.push({ kind: 'bad', text: `SCP-${s.id} is in provisional containment (4× breach risk). Build a ${CLASS_TIER[G.def(s).cls] === 3 ? 'Maximum Chamber in Heavy Containment' : CLASS_TIER[G.def(s).cls] === 2 ? 'Reinforced Chamber' : 'Standard Chamber'}.`, tab: 'site' });
  if (S.funds < 0) out.push({ kind: 'bad', text: `Over budget: week ${S.flags.broke} of 4 before the O5 Council replaces you.`, tab: 'staff' });
  else if (G.net(S) < 0) out.push({ kind: 'warn', text: `You are losing ${money(-G.net(S))} a week.`, tab: 'staff' });
  if (p.deficit > 0) out.push({ kind: 'bad', text: `Power deficit (${Math.round(p.supply)}/${p.demand} MW): breach risk up, research down. Build a Generator or hire engineers.`, tab: 'site' });
  if (S.staff.engineer < G.roomsOf(S, 'gen').length) out.push({ kind: 'warn', text: 'Some generators have no engineer and run at half output.', tab: 'staff' });
  for (const k of ['researcher', 'guard', 'dclass']) if (G.housed(S, k) > G.capacity(S, k)) out.push({ kind: 'warn', text: `Not enough housing for ${k === 'researcher' ? 'staff' : STAFF[k].name.toLowerCase()}: morale is dropping.`, tab: 'site' });
  if (S.staff.researcher < Math.ceil(S.scps.length * 1.5)) out.push({ kind: 'warn', text: `Understaffed research: ${S.staff.researcher} researchers for ${S.scps.length} anomalies (1.5 each for full output).`, tab: 'staff' });
  if (S.exposure >= 60) out.push({ kind: 'bad', text: 'Public exposure is dangerously high.', tab: 'research' });
  if (S.approval <= 25) out.push({ kind: 'bad', text: 'The O5 Council is close to removing you.', tab: 'overview' });
  if (S.morale < 35) out.push({ kind: 'warn', text: 'Morale is low: people make mistakes, breaches get likelier.', tab: 'site' });
  if (S.scps.some(s => s.id === '079') && !G.has(S, 'airgap')) out.push({ kind: 'warn', text: 'SCP-079 can reach your network. Research the Air-gapped Network.', tab: 'research' });
  if (S.scps.some(s => s.id === '106') && !G.has(S, 'femur')) out.push({ kind: 'warn', text: 'You hold SCP-106 without Procedure "Femur Breaker".', tab: 'research' });
  return out;
}

function overview() {
  const al = alerts(), q = S.quarter;
  return `<div class="cols"><div>
    <h3 style="margin-top:0">Situation</h3>
    <div class="alerts">${al.length ? al.map(a => `<div class="alert ${a.kind}"><span>${a.kind === 'bad' ? '🔴' : '🟡'}</span><span>${a.text}</span><button class="btn small go" data-a="tab" data-k="${a.tab}">Go</button></div>`).join('') : '<div class="alert good"><span>🟢</span><span>Nothing urgent. A rare and beautiful thing.</span></div>'}</div>
    <h3>Last week</h3>
    <div class="panel report">${S.report.length ? S.report.map(r => `<p class="${r.kind}">${esc(r.text)}</p>`).join('') : '<p class="muted">Your first week. Look around, build, hire, then press End Week.</p>'}</div>
  </div><div>
    ${q ? `<h3 style="margin-top:0">O5 review in ${13 - ((S.week - 1) % 13)} week${13 - ((S.week - 1) % 13) === 1 ? '' : 's'}</h3><div class="panel">${q.goals.map(g => `<div class="goal"><span>${goalMet(S, g) ? '✅' : '⬜'}</span><span>${esc(goalText(g))}${g.id === 'rp' ? ` <span class="muted small">(${q.rp}/${g.target})</span>` : g.id === 'acquire' ? ` <span class="muted small">(${q.acquired}/2)</span>` : ''}</span></div>`).join('')}<p class="small muted" style="margin-top:.4rem">Both: approval +10 and +$350K. One: +$100K. None: approval −15.</p></div>` : ''}
    <h3>Site at a glance</h3>
    <div class="kv">
      <div><span>Weekly budget</span><b>${money(G.budget(S))}</b></div>
      <div><span>Upkeep + salaries</span><b>${money(G.upkeep(S) + G.salaries(S))}</b></div>
      <div><span>Anomalies</span><b>${S.scps.length}</b></div>
      <div><span>Personnel</span><b>${G.totalStaff(S)}</b></div>
      <div><span>Security (LCZ / HCZ)</span><b>${G.security(S, 'lcz')} / ${G.security(S, 'hcz')}</b></div>
      <div><span>MTF units</span><b>${S.mtf.length}</b></div>
      <div><span>Deaths so far</span><b>${S.stats.deaths}</b></div>
      <div><span>Breaches so far</span><b>${S.stats.breaches}</b></div>
    </div>
  </div></div>`;
}

function siteTab() {
  return Object.entries(ZONES).map(([z, Z]) => {
    const rooms = S.rooms.filter(r => r.zone === z), free = G.slotsIn(S, z) - rooms.length;
    const canExp = G.slotsIn(S, z) < Z.max;
    return `<div class="zone"><div class="zone-head"><h2>${Z.icon} ${Z.name}</h2><span class="muted">${rooms.length}/${G.slotsIn(S, z)} rooms</span><span class="spacer"></span>${canExp ? `<button class="btn small" data-a="expand" data-z="${z}">Expand (${money(EXPAND_COST(S.slots[z] || 0))})</button>` : ''}</div>
      <div class="slots">${rooms.map(roomTile).join('')}${Array.from({ length: free }, () => `<button class="slot empty" data-a="buildMenu" data-z="${z}">＋ Build</button>`).join('')}</div></div>`;
  }).join('') + `<p class="small muted">Tap a room for details, repairs or demolition. Euclid anomalies need a Reinforced Chamber, Keter ones a Maximum Chamber (Heavy Containment only). A stronger chamber than needed lowers breach risk.</p>`;
}
function roomTile(r) {
  const d = ROOMS[r.type], s = G.scpIn(S, r.id);
  return `<button class="slot ${s && s.state === 'breached' ? 'breach' : ''}" data-a="room" data-id="${r.id}">
    <span class="ic">${d.icon}</span><span class="nm">${d.name}</span>
    ${d.tier ? (s ? `<span class="occ" style="color:var(--${G.def(s).cls.toLowerCase()})">${G.def(s).icon} SCP-${s.id}${s.state === 'breached' ? ' · LOOSE' : ''}</span>` : '<span class="occ muted">empty</span>') : ''}
    ${r.dmg ? `<span class="dmg"><i style="width:${Math.round(r.dmg * 100)}%"></i></span>` : ''}
  </button>`;
}

function anomaliesTab() {
  if (!S.scps.length) return '<p class="muted">You hold no anomalies. Recoveries will come to you.</p>';
  const order = { breached: 0, provisional: 1, contained: 2 };
  return `<div class="grid">${S.scps.slice().sort((a, b) => order[a.state] - order[b.state]).map(s => {
    const d = G.def(s), r = s.room && G.roomById(S, s.room), sp = SPECIAL[s.id];
    const status = s.state === 'breached' ? `<span class="status bad">● Loose${s.breachWeeks ? ` · week ${s.breachWeeks + 1}` : ''}</span>` : s.state === 'provisional' ? '<span class="status warn">● Provisional</span>' : '<span class="status good">● Contained</span>';
    const tested = S.used['test' + s.uid] === S.week, usedSp = S.used['sp' + s.uid] === S.week;
    return `<div class="dossier ${s.state === 'breached' ? 'breach' : ''}">
      <div class="head"><span class="icon">${d.icon}</span><div><div class="id">SCP-${s.id}</div><div class="nick">${d.name}</div></div><span class="spacer"></span><span class="badge ${d.cls}">${d.cls}</span></div>
      <div>${status} <span class="small muted">· ${r ? `${ROOMS[r.type].name}, ${ZONES[r.zone].short}` : 'no chamber'}</span></div>
      <div class="small">${esc(d.desc)}</div>
      <div class="perk">${esc(d.perk)}</div>
      <div class="stats"><span>Breach risk <b class="${G.breachChance(S, s) > 0.08 ? 'bad' : ''}">${s.state === 'breached' ? '—' : pct(G.breachChance(S, s))}</b>/wk</span><span>Research <b>+${d.rp}</b>/wk</span><span>Upkeep <b>${money(G.SCP_UPKEEP[d.cls])}</b>/wk</span>${s.state === 'breached' && d.danger ? `<span>Lockdown odds <b>${pct(lockdownOdds(S, s))}</b></span>` : ''}</div>
      <div class="btns">
        ${s.state === 'contained' ? `<button class="btn small" data-a="test" data-id="${s.uid}" ${tested ? 'disabled' : ''} title="Uses a D-Class subject">${tested ? 'Tested this week' : `🧪 Test (~${Math.round(d.test.rp * G.labMult(S))} research${d.test.death ? `, ${pct(d.test.death)} D-Class death` : ''})`}</button>` : ''}
        ${sp && sp.info ? `<span class="small muted">${sp.label}: ${sp.info(S)}</span>` : sp && s.state === 'contained' ? `<button class="btn small" data-a="special" data-id="${s.uid}" ${usedSp ? 'disabled' : ''}>${sp.label}</button>` : ''}
        ${s.state !== 'breached' ? `<button class="btn small danger" data-a="transfer" data-id="${s.uid}">${ui.confirm === 'tr' + s.uid ? 'Tap again to transfer' : 'Transfer away'}</button>` : `<button class="btn small danger" data-a="openEvent">Handle the breach</button>`}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function staffTab() {
  const need = { researcher: `${Math.ceil(S.scps.length * 1.5)} needed for full research`, engineer: `${G.roomsOf(S, 'gen').length} run the generators, the rest repair damage`, medic: `${G.roomsOf(S, 'medbay').length} medbay${G.roomsOf(S, 'medbay').length === 1 ? '' : 's'} to staff`, guard: `security ${G.security(S, 'lcz')} in LCZ`, dclass: 'used in tests and procedures' };
  const rows = Object.entries(STAFF).map(([k, st]) => `<div class="staff-row"><span class="ic">${st.icon}</span><span class="nm"><b>${st.name}</b><span class="small muted">${need[k]}</span></span><span class="count">${S.staff[k]}</span><span class="small muted">${k === 'researcher' || k === 'engineer' || k === 'medic' ? `housing ${G.housed(S, k)}/${G.capacity(S, k)}` : `housing ${G.housed(S, k)}/${G.capacity(S, k)}`} · ${money(st.salary)}/wk each</span><span class="spacer"></span>
    <div class="btns"><button class="btn small" data-a="hire" data-k="${k}" data-n="1">Hire ${money(st.hire)}</button><button class="btn small" data-a="hire" data-k="${k}" data-n="5">+5</button><button class="btn small danger" data-a="dismiss" data-k="${k}">−1</button></div></div>`).join('');
  const units = S.mtf.map(u => `<div class="unit"><span>${MTF[u.type].icon}</span><b>${u.name}</b><span class="small muted">${MTF[u.type].name}</span><div class="bar" style="width:120px"><i style="width:${u.hp}%;background:${u.hp < 30 ? 'var(--bad)' : 'var(--good)'}"></i></div><span class="small mono">${Math.round(u.hp)}%</span><span class="spacer"></span><button class="btn small danger" data-a="disband" data-id="${u.id}">Reassign</button></div>`).join('') || '<p class="muted small">No Mobile Task Force on site. Research one, build an Armory, then form a unit.</p>';
  const forms = Object.entries(MTF).map(([k, m]) => `<button class="btn small" data-a="formMtf" data-k="${k}" ${G.has(S, m.tech) ? '' : 'disabled'} title="${G.has(S, m.tech) ? '' : 'Research ' + TECH[m.tech].name}">${m.icon} ${m.short} (${money(m.cost)}, ${money(m.upkeep)}/wk, strength ${m.power})</button>`).join('');
  return `<div class="panel">${rows}</div>
    <h3>Mobile Task Forces <span class="muted">(${S.mtf.length}/${G.mtfCap(S)}: 2 per Armory)</span></h3><div class="panel">${units}<div class="btns" style="margin-top:.6rem">${forms}</div></div>
    <h3>Weekly costs</h3><div class="kv"><div><span>Budget</span><b>${money(G.budget(S))}</b></div><div><span>Salaries</span><b>${money(G.salaries(S))}</b></div><div><span>Rooms, MTF & anomalies</span><b>${money(G.upkeep(S))}</b></div><div><span>Net</span><b class="${G.net(S) < 0 ? 'bad' : 'good'}">${money(G.net(S))}</b></div></div>`;
}

function researchTab() {
  return `<p class="muted" style="margin-bottom:.7rem">${Math.round(S.rp)} research available · +${G.rpRate(S)} per week from your anomalies (tests give more).</p>
    <div class="grid">${Object.entries(TECH).map(([k, t]) => {
      const done = G.has(S, k), why = G.canResearch(S, k), locked = t.req && !G.has(S, t.req);
      return `<div class="tech ${done ? 'done' : locked ? 'locked' : ''}"><span class="t">${t.icon} ${t.name}</span><span class="small muted">${t.desc}</span>${t.req ? `<span class="small muted">Requires ${TECH[t.req].name}</span>` : ''}
        <div class="btns" style="align-items:center"><span class="c">${done ? '✓ Researched' : t.rp + ' research'}</span><span class="spacer"></span>${done ? '' : `<button class="btn small ${why ? '' : 'primary'}" data-a="research" data-k="${k}" ${why ? 'disabled' : ''}>Research</button>`}</div></div>`;
    }).join('')}</div>`;
}
function logTab() {
  return `<div class="panel log">${S.log.slice().reverse().slice(0, 250).map(l => `<p class="${l.kind}"><span class="w">W${l.week}</span><span>${esc(l.text)}</span></p>`).join('') || '<p class="muted">Nothing yet.</p>'}</div>`;
}

// ── end screens ──────────────────────────────────────────────────────────────
function overScreen() {
  const g = G.grade(S), st = S.stats;
  return `<div class="over">
    <div class="classified">${S.over.won ? 'POSTING COMPLETE' : 'POSTING TERMINATED'}</div>
    <h1>${S.over.won ? 'You made it.' : 'It is over.'}</h1>
    <p>${esc(S.over.reason)}</p>
    <div class="grade" style="color:${g.grade === 'S' || g.grade === 'A' ? 'var(--good)' : g.grade === 'F' ? 'var(--bad)' : 'var(--warn)'}">${g.grade}</div>
    <p class="muted">Site evaluation · score ${g.score}${g.capped ? ' · a terminated posting is graded C at best' : ''}</p>
    <div class="kv">
      <div><span>Weeks served</span><b>${Math.min(S.week - 1, S.week)}</b></div><div><span>Final approval</span><b>${Math.round(S.approval)}</b></div>
      <div><span>Anomalies held</span><b>${S.scps.length}</b></div><div><span>Recovered</span><b>${st.acquired}</b></div>
      <div><span>Research produced</span><b>${Math.round(st.rpTotal)}</b></div><div><span>Breaches</span><b>${st.breaches}</b></div>
      <div><span>Personnel lost</span><b>${st.deaths}</b></div><div><span>Saved by medical</span><b>${st.saved}</b></div>
      <div><span>Raids repelled</span><b>${st.raidsWon}/${st.raids}</b></div><div><span>Peak exposure</span><b>${Math.round(st.peakExposure)}</b></div>
    </div>
    <div class="btns" style="justify-content:center">${S.over.won ? '<button class="btn" data-a="endless">Keep going (endless)</button>' : ''}<button class="btn primary" data-a="newPosting">New posting</button></div>
  </div>`;
}

// ── modals ───────────────────────────────────────────────────────────────────
function modalHtml() {
  const m = ui.modal; if (!m) return '';
  if (m.type === 'event') {
    const p = pending(S); if (!p) { ui.modal = null; return ''; }
    const breach = p.e.kind === 'breach';
    return { cls: breach ? 'breach' : '', html: `<div class="classified">${breach ? 'CONTAINMENT BREACH' : p.e.kind === 'goi' ? 'HOSTILE ACTIVITY' : p.e.kind === 'acq' ? 'RECOVERY REPORT' : p.e.kind === 'review' ? 'O5 COUNCIL' : 'SITE REPORT'} · WEEK ${S.week}</div>
      <h2>${esc(p.title)}</h2><div class="body">${esc(p.text)}</div>
      <div class="choices">${p.choices.map((c, i) => `<button class="choice" data-a="choose" data-i="${i}" ${c.why ? 'disabled' : ''}><b>${esc(c.label)}</b>${c.hint || c.why ? `<small>${esc(c.why || c.hint)}</small>` : ''}</button>`).join('')}</div>` };
  }
  if (m.type === 'result') return { html: `<div class="classified">OUTCOME</div><h2>${esc(m.title)}</h2><div class="result">${esc(m.text || 'Done.')}</div><div class="btns" style="justify-content:flex-end"><button class="btn primary" data-a="continue">${S.queue.length ? `Next report (${S.queue.length})` : 'Continue'}</button></div>` };
  if (m.type === 'report') return { html: `<div class="classified">WEEKLY REPORT</div><h2>Week ${S.week - 1} summary</h2><div class="report" style="max-height:45vh;overflow:auto;margin-bottom:.9rem">${S.report.map(r => `<p class="${r.kind}">${esc(r.text)}</p>`).join('')}</div><div class="btns" style="justify-content:flex-end"><button class="btn primary" data-a="continue">${S.queue.length ? `Open reports (${S.queue.length})` : 'Continue'}</button></div>` };
  if (m.type === 'build') {
    const z = m.zone;
    return { html: `<h2>Build in the ${ZONES[z].name}</h2><div class="build-list">${Object.entries(ROOMS).filter(([, r]) => r.zones.includes(z)).map(([k, r]) => { const why = G.canBuild(S, z, k); return `<button class="build-item" data-a="build" data-z="${z}" data-k="${k}" ${why ? 'disabled' : ''}><span class="ic">${r.icon}</span><span><b>${r.name}</b><br><span class="small muted">${r.desc}${why && why !== 'Not enough funds.' ? ' · ' + why : ''}</span></span><span class="cost">${money(r.cost)}<br><span class="muted">${money(r.upkeep)}/wk · ${r.power < 0 ? '+' + -r.power : r.power} MW</span></span></button>`; }).join('')}</div><div class="btns" style="justify-content:flex-end;margin-top:.8rem"><button class="btn" data-a="close">Close</button></div>` };
  }
  if (m.type === 'room') {
    const r = G.roomById(S, m.id); if (!r) { ui.modal = null; return ''; }
    const d = ROOMS[r.type], s = G.scpIn(S, r.id);
    return { html: `<h2>${d.icon} ${d.name}</h2><p class="small muted" style="margin-bottom:.6rem">${ZONES[r.zone].name}</p><p>${d.desc}</p>
      <div class="kv" style="margin:.8rem 0"><div><span>Upkeep</span><b>${money(d.upkeep)}/wk</b></div><div><span>Power</span><b>${d.power < 0 ? '+' + -d.power : d.power} MW</b></div><div><span>Condition</span><b class="${r.dmg ? 'bad' : 'good'}">${Math.round((1 - r.dmg) * 100)}%</b></div>${s ? `<div><span>Contains</span><b>SCP-${s.id}</b></div>` : ''}</div>
      ${r.dmg ? `<p class="small muted">Damage raises breach risk. Spare engineers repair it slowly, or pay now.</p>` : ''}
      <div class="btns" style="justify-content:flex-end;margin-top:.8rem">${r.dmg ? `<button class="btn" data-a="repair" data-id="${r.id}">Repair now (${money(G.repairCost(r))})</button>` : ''}<button class="btn danger" data-a="demolish" data-id="${r.id}">${ui.confirm === 'dm' + r.id ? 'Tap again to demolish' : 'Demolish'}</button><button class="btn" data-a="close">Close</button></div>` };
  }
  if (m.type === 'settings') return { html: `<h2>⚙️ ${esc(S.site)}</h2><p class="small muted">${DIFFICULTY[S.diff].name} difficulty · week ${S.week}</p>
    <h3>Save code</h3><p class="small muted">The game saves automatically in this browser. Copy this code to move it elsewhere.</p><textarea id="savecode" rows="4" style="width:100%" readonly>${exportCode(S)}</textarea>
    <div class="btns" style="margin-top:.5rem"><button class="btn" data-a="copyCode">Copy</button></div>
    <h3>Danger zone</h3><div class="btns"><button class="btn danger" data-a="abandon">${ui.confirm === 'abandon' ? 'Tap again to abandon this posting' : 'Abandon posting'}</button></div>
    <div class="btns" style="justify-content:flex-end;margin-top:1rem"><button class="btn" data-a="close">Close</button></div>` };
  return '';
}

// ── render & input ───────────────────────────────────────────────────────────
export function render() {
  if (S && !ui.modal && S.queue.length && !S.over) ui.modal = { type: 'event' };
  app.innerHTML = !S ? titleScreen() : S.over ? overScreen() : gameScreen();
  const m = S && !S.over ? modalHtml() : '';
  modalEl.hidden = !m;
  if (m) { card.className = `modal-card ${m.cls || ''}`; card.innerHTML = m.html; }
}
const confirmTap = key => { if (ui.confirm === key) { ui.confirm = null; return true; } ui.confirm = key; render(); return false; };

const H = {
  diff: d => { ui.diff = d.k; render(); },
  start: () => { S = G.beginPosting(newGame({ diff: ui.diff, site: $('#sitename')?.value || '' })); ui.tab = 'overview'; ui.modal = null; save(S); render(); },
  continue: () => { if (!S) { S = load(); render(); return; } ui.modal = S.queue.length ? { type: 'event' } : null; render(); },
  import: () => { try { S = importCode($('#importcode').value); save(S); ui.modal = null; render(); toast('Posting loaded.', 'good'); } catch { toast('That is not a valid save code.', 'bad'); } },
  tab: d => { ui.tab = d.k; ui.confirm = null; ui.modal = null; render(); window.scrollTo(0, 0); },
  endWeek: () => { const r = G.endWeek(S); if (!r.ok) return toast(r.msg, 'bad'); ui.modal = S.over ? null : { type: 'report' }; render(); if (S.scps.some(s => s.state === 'breached')) document.body.classList.add('flash'), setTimeout(() => document.body.classList.remove('flash'), 900); },
  openEvent: () => { ui.modal = { type: 'event' }; render(); },
  choose: d => { const r = resolve(S, +d.i); if (r?.error) return toast(r.error, 'bad'); save(S); ui.modal = S.over ? null : { type: 'result', title: r.title, text: r.result }; render(); },
  close: () => { ui.modal = null; ui.confirm = null; render(); },
  buildMenu: d => { ui.modal = { type: 'build', zone: d.z }; render(); },
  build: d => run(G.build(S, d.z, d.k), () => { ui.modal = null; }),
  room: d => { ui.confirm = null; ui.modal = { type: 'room', id: +d.id }; render(); },
  repair: d => run(G.repair(S, +d.id)),
  demolish: d => { if (confirmTap('dm' + d.id)) run(G.demolish(S, +d.id), () => { ui.modal = null; }); },
  expand: d => run(G.expand(S, d.z)),
  hire: d => run(G.hire(S, d.k, +d.n)),
  dismiss: d => run(G.dismiss(S, d.k, 1)),
  formMtf: d => run(G.formMtf(S, d.k)),
  disband: d => run(G.disband(S, +d.id)),
  research: d => run(G.research(S, d.k)),
  test: d => run(G.testScp(S, +d.id)),
  special: d => { const r = special(S, +d.id); if (r.opened) { ui.modal = { type: 'event' }; save(S); render(); return; } run(r); },
  transfer: d => { if (confirmTap('tr' + d.id)) run(G.transfer(S, +d.id)); },
  settings: () => { ui.confirm = null; ui.modal = { type: 'settings' }; render(); },
  copyCode: async () => { try { await navigator.clipboard.writeText($('#savecode').value); toast('Save code copied.', 'good'); } catch { $('#savecode').select(); toast('Select the code and copy it.', ''); } },
  abandon: () => { if (confirmTap('abandon')) { wipe(); S = null; ui.modal = null; render(); } },
  endless: () => { S.over = null; S.endless = true; save(S); render(); },
  newPosting: () => { wipe(); S = null; ui.modal = null; render(); },
  sitename: (d, el) => { ui.site = el.value; },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  if (el.tagName === 'INPUT') return;
  if (el === modalEl) return;
  const fn = H[el.dataset.a]; if (fn) fn(el.dataset, el);
});
document.addEventListener('input', e => { const el = e.target.closest('[data-a="sitename"]'); if (el) H.sitename(el.dataset, el); });
modalEl.addEventListener('click', e => { if (e.target === modalEl && ui.modal && ['build', 'room', 'settings'].includes(ui.modal.type)) { ui.modal = null; render(); } });
