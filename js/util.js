// Small helpers. All randomness goes through the save's own seeded generator (S.rng),
// so a game is reproducible and the balance bot (tools/sim.mjs) can replay it.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function rnd(S) {                       // mulberry32
  let t = (S.rng = (S.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const chance = (S, p) => rnd(S) < p;
export const int = (S, a, b) => a + Math.floor(rnd(S) * (b - a + 1));
export const pick = (S, arr) => arr[Math.floor(rnd(S) * arr.length)];
export function weighted(S, list, w = x => x.weight ?? 1) {
  const total = list.reduce((a, x) => a + Math.max(0, w(x)), 0);
  if (total <= 0) return null;
  let r = rnd(S) * total;
  for (const x of list) { r -= Math.max(0, w(x)); if (r <= 0) return x; }
  return list[list.length - 1];
}

// money is kept in thousands of dollars: 1250 → "$1.25M"
export function money(k) {
  const neg = k < 0, v = Math.abs(k);
  const s = v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.?0+$/, '')}M` : `$${Math.round(v)}K`;
  return neg ? '−' + s : s;
}
export const pct = p => `${Math.round(p * 100)}%`;
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`;
