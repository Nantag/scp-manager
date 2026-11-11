// Game data. Anomalies are based on the SCP Foundation wiki (scp-wiki.wikidot.com, CC BY-SA 3.0);
// every description here is written fresh for the game.

export const ZONES = {
  office: { name: 'Office Zone', short: 'EZ', icon: '🏢', slots: 6, max: 9 },
  lcz: { name: 'Light Containment', short: 'LCZ', icon: '🟨', slots: 6, max: 9 },
  hcz: { name: 'Heavy Containment', short: 'HCZ', icon: '🟥', slots: 4, max: 8 },
};
export const EXPAND_COST = n => 250 + n * 150;         // n = slots already bought in that zone

// cost/upkeep in $K, power in MW. tier = containment class a chamber can hold (1 Safe, 2 Euclid, 3 Keter).
export const ROOMS = {
  cont1: { name: 'Standard Chamber', icon: '🔲', zones: ['lcz', 'hcz'], cost: 150, upkeep: 8, power: 1, tier: 1, desc: 'Holds a Safe anomaly.' },
  cont2: { name: 'Reinforced Chamber', icon: '🔳', zones: ['lcz', 'hcz'], cost: 320, upkeep: 16, power: 2, tier: 2, desc: 'Holds a Safe or Euclid anomaly.' },
  cont3: { name: 'Maximum Chamber', icon: '⬛', zones: ['hcz'], cost: 650, upkeep: 32, power: 4, tier: 3, desc: 'Holds anything, including Keter.' },
  lab: { name: 'Research Lab', icon: '🔬', zones: ['office', 'lcz'], cost: 260, upkeep: 14, power: 2, desc: '+25% research from every anomaly.' },
  quarters: { name: 'Staff Quarters', icon: '🛏️', zones: ['office'], cost: 160, upkeep: 6, power: 1, cap: 8, desc: 'Houses 8 researchers, engineers or medics.' },
  barracks: { name: 'Barracks', icon: '🪖', zones: ['office', 'lcz', 'hcz'], cost: 200, upkeep: 8, power: 1, cap: 8, desc: 'Houses 8 security officers.' },
  dblock: { name: 'D-Class Block', icon: '🟧', zones: ['lcz'], cost: 120, upkeep: 5, power: 1, cap: 12, desc: 'Houses 12 D-Class personnel.' },
  gen: { name: 'Generator', icon: '⚡', zones: ['office', 'lcz', 'hcz'], cost: 200, upkeep: 4, power: -8, desc: '+8 MW. Needs an engineer to run at full output.' },
  checkpoint: { name: 'Security Checkpoint', icon: '🚧', zones: ['lcz', 'hcz'], cost: 180, upkeep: 7, power: 1, desc: 'Big boost to stopping breaches in its zone, and to raid defense.' },
  armory: { name: 'Armory', icon: '🗄️', zones: ['office', 'lcz', 'hcz'], cost: 260, upkeep: 9, power: 1, desc: '+25% security strength. Each armory supports 2 MTF units.' },
  medbay: { name: 'Medical Bay', icon: '🩺', zones: ['office', 'lcz'], cost: 220, upkeep: 10, power: 2, desc: 'With medics, saves some of the wounded. MTF units heal faster.' },
  lounge: { name: 'Break Room', icon: '☕', zones: ['office'], cost: 110, upkeep: 4, power: 1, desc: 'Raises the level staff morale settles at (up to 3 rooms).' },
  admin: { name: 'Administration', icon: '🗂️', zones: ['office'], cost: 260, upkeep: 8, power: 1, desc: '+$60K budget per week and keeps the O5 Council happier.' },
  amnestics: { name: 'Amnestics Lab', icon: '💊', zones: ['office'], cost: 300, upkeep: 14, power: 2, tech: 'amnB', desc: 'Lowers public exposure every week.' },
  sra: { name: 'Reality Anchor Array', icon: '📡', zones: ['hcz', 'lcz'], cost: 600, upkeep: 26, power: 5, tech: 'sra', desc: 'Breach chance −30% for anomalies in this zone.' },
};

export const STAFF = {
  researcher: { name: 'Researchers', one: 'researcher', icon: '🧑‍🔬', hire: 45, salary: 8, home: 'quarters' },
  engineer: { name: 'Engineers', one: 'engineer', icon: '🧑‍🔧', hire: 35, salary: 6, home: 'quarters' },
  medic: { name: 'Medics', one: 'medic', icon: '🧑‍⚕️', hire: 40, salary: 7, home: 'quarters' },
  guard: { name: 'Security', one: 'security officer', icon: '💂', hire: 30, salary: 6, home: 'barracks' },
  dclass: { name: 'D-Class', one: 'D-Class', icon: '🟠', hire: 8, salary: 1, home: 'dblock' },
};

export const MTF = {
  e11: { name: 'Epsilon-11 "Nine-Tailed Fox"', short: 'Ε-11', icon: '🦊', tech: 'e11', cost: 550, upkeep: 35, power: 30 },
  nu7: { name: 'Nu-7 "Hammer Down"', short: 'Ν-7', icon: '🔨', tech: 'nu7', cost: 950, upkeep: 60, power: 50 },
  a1: { name: 'Alpha-1 "Red Right Hand"', short: 'Α-1', icon: '✋', tech: 'a1', cost: 1700, upkeep: 100, power: 80 },
};

// rp: research per week · breach: base weekly chance · danger: how bad a breach is (1–10)
// test: what one D-Class test can do · tags drive special mechanics in sim.js / events.js
export const SCPS = {
  '999': { name: 'The Tickle Monster', cls: 'Safe', icon: '🟠', rp: 2, breach: 0.01, danger: 0, test: { rp: 4, death: 0, risk: 0 },
    desc: 'A friendly orange gelatinous blob that cheers up anyone it touches. Staff visit it on bad days.', perk: 'Raises the level staff morale settles at. "Visit" it once a week for an extra boost.' },
  '914': { name: 'The Clockworks', cls: 'Safe', icon: '⚙️', rp: 4, breach: 0, danger: 0, test: { rp: 10, death: 0.05, risk: 0 },
    desc: 'A huge machine of gears and belts. Put something in, choose a setting, and something else comes out.', perk: 'Refine equipment once a week: from scrap to miracles.' },
  '500': { name: 'Panacea', cls: 'Safe', icon: '💊', rp: 2, breach: 0, danger: 0, test: { rp: 6, death: 0, risk: 0 },
    desc: 'A small box of red pills that cure any illness. There are only so many.', perk: 'Saves some of the people who would have died, while pills last.' },
  '294': { name: 'The Coffee Machine', cls: 'Safe', icon: '☕', rp: 3, breach: 0, danger: 0, test: { rp: 8, death: 0.1, risk: 0 },
    desc: 'A vending machine that dispenses any liquid you type in. Some requests should not be typed.', perk: 'Raises the level staff morale settles at, a little.' },
  '131': { name: 'The Eye Pods', cls: 'Safe', icon: '👁️', rp: 2, breach: 0.02, danger: 0, test: { rp: 5, death: 0, risk: 0.02 },
    desc: 'Two curious, playful teardrop-shaped creatures that never stop watching things.', perk: 'They love watching SCP-173: its breach chance drops sharply while they are on site.' },
  '173': { name: 'The Sculpture', cls: 'Euclid', icon: '🗿', rp: 5, breach: 0.045, danger: 4, test: { rp: 14, death: 0.25, risk: 0.04 },
    desc: 'A concrete statue that cannot move while observed. When nobody is looking, it is very fast.', perk: 'Its chamber is cleaned weekly by D-Class teams: occasionally one does not come back.' },
  '096': { name: 'The Shy Guy', cls: 'Euclid', icon: '🙈', rp: 6, breach: 0.0, danger: 6, test: { rp: 16, death: 0.15, risk: 0.03 },
    desc: 'A pale, very tall humanoid. Anyone who sees its face, even in a photo, will be found by it.', perk: 'Never breaches on its own, but a leaked image of its face sets it off.' },
  '012': { name: 'A Bad Composition', cls: 'Euclid', icon: '🎼', rp: 7, breach: 0.02, danger: 2, test: { rp: 18, death: 0.3, risk: 0.02 },
    desc: 'An unfinished musical score. People who see it feel compelled to finish it, whatever it costs them.', perk: 'Needs a D-Class on hand each week, or a researcher may be lost to it.' },
  '049': { name: 'The Plague Doctor', cls: 'Euclid', icon: '🐦', rp: 9, breach: 0.04, danger: 6, test: { rp: 24, death: 0.35, risk: 0.04 },
    desc: 'A polite, medieval-looking doctor who believes it is curing a "Pestilence". Its patients do not survive the cure.', perk: 'Great research. In a breach, its victims get back up.' },
  '079': { name: 'Old AI', cls: 'Euclid', icon: '💾', rp: 8, breach: 0.0, danger: 3, test: { rp: 20, death: 0, risk: 0.05 },
    desc: 'A sentient computer from the 1980s that hates its captors and wants out, through any network it can reach.', perk: 'Never walks out, but it hacks the site: power cuts and doors opened elsewhere.' },
  '939': { name: 'With Many Voices', cls: 'Keter', icon: '🦷', rp: 10, breach: 0.05, danger: 7, test: { rp: 26, death: 0.4, risk: 0.05 },
    desc: 'Pack predators that lure prey by imitating the voices of people they have eaten.', perk: 'A breach in the dark corridors of Heavy Containment is a nightmare.' },
  '035': { name: 'The Possessive Mask', cls: 'Keter', icon: '🎭', rp: 12, breach: 0.03, danger: 5, test: { rp: 30, death: 0.4, risk: 0.04 },
    desc: 'A theatre mask that persuades people to wear it, then takes them over. It is charming and very clever.', perk: 'Huge research, but it keeps trying to talk researchers into putting it on.' },
  '106': { name: 'The Old Man', cls: 'Keter', icon: '👴', rp: 10, breach: 0.07, danger: 7, test: { rp: 28, death: 0.5, risk: 0.06 },
    desc: 'A decaying old man who walks through walls and drags people into a pocket dimension of his own.', perk: 'Breaches often. The Femur Breaker procedure lures him back, at a terrible price.' },
  '682': { name: 'Hard-to-Destroy Reptile', cls: 'Keter', icon: '🦎', rp: 14, breach: 0.05, danger: 9, test: { rp: 40, death: 0.6, risk: 0.08 },
    desc: 'A vast, adaptive reptile that hates all life and survives every attempt to kill it. Containment is the only option.', perk: 'Tests are termination attempts: huge research, huge risk. If it stays loose, the site is lost.' },
};
export const CLASS_TIER = { Safe: 1, Euclid: 2, Keter: 3 };
export const CLASS_COLOR = { Safe: '#3fb950', Euclid: '#d29922', Keter: '#f85149' };

export const TECH = {
  proto1: { name: 'Containment Protocols I', icon: '📋', rp: 40, desc: 'All breach chances −15%.' },
  proto2: { name: 'Containment Protocols II', icon: '📋', rp: 130, req: 'proto1', desc: 'All breach chances another −15%.' },
  proto3: { name: 'Containment Protocols III', icon: '📋', rp: 280, req: 'proto2', desc: 'All breach chances another −15%.' },
  drills: { name: 'Breach Drills', icon: '🚨', rp: 90, desc: 'Lockdowns +10% more likely to work; fewer casualties in breaches.' },
  e11: { name: 'MTF Epsilon-11', icon: '🦊', rp: 80, desc: 'Lets you field "Nine-Tailed Fox" units.' },
  nu7: { name: 'MTF Nu-7', icon: '🔨', rp: 220, req: 'e11', desc: 'Lets you field "Hammer Down" heavy units.' },
  a1: { name: 'MTF Alpha-1', icon: '✋', rp: 450, req: 'nu7', desc: 'The O5 Council\'s own task force. The best there is.' },
  sra: { name: 'Scranton Reality Anchors', icon: '📡', rp: 200, req: 'proto1', desc: 'Unlocks the Reality Anchor Array room.' },
  amnB: { name: 'Class-B Amnestics', icon: '💊', rp: 50, desc: 'Unlocks the Amnestics Lab.' },
  amnC: { name: 'Class-C Amnestics', icon: '💉', rp: 160, req: 'amnB', desc: 'Amnestics Labs work 50% better; cover-ups are cheaper.' },
  femur: { name: 'Procedure 106 "Femur Breaker"', icon: '🦴', rp: 90, desc: 'A sure way to lure SCP-106 back into containment. Costs one D-Class.' },
  acid: { name: 'SCP-682 Acid Containment', icon: '🧪', rp: 150, desc: 'SCP-682 breaches 40% less often and is easier to subdue.' },
  airgap: { name: 'Air-gapped Network', icon: '🔌', rp: 70, desc: 'SCP-079 can no longer hack the site.' },
  autodef: { name: 'Automated Defenses', icon: '🔫', rp: 180, desc: '+25 defense against raids and breaches.' },
  psych: { name: 'Psychological Support', icon: '🧠', rp: 80, desc: 'Morale settles higher and recovers faster.' },
  lobby: { name: 'Overwatch Lobbying', icon: '🏛️', rp: 150, desc: '+$80K budget per week.' },
  intel: { name: 'Counter-Intelligence', icon: '🕵️', rp: 140, desc: 'Infiltrators get caught; +15 raid defense.' },
  calib: { name: 'SCP-914 Calibration', icon: '🔧', rp: 60, desc: 'SCP-914 gives better results and fails less.' },
};

export const DIFFICULTY = {
  safe: { name: 'Safe', desc: 'A forgiving first posting. Fewer breaches, more money.', breach: 0.7, threat: 0.85, budget: 330, raid: 0.75 },
  euclid: { name: 'Euclid', desc: 'The intended experience. Things will go wrong.', breach: 1, threat: 1, budget: 270, raid: 1 },
  keter: { name: 'Keter', desc: 'Underfunded, overexposed, hunted. Good luck, Director.', breach: 1.5, threat: 1.3, budget: 205, raid: 1.45 },
};

export const GOI = {
  ci: { name: 'Chaos Insurgency', icon: '🔴' },
  sh: { name: "The Serpent's Hand", icon: '🐍' },
  goc: { name: 'Global Occult Coalition', icon: '🌐' },
  mcd: { name: 'Marshall, Carter & Dark Ltd.', icon: '🎩' },
  cotbg: { name: 'Church of the Broken God', icon: '⚙️' },
  awcy: { name: 'Are We Cool Yet?', icon: '🎨' },
};
