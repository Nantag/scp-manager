// A new posting, and saving it. The whole game is one plain object S.
import { DIFFICULTY } from './data.js';

export const VERSION = 1;
const SAVE_KEY = 'scp-manager-save';
export const YEAR = 52;

let nextId = 1;
const room = (type, zone) => ({ id: nextId++, type, zone, dmg: 0 });

export function newGame({ diff = 'euclid', site = '', seed } = {}) {
  nextId = 1;
  const rooms = [
    room('quarters', 'office'), room('admin', 'office'), room('lab', 'office'), room('gen', 'office'), room('lounge', 'office'),
    room('cont1', 'lcz'), room('cont1', 'lcz'), room('cont2', 'lcz'), room('dblock', 'lcz'), room('barracks', 'lcz'),
    room('gen', 'hcz'), room('cont3', 'hcz'),
  ];
  const S = {
    v: VERSION, seed: seed ?? Math.floor(Math.random() * 2 ** 31), rng: 0,
    diff: DIFFICULTY[diff] ? diff : 'euclid',
    site: (site || '').trim().slice(0, 24) || `Site-${[43, 47, 52, 64, 77, 88, 91][Math.floor(Math.random() * 7)]}`,
    week: 1, endless: false, over: null,
    funds: 1200, approval: 60, exposure: 5, morale: 70, rp: 0,
    staff: { researcher: 5, engineer: 2, medic: 1, guard: 8, dclass: 10 },
    slots: { office: 0, lcz: 0, hcz: 0 },          // extra slots bought per zone
    rooms, nextId,
    scps: [], mtf: [], tech: {},
    queue: [], log: [], report: [],
    used: {},                                       // once-per-week actions
    flags: { broke: 0, pills: 47, intel: 0 },
    quarter: null,
    stats: { breaches: 0, recontained: 0, deaths: 0, saved: 0, tests: 0, dclassUsed: 0, raids: 0, raidsWon: 0, acquired: 0, lost: 0, rpTotal: 0, peakExposure: 5 },
    hist: [],
  };
  S.rng = S.seed | 0;
  // the anomalies you inherit
  addScp(S, '999', rooms[5].id); addScp(S, '914', rooms[6].id); addScp(S, '173', rooms[7].id);
  return S;
}
export function addScp(S, id, roomId = null) {
  const s = { uid: S.nextId++, id, room: roomId, state: roomId ? 'contained' : 'provisional', breachWeeks: 0, since: S.week };
  S.scps.push(s); return s;
}
export const newRoomId = S => S.nextId++;

// ── saving ───────────────────────────────────────────────────────────────────
export function save(S) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch { return false; } }
export function load() { try { const r = localStorage.getItem(SAVE_KEY); return r ? migrate(JSON.parse(r)) : null; } catch { return null; } }
export function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } }
export const exportCode = S => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
export function importCode(code) {
  const S = JSON.parse(decodeURIComponent(escape(atob(String(code).trim()))));
  if (!S || typeof S !== 'object' || !Array.isArray(S.rooms) || !Array.isArray(S.scps)) throw new Error('Not a save code');
  return migrate(S);
}
function migrate(S) {
  const base = newGame({ diff: S.diff, site: S.site, seed: S.seed });
  for (const k of Object.keys(base)) if (S[k] === undefined) S[k] = base[k];
  S.stats = { ...base.stats, ...S.stats }; S.flags = { ...base.flags, ...S.flags };
  for (const k of ['funds', 'approval', 'exposure', 'morale', 'rp']) if (typeof S[k] !== 'number' || !isFinite(S[k])) S[k] = base[k];
  return S;
}
