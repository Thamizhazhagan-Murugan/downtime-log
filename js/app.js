(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false && k !== '') e.append(k instanceof Node ? k : String(k));
  return e;
}
const rc = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k != null && k !== false && k !== ''));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('dl.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem('dl.' + k); else localStorage.setItem('dl.' + k, JSON.stringify(v)); } catch (e) {} }
};
const uniq = a => [...new Set(a)];
function uniqBy(a, f) { const seen = new Set(); return a.filter(x => { const k = f(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
const clone = o => JSON.parse(JSON.stringify(o));
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const pad = n => String(n).padStart(2, '0');
function toLocalInput(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fromLocalInput(v) { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; }
function fmtDur(ms) { const m = Math.max(0, Math.round(ms / MIN)); if (m < 60) return m + ' min'; const hh = Math.floor(m / 60), r = m % 60; return r ? hh + ' h ' + r + ' min' : hh + ' h'; }
function fmtH(ms) { const v = ms / HOUR; return v >= 100 ? String(Math.round(v)) : v.toFixed(1); }
function clock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); }
function mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); }
const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function fmtDay(ms) {
  const d = new Date(ms), now = new Date();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Yesterday';
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}
const fmtWhen = ms => { const d = fmtDay(ms); return (d === 'Today' ? '' : d + ' ') + hm(ms); };
const fmtDate = ms => new Date(ms).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const longDate = ms => new Date(ms).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const ymd = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const andList = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const initials = n => (String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')) || '?';
const slug = s => String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ================= line configuration ================= */
const MODES = ['Auto', 'Semi-auto', 'Manual', 'Maintenance'];
const OTHER = 'Other';
const runSt = name => ({ name, run: true });
const dnSt = (name, alarms) => ({ name, run: false, alarms: alarms || [] });
const DEFAULT_CONFIG = {
  machines: [
    { name: 'Feeding line', main: false, rule: 'optional', states: [runSt('Auto'), dnSt('Issue', ['LR non calculated', 'Scrap billet', 'Stuck'])] },
    { name: 'Press', main: true, rule: 'main', states: [runSt('Extrusion'), dnSt('Die change'), dnSt('First profile'), dnSt('Die problem'), dnSt('Billet stuck'), dnSt('Issue', ['Hydraulic oil temperature high', 'Main pump tripped', 'Container temperature low', 'Ram speed fault'])] },
    { name: 'Puller', main: false, rule: 'always', states: [runSt('Auto'), dnSt('Issue', ['Excessive velocity error', 'Clamp not closing', 'Lost the profile'])] },
    { name: 'Stretcher', main: false, rule: 'always', states: [runSt('Auto'), dnSt('Issue', ['Gripper slip', 'Cylinder pressure low'])] },
    { name: 'ZPE A', main: false, rule: 'group', group: 'ZPE', delay: 5, states: [runSt('Auto'), dnSt('Issue', ['Profile jam', 'Sensor fault'])] },
    { name: 'ZPE B', main: false, rule: 'group', group: 'ZPE', delay: 5, states: [runSt('Auto'), dnSt('Issue', ['Profile jam', 'Sensor fault'])] }
  ],
  shifts: [{ name: 'Day', start: '06:00' }, { name: 'Night', start: '18:00' }]
};
function toMin(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; }
const cleanAlarms = a => Array.isArray(a) ? uniqBy(a.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 40)), x => x.toLowerCase()).filter(x => x.toLowerCase() !== 'other').slice(0, 60) : [];
function fixRules(list) {
  if (!list.some(m => m.main)) list[0].main = true;
  let seen = false; list.forEach(m => { if (m.main && seen) m.main = false; if (m.main) seen = true; });
  const counts = {};
  list.forEach(m => { if (m.main) { m.rule = 'main'; delete m.group; delete m.delay; } else if (m.rule === 'group') counts[m.group] = (counts[m.group] || 0) + 1; });
  list.forEach(m => {
    if (m.main) return;
    if (m.rule === 'group' && (counts[m.group] || 0) < 2) m.rule = 'always';
    if (m.rule === 'group' && list.some(x => x.name === m.group)) m.group = m.group + ' group';
    if (m.rule !== 'group') { delete m.group; delete m.delay; }
  });
  return list;
}
function normalizeConfig(d) {
  const c = clone(DEFAULT_CONFIG);
  if (!d) return c;
  if (Array.isArray(d.machines) && d.machines.length && typeof d.machines[0] === 'object') {
    const ms = d.machines.filter(m => m && typeof m.name === 'string' && Array.isArray(m.states)).map(m => {
      const o = {
        name: m.name.trim().slice(0, 30), main: m.main === true,
        rule: ['always', 'optional', 'group'].includes(m.rule) ? m.rule : 'always',
        states: uniqBy(m.states.filter(s => s && typeof s.name === 'string' && s.name.trim()).map(s => s.run === true ? runSt(s.name.trim().slice(0, 30)) : dnSt(s.name.trim().slice(0, 30), cleanAlarms(s.alarms))), s => s.name)
      };
      if (o.rule === 'group') { o.group = (typeof m.group === 'string' && m.group.trim()) ? m.group.trim().slice(0, 30) : 'Group'; o.delay = (typeof m.delay === 'number' && m.delay >= 0 && m.delay <= 120) ? m.delay : 5; }
      return o;
    }).filter(m => m.name && m.states.some(s => s.run) && m.states.some(s => !s.run));
    const u = uniqBy(ms, m => m.name).slice(0, 10);
    if (u.length) c.machines = fixRules(u);
  }
  if (Array.isArray(d.shifts)) { const s = d.shifts.filter(x => x && x.name && toMin(x.start) != null).map(x => ({ name: String(x.name).slice(0, 30), start: String(x.start).trim() })); if (s.length) c.shifts = s.slice(0, 6); }
  return c;
}
function machines() { return S.config.machines; }
function cfgMachine(n) { return S.config.machines.find(m => m.name === n) || null; }
function primary() { const m = S.config.machines.find(x => x.main) || S.config.machines[0]; return m ? m.name : ''; }
function runStateOf(n) { const m = cfgMachine(n); const s = m && m.states.find(x => x.run); return s ? s.name : 'Auto'; }
function isRunState(machine, state, fb) { const m = cfgMachine(machine); const s = m && m.states.find(x => x.name === state); return s ? s.run : !!fb; }
function alarmsFor(machine, state) { const m = cfgMachine(machine); const s = m && m.states.find(x => x.name === state); return s && !s.run ? (s.alarms || []) : []; }
const ruleOf = n => { const m = cfgMachine(n); return m ? (m.main ? 'main' : m.rule || 'always') : 'always'; };
const gcache = { sig: '', list: [] };
function groupsCfg() {
  const sig = JSON.stringify(S.config.machines);
  if (gcache.sig !== sig) {
    const g = {};
    for (const m of S.config.machines) if (!m.main && m.rule === 'group') { g[m.group] = g[m.group] || { name: m.group, members: [], delay: 0 }; g[m.group].members.push(m.name); g[m.group].delay = Math.max(g[m.group].delay, m.delay || 0); }
    gcache.sig = sig; gcache.list = Object.values(g).filter(x => x.members.length >= 2);
  }
  return gcache.list;
}
const groupOf = name => groupsCfg().find(g => g.members.includes(name)) || null;
const groupState = g => g.members.length === 2 ? 'Both down' : 'All down';
const groupLabel = g => g.name + (g.members.length === 2 ? ' both' : ' all');
function groupStates(g) {
  const first = cfgMachine(g.members[0]); if (!first) return [];
  return first.states.filter(s => g.members.every(mm => { const mc = cfgMachine(mm); return mc && mc.states.some(x => x.name === s.name && x.run === s.run); }))
    .map(s => s.run ? s : dnSt(s.name, uniq(g.members.flatMap(mm => alarmsFor(mm, s.name)))));
}

/* ---------- colours: one hue per machine, lighter tints for its other states ---------- */
const SLOTS = [1, 7, 2, 8, 3, 5, 4];
const PAL_HEX = { 1: '#2a78d6', 7: '#4a3aa7', 2: '#eb6834', 8: '#e34948', 3: '#1baf7a', 5: '#e87ba4', 4: '#eda100', 0: '#98a1ab' };
const ccache = { sig: '', info: {}, order: [] };
function causeInfo(machine, state) {
  const sig = JSON.stringify(S.config.machines);
  if (ccache.sig !== sig) {
    const P = primary(), fams = [];
    const pm = cfgMachine(P);
    if (pm) fams.push({ key: P, states: pm.states.filter(s => !s.run).map(s => s.name) });
    for (const m of S.config.machines) {
      if (m.name === P) continue;
      if (m.rule === 'group') { const g = groupOf(m.name); if (g && !fams.some(f => f.key === g.name)) fams.push({ key: g.name, states: [groupState(g)], members: g.members }); }
      else fams.push({ key: m.name, states: m.states.filter(s => !s.run).map(s => s.name) });
    }
    const info = {}, order = [];
    fams.forEach((f, i) => {
      const slot = i < SLOTS.length ? SLOTS[i] : 0, n = f.states.length;
      f.states.forEach((s, j) => { info[f.key + '|' + s] = { slot, pct: n <= 1 ? 100 : Math.round(100 - j * (55 / (n - 1))) }; order.push(f.key + '|' + s); });
      if (f.members) for (const mm of f.members) { const mc = cfgMachine(mm); if (mc) mc.states.filter(s => !s.run).forEach(s => { info[mm + '|' + s.name] = { slot, pct: 100 }; }); }
    });
    ccache.sig = sig; ccache.info = info; ccache.order = order;
  }
  return ccache.info[machine + '|' + state] || { slot: 0, pct: 100 };
}
function causeColor(machine, state) { const i = causeInfo(machine, state); const base = 'var(--s' + i.slot + ')'; return i.pct >= 100 ? base : 'color-mix(in oklab, ' + base + ' ' + i.pct + '%, var(--panel))'; }
function hexRgb(hx) { const v = parseInt(hx.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((x, i) => Math.round(x * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join(''); }
function causeHex(machine, state) { const i = causeInfo(machine, state); return mixHex(PAL_HEX[i.slot], '#ffffff', i.pct / 100); }
function causeRank(key) { const [m, s] = key.split('|'); causeInfo(m, s); const i = ccache.order.indexOf(key); return i < 0 ? 999 : i; }
const segColor = s => s.run === true ? 'var(--run)' : s.run === false ? causeColor(s.machine, s.state) : null;
function stateChip(machine, state, run) { return h('span', { class: 'schip', style: '--c:' + (run ? 'var(--run)' : causeColor(machine, state)) }, h('i'), state); }

/* ---------- shifts ---------- */
function shiftList() { return (S.config.shifts || []).map(s => ({ name: s.name, min: toMin(s.start) })).filter(s => s.name && s.min != null).sort((a, b) => a.min - b.min); }
function shiftBounds(t) {
  const sh = shiftList(), d0 = new Date(t);
  if (!sh.length) { const s = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()); return { name: 'Day', start: +s, end: +s + DAY }; }
  const c = [];
  for (let k = -1; k <= 1; k++) for (const s of sh) c.push({ name: s.name, at: +new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k, Math.floor(s.min / 60), s.min % 60) });
  c.sort((a, b) => a.at - b.at);
  let cur = c[0], next = null;
  for (const x of c) { if (x.at <= t) cur = x; else if (!next) next = x; }
  return { name: cur.name, start: cur.at, end: next ? next.at : cur.at + DAY };
}
function shiftPeriods(from, to) { const out = []; let b = shiftBounds(from), guard = 0; while (b.start < to && guard++ < 1000) { out.push(b); b = shiftBounds(b.end); } return out; }

/* ================= state ================= */
const RANGES = [
  { id: 'shift', label: 'This shift' }, { id: 'last', label: 'Last shift' },
  { id: '24h', label: '24 h', days: 1 }, { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 }, { id: '90d', label: '90 days', days: 90 }
];
const S = {
  tab: 'shift', mview: LS.get('mview', 'grid'), mfilter: LS.get('mfilter', 'all'), arange: LS.get('arange', '7d'), hrange: LS.get('hrange', 'shift'), hmachine: '',
  conn: 'connecting', db: null, auth: null, fbUser: null, me: null, meLoaded: false, unsubMe: null,
  config: normalizeConfig(null),
  live: [], liveSince: 0, liveLoaded: false, liveSeeds: {}, liveSeedsLoaded: false, unsubLive: null, pending: 0,
  hist: null, histLoading: null, histP: null, hasAny: null,
  users: [], usersLoaded: false, unsubUsers: null, session: null, unsubSess: null, sessions: [], sessionsLoaded: false, unsubSessions: null, clockingOut: false,
  online: navigator.onLine, installPrompt: null, wake: null, wantWake: LS.get('wake', false),
  exampleDismissed: LS.get('exampleDismissed', false), exampleForced: false,
  L: null, draft: null, draftSig: '', draftDirty: false, edVer: 0, edDrawn: -1, started: false
};
if (!RANGES.some(r => r.id === S.arange)) S.arange = '7d';
if (!RANGES.some(r => r.id === S.hrange) || S.hrange === '90d') S.hrange = 'shift';
const useExample = () => S.exampleForced || (!S.exampleDismissed && (S.hasAny === false || S.conn === 'offline'));
const canLog = () => S.conn === 'live' && isActive() && !!S.session;
function rangeBounds(id) {
  const now = Date.now(), cur = shiftBounds(now);
  if (id === 'shift') return { from: cur.start, to: now, phrase: 'this shift (' + cur.name + ')' };
  if (id === 'last') { const p = shiftBounds(cur.start - 1); return { from: p.start, to: p.end, phrase: 'the last shift (' + p.name + ', ' + fmtDay(p.start).toLowerCase() + ')' }; }
  const r = RANGES.find(x => x.id === id) || RANGES[3];
  return { from: now - r.days * DAY, to: now, phrase: r.days === 1 ? 'the last 24 hours' : 'the last ' + r.days + ' days' };
}

/* ================= events & the line state engine ================= */
function normEv(id, d) {
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const str = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
  const machine = str(d.machine, 30), state = str(d.state, 30), at = num(d.at);
  if (!machine || !state || at == null) return null;
  return { id, machine, state, run: d.run === true, stop: d.stop === true, mode: MODES.includes(d.mode) ? d.mode : '', at,
    alarm: str(d.alarm, 40), note: str(d.note, 160), code: str(d.code, 40), uid: str(d.uid, 128) || null,
    personName: str(d.personName, 60), sessionId: str(d.sessionId, 60) || null,
    createdAt: num(d.createdAt) || at, updatedAt: num(d.updatedAt) };
}
const byAt = (a, b) => (a.at - b.at) || ((a.createdAt || 0) - (b.createdAt || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const withRun = e => Object.assign({}, e, { run: isRunState(e.machine, e.state, e.run) });
const evText = e => [e.alarm, e.note, e.code ? '[' + e.code + ']' : ''].filter(Boolean).join(' · ');
/* What holds the line at time t: support machines win over the press; among them the earliest stop wins. */
function lineAt(st, t) {
  const P = primary(); let best = null;
  const consider = c => { if (!best || c.start < best.start) best = c; };
  for (const m of S.config.machines) {
    if (m.main || m.name === P) continue;
    const s = st[m.name]; if (!s || s.run) continue;
    if (m.rule === 'optional') { if (s.stop) consider({ start: s.at, machine: m.name, state: s.state, mode: s.mode, ev: s }); }
    else if (m.rule !== 'group') consider({ start: s.downSince, machine: m.name, state: s.state, mode: s.mode, ev: s });
  }
  for (const g of groupsCfg()) {
    const ss = g.members.map(n => st[n]);
    if (ss.some(s => !s || s.run)) continue;
    const trig = Math.max(...ss.map(s => s.downSince)) + g.delay * MIN;
    if (t >= trig) { const last = ss.reduce((a, b) => (b.at > a.at ? b : a)); consider({ start: trig, machine: g.name, state: groupState(g), mode: last.mode, ev: last, group: g }); }
  }
  if (best) return { run: false, machine: best.machine, state: best.state, mode: best.mode, ev: best.ev, group: best.group || null };
  const p = st[P];
  if (!p) return { run: null, machine: '', state: 'Not logged', mode: '', ev: null, group: null };
  return { run: p.run, machine: P, state: p.state, mode: p.mode, ev: p, group: null };
}
function nextTrigger(st, t) {
  let n = Infinity;
  for (const g of groupsCfg()) {
    const ss = g.members.map(x => st[x]);
    if (ss.some(s => !s || s.run)) continue;
    const trig = Math.max(...ss.map(s => s.downSince)) + g.delay * MIN;
    if (trig > t && trig < n) n = trig;
  }
  return n;
}
function replay(seeds, events, from, to) {
  const st = {}, open = {}, mint = {};
  const closeI = (m, t) => { const o = open[m]; if (!o) return; const a = Math.max(o.start, from), b = Math.min(t, to); if (b > a) (mint[m] = mint[m] || []).push({ start: a, end: b, state: o.ev.state, run: o.ev.run, stop: !!o.ev.stop, mode: o.ev.mode, evId: o.ev.id, alarm: o.ev.alarm, note: o.ev.note }); };
  const apply = e => {
    const prev = st[e.machine], ev = withRun(e);
    ev.downSince = (!ev.run && prev && !prev.run) ? prev.downSince : e.at;
    closeI(e.machine, e.at); st[e.machine] = ev; open[e.machine] = { start: e.at, ev };
  };
  for (const e of Object.values(seeds || {})) if (e && cfgMachine(e.machine)) { const ev = withRun(e); ev.downSince = e.at; st[e.machine] = ev; open[e.machine] = { start: e.at, ev }; }
  const evs = events.filter(e => e.at <= to && cfgMachine(e.machine)).sort(byAt);
  let i = 0;
  for (; i < evs.length && evs[i].at <= from; i++) { const e = evs[i], have = st[e.machine]; if (!have || byAt(have, e) <= 0) apply(e); }
  const segs = []; let cursor = from, cur = lineAt(st, cursor);
  const mk = (a, b, c) => ({ start: a, end: b, run: c.run, machine: c.machine, state: c.state, mode: c.mode, group: c.group ? c.group.name : null, evId: c.ev ? c.ev.id : null, alarm: c.ev ? c.ev.alarm : '', note: c.ev ? c.ev.note : '', uid: c.ev ? c.ev.uid : null, personName: c.ev ? c.ev.personName : '' });
  const advance = until => { let tr, guard = 0; while ((tr = nextTrigger(st, cursor)) <= until && tr < to && guard++ < 50) { segs.push(mk(cursor, tr, cur)); cursor = tr; cur = lineAt(st, cursor); } };
  for (; i < evs.length; i++) {
    const e = evs[i];
    advance(e.at);
    if (e.at > cursor) { segs.push(mk(cursor, e.at, cur)); cursor = e.at; }
    apply(e); cur = lineAt(st, cursor);
  }
  advance(to);
  if (to > cursor) segs.push(mk(cursor, to, cur));
  for (const m of Object.keys(open)) closeI(m, to);
  const out = [];
  for (const s of segs) { const p = out[out.length - 1]; if (p && p.run === s.run && p.machine === s.machine && p.state === s.state && p.mode === s.mode && p.evId === s.evId) p.end = s.end; else if (s.end > s.start) out.push(s); }
  return { segs: out, state: st, line: cur, from, to, mint };
}
function segStats(segs) {
  let run = 0, down = 0, unk = 0, stops = 0, prevKey = null;
  const causes = new Map(), modes = {}, occ = [];
  for (const s of segs) {
    const d = s.end - s.start;
    const key = s.run === true ? 'RUN' : s.run == null ? 'UNK' : s.machine + '|' + s.state;
    if (s.run === true) run += d;
    else if (s.run == null) unk += d;
    else {
      down += d;
      let c = causes.get(key); if (!c) { c = { key, machine: s.machine, state: s.state, ms: 0, n: 0, longest: 0, _cur: 0 }; causes.set(key, c); }
      c.ms += d;
      if (key !== prevKey) { c.n++; stops++; occ.push({ key, start: s.start }); c._cur = 0; }
      c._cur += d; if (c._cur > c.longest) c.longest = c._cur;
    }
    if (s.run != null) { const mk = s.mode || 'Not set'; modes[mk] = modes[mk] || { run: 0, down: 0 }; modes[mk][s.run ? 'run' : 'down'] += d; }
    prevKey = key;
  }
  return { run, down, unk, stops, occ, modes, causes: [...causes.values()].sort((a, b) => b.ms - a.ms), avail: (run + down) > 0 ? run / (run + down) : null };
}
function lineSince(R) {
  const segs = R.segs; if (!segs.length) return null;
  const last = segs[segs.length - 1]; let start = last.start;
  for (let i = segs.length - 2; i >= 0; i--) { const s = segs[i]; if (s.run === last.run && s.machine === last.machine && s.state === last.state) start = s.start; else break; }
  if (start <= R.from && R.line.ev && !R.line.group) start = Math.min(start, R.line.ev.at);
  return start;
}
function nextMap(events) {
  const m = {}, last = {};
  for (const e of events.slice().sort(byAt)) { if (last[e.machine]) m[last[e.machine].id] = e.at; last[e.machine] = e; }
  return m;
}

/* ================= example data (generated, never stored) ================= */
const EX_NOTES = {
  'Press|Die problem': ['Die crack found', 'Bearing wash', 'Die not at temperature'],
  'Press|Billet stuck': ['Billet stuck in container', 'Butt stuck to die face']
};
const EX_PEOPLE = ['Example operator A', 'Example operator B'];
const EX = { sig: '', data: null };
function exampleData() {
  const sig = JSON.stringify(S.config.machines);
  if (EX.sig === sig && EX.data) return EX.data;
  const rnd = mulberry32(20261008);
  const now = Date.now(), since = now - 91 * DAY;
  const P = primary(), pm = cfgMachine(P);
  const has = n => pm.states.some(s => s.name === n);
  const downStates = pm.states.filter(s => !s.run).map(s => s.name);
  const aux = machines().filter(m => !m.main);
  const W = { 'Feeding line': 0.5, 'Puller': 0.35, 'Stretcher': 0.15, 'ZPE A': 0.3, 'ZPE B': 0.3 };
  const events = [], seeds = {}, busy = {}; let n = 0;
  const who = at => EX_PEOPLE[shiftBounds(at).name === 'Day' ? 0 : 1];
  const push = (m, st, mode, at, extra) => events.push(Object.assign({ id: 'ex' + (n++), example: true, machine: m, state: st, run: isRunState(m, st), stop: false, mode, at, alarm: '', note: '', code: '', uid: null, personName: who(at), createdAt: at }, extra || {}));
  for (const m of machines()) seeds[m.name] = { id: 'exs-' + m.name, example: true, machine: m.name, state: runStateOf(m.name), run: true, stop: false, mode: 'Auto', at: since - MIN, alarm: '', note: '', code: '', uid: null, personName: '', createdAt: since - MIN };
  const detail = (m, st) => {
    const al = alarmsFor(m, st);
    if (al.length) return rnd() < 0.9 ? { alarm: al[Math.floor(rnd() * al.length)] } : { alarm: OTHER, note: 'Checked on site' };
    const ns = EX_NOTES[m + '|' + st]; return ns ? { note: ns[Math.floor(rnd() * ns.length)] } : {};
  };
  const downOf = m => { const ds = m.states.filter(s => !s.run); return ds[Math.floor(rnd() * ds.length)].name; };
  const incident = (t0, span) => {
    const tw = aux.reduce((s, a) => s + (W[a.name] || 0.25), 0);
    let r = rnd() * tw, a = aux[0];
    for (const x of aux) { r -= (W[x.name] || 0.25); if (r <= 0) { a = x; break; } }
    const at = t0 + rnd() * span * 0.85, d = (4 + Math.pow(rnd(), 1.6) * 34) * MIN;
    if (at + d >= now || (busy[a.name] || 0) > at) return;
    const ds = downOf(a), dt = detail(a.name, ds), mode = rnd() < 0.6 ? 'Auto' : 'Manual';
    push(a.name, ds, mode, at, dt);
    if (a.rule === 'optional' && d > 14 * MIN && rnd() < 0.55) push(a.name, ds, mode, at + (7 + rnd() * 6) * MIN, Object.assign({ stop: true }, dt));
    if (a.rule === 'group' && rnd() < 0.4) {
      const g = groupOf(a.name), p = g && cfgMachine(g.members.find(x => x !== a.name));
      if (p && (busy[p.name] || 0) < at) {
        const pat = at + rnd() * d * 0.4, pd = (5 + rnd() * 22) * MIN;
        if (pat + pd < now) { const pds = downOf(p); push(p.name, pds, 'Auto', pat, detail(p.name, pds)); push(p.name, runStateOf(p.name), 'Auto', pat + pd); busy[p.name] = pat + pd; }
      }
    }
    push(a.name, runStateOf(a.name), 'Auto', at + d); busy[a.name] = at + d;
  };
  const runName = runStateOf(P);
  let t = since;
  while (t < now) {
    const ext = (40 + rnd() * 120) * MIN;
    if (aux.length) { const k = rnd() < 0.55 ? 1 : (rnd() < 0.35 ? 2 : 0); for (let j = 0; j < k; j++) incident(t, ext); }
    t += ext; if (t >= now) break;
    const r = rnd(); let seq = null;
    if (r < 0.3 && has('Die change')) seq = [['Die change', 'Manual', 25, 70]].concat(has('First profile') ? [['First profile', 'Semi-auto', 6, 22]] : []);
    else if (r < 0.56 && has('Issue')) seq = [['Issue', rnd() < 0.5 ? 'Manual' : 'Maintenance', 6, 50]];
    else if (r < 0.63 && has('Die problem')) seq = [['Die problem', 'Manual', 15, 60]].concat(has('First profile') ? [['First profile', 'Semi-auto', 5, 15]] : []);
    else if (r < 0.7 && has('Billet stuck')) seq = [['Billet stuck', 'Manual', 10, 45]];
    else if (r < 0.74 && downStates.length) seq = [[downStates[Math.floor(rnd() * downStates.length)], 'Manual', 8, 30]];
    if (!seq) continue;
    let done = false;
    for (const [stName, mode, lo, hi] of seq) {
      push(P, stName, mode, t, detail(P, stName));
      t += (lo + Math.pow(rnd(), 1.5) * (hi - lo)) * MIN;
      if (t >= now) { done = true; break; }
    }
    if (done) break;
    push(P, runName, 'Auto', t);
  }
  EX.sig = sig; EX.data = { events, seeds, since };
  return EX.data;
}

/* ================= data access ================= */
function getData(from) {
  if (useExample()) { const e = exampleData(); return { events: e.events, seeds: e.seeds, ready: true }; }
  if (S.conn !== 'live') return { ready: false };
  if (from >= S.liveSince) return { events: S.live, seeds: S.liveSeeds, ready: S.liveLoaded && S.liveSeedsLoaded };
  if (S.hist && S.hist.since <= from) return { events: S.hist.events.filter(e => e.at < S.liveSince).concat(S.live), seeds: S.hist.seeds, ready: S.liveLoaded };
  loadHist(from);
  return { ready: false };
}
async function ensureData(from) {
  if (useExample()) { const e = exampleData(); return { events: e.events, seeds: e.seeds }; }
  if (S.conn !== 'live') return null;
  if (from >= S.liveSince && S.liveLoaded && S.liveSeedsLoaded) return { events: S.live, seeds: S.liveSeeds };
  if (!(S.hist && S.hist.since <= from)) await loadHist(from);
  if (S.hist && S.hist.since <= from) return { events: S.hist.events.filter(e => e.at < S.liveSince).concat(S.live), seeds: S.hist.seeds };
  return null;
}
async function fetchSeeds(since) {
  const seeds = {}, col = S.db.collection('events');
  let indexOk = true;
  await Promise.all(machines().map(async m => {
    if (!indexOk) return;
    try {
      const s = await col.where('machine', '==', m.name).where('at', '<', since).orderBy('at', 'desc').limit(1).get();
      if (!s.empty) { const e = normEv(s.docs[0].id, s.docs[0].data() || {}); if (e) seeds[m.name] = e; }
    } catch (e) { if (e && e.code === 'failed-precondition') indexOk = false; }
  }));
  if (!indexOk) {
    try {
      const s = await col.where('at', '<', since).orderBy('at', 'desc').limit(400).get();
      for (const d of s.docs) { const e = normEv(d.id, d.data() || {}); if (e && !seeds[e.machine]) seeds[e.machine] = e; }
    } catch (e) {}
  }
  return seeds;
}
function loadHist(from) {
  if (!S.db) return Promise.resolve();
  if (S.histP && S.histLoading <= from) return S.histP;
  S.histLoading = from;
  const p = (async () => {
    try {
      const out = []; let upper = null;
      for (let page = 0; page < 30; page++) {
        let q = S.db.collection('events').where('at', '>=', from);
        if (upper != null) q = q.where('at', '<', upper);
        const snap = await q.orderBy('at', 'desc').limit(1000).get();
        const docs = snap.docs.map(d => normEv(d.id, d.data() || {})).filter(Boolean);
        out.push(...docs);
        if (snap.size < 1000 || !docs.length) break;
        upper = docs[docs.length - 1].at;
      }
      const seeds = await fetchSeeds(from);
      if (!S.hist || S.hist.since >= from) S.hist = { since: from, events: out, seeds };
    } catch (e) { showNotice("Couldn't load older entries. Switch the period again to retry."); }
    if (S.histP === p) { S.histP = null; S.histLoading = null; }
    renderAll();
  })();
  S.histP = p;
  return p;
}
function subLive() {
  if (!S.db) return;
  if (S.unsubLive) { try { S.unsubLive(); } catch (e) {} }
  const now = Date.now(), prev = shiftBounds(shiftBounds(now).start - 1);
  S.liveSince = Math.min(prev.start, now - DAY) - HOUR;
  S.liveLoaded = false; S.liveSeedsLoaded = false;
  try {
    S.unsubLive = S.db.collection('events').where('at', '>=', S.liveSince).orderBy('at', 'desc').limit(1000).onSnapshot({ includeMetadataChanges: true }, snap => {
      S.live = snap.docs.map(d => normEv(d.id, d.data() || {})).filter(Boolean);
      S.pending = snap.docs.filter(d => d.metadata && d.metadata.hasPendingWrites).length;
      S.fromCache = !!(snap.metadata && snap.metadata.fromCache);
      S.liveLoaded = true;
      if (S.live.length) S.hasAny = true;
      renderAll();
    }, err => { S.liveLoaded = true; if (err && err.code === 'permission-denied') return; showNotice('Lost the live connection to the log. Reload the page.'); renderAll(); });
  } catch (e) { S.liveLoaded = true; showNotice("Couldn't open the shared log."); }
  refreshSeeds();
}
function refreshSeeds() {
  const since = S.liveSince;
  fetchSeeds(since).then(s => { if (since !== S.liveSince) return; S.liveSeeds = s; S.liveSeedsLoaded = true; if (Object.keys(s).length) S.hasAny = true; renderAll(); });
}
function realCurrent(machine) {
  if (S.conn !== 'live') return null;
  let best = S.liveSeeds[machine] || null;
  for (const e of S.live) if (e.machine === machine && (!best || byAt(best, e) < 0)) best = e;
  return best;
}


/* ================= sign-in, approval and roles =================
   Identity comes from Firebase Auth (Google or email/password).
   The super admin is the one email in js/config.js; only that account can make or remove admins.
   Everyone else starts as a pending user until an admin approves them. The Firestore rules enforce the same. */
const SUPER = String((window.APP_CONFIG && window.APP_CONFIG.superAdminEmail) || '').trim().toLowerCase();
const isSuperEmail = u => !!u && !!u.email && u.email.toLowerCase() === SUPER;
function isSuper() { return isSuperEmail(S.fbUser) && !!S.fbUser.emailVerified; }
function isActive() { return isSuper() || (!!S.me && S.me.status === 'active'); }
function isAdmin() { return isSuper() || (isActive() && !!S.me && S.me.role === 'admin'); }
function myUid() { return S.fbUser ? S.fbUser.uid : null; }
function myName() { return (S.me && S.me.name) || (S.fbUser && (S.fbUser.displayName || String(S.fbUser.email || '').split('@')[0])) || ''; }
const userById = id => S.users.find(u => u.id === id) || null;
function canEditEntry(e) { return !!e && !e.example && !!S.db && isActive() && (isAdmin() || (!!myUid() && e.uid === myUid())); }
function normUser(id, d) {
  if (!d) return null;
  const str = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
  return { id, name: str(d.name, 60) || str(d.email, 80).split('@')[0] || 'User', email: str(d.email, 120).toLowerCase(), role: d.role === 'admin' ? 'admin' : 'user',
    status: ['active', 'pending', 'disabled'].includes(d.status) ? d.status : 'pending', createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0, photo: str(d.photo, 500) };
}
function normSession(id, d) {
  if (!d || typeof d.clockIn !== 'number') return null;
  return { id, uid: typeof d.uid === 'string' ? d.uid : '', name: typeof d.name === 'string' ? d.name.slice(0, 60) : 'Someone', clockIn: d.clockIn, clockOut: typeof d.clockOut === 'number' ? d.clockOut : null, open: d.open === true };
}
function fbMsg(x) {
  const c = x && x.code;
  if (c === 'permission-denied') return "You don't have access to do that. Ask an admin.";
  if (c === 'unavailable') return "Can't reach the database right now. It saves on this device and syncs when the connection is back.";
  if (c === 'resource-exhausted') return 'The database is busy or over its free limit. Wait a moment and try again.';
  if (c === 'failed-precondition') return 'The database needs a one-time index. Open the browser console for the link, or see the README.';
  return "Couldn't save. Check the connection and try again.";
}
const writeMsg = fbMsg;
function authMsg(x) {
  const c = x && x.code;
  if (c === 'auth/invalid-email') return 'That email address does not look right.';
  if (c === 'auth/user-not-found' || c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials') return 'Wrong email or password.';
  if (c === 'auth/email-already-in-use') return 'There is already an account with that email. Sign in instead, or use Continue with Google.';
  if (c === 'auth/weak-password') return 'Use a password of at least 8 characters.';
  if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes, or reset your password.';
  if (c === 'auth/network-request-failed') return 'No internet connection. Connect and try again.';
  if (c === 'auth/unauthorized-domain') return "This web address isn't allowed to sign in yet. In Firebase, add it under Authentication, Settings, Authorized domains.";
  if (c === 'auth/operation-not-allowed') return 'This sign-in method is turned off. In Firebase, enable it under Authentication, Sign-in method.';
  if (c === 'auth/popup-blocked') return 'The sign-in window was blocked. Allow pop-ups for this site and try again.';
  return 'Sign-in failed. Try again.';
}

const G = { mode: 'signin', email: '', pass: '', name: '', err: '', info: '', busy: false, clockedOut: null, pendingName: '' };
function gateMode() {
  if (S.conn === 'offline') return 'none';
  if (!S.authReady) return 'loading';
  if (!S.fbUser) return 'signin';
  if (isSuperEmail(S.fbUser) && !S.fbUser.emailVerified) return 'verify';
  if (!S.meLoaded && !isSuper()) return 'loading';
  if (!isActive()) return S.me && S.me.status === 'disabled' ? 'disabled' : 'pending';
  if (G.clockedOut) return 'bye';
  return 'none';
}
function gateBtn(label, cls, fn, dis) { return h('button', { type: 'button', class: 'btn btn-lg btn-block ' + (cls || ''), disabled: !!dis || G.busy, onclick: fn }, label); }
function renderGate() {
  const mode = gateMode();
  $('#gate').hidden = mode === 'none';
  if (mode === 'none') return;
  const sb = shiftBounds(Date.now());
  $('#gateKicker').textContent = sb.name + ' shift · ' + hm(sb.start) + '–' + hm(sb.end);
  const title = $('#gateTitle'), sub = $('#gateSub'), body = $('#gateBody');
  const email = S.fbUser ? S.fbUser.email : '';
  const msgs = () => [G.err ? h('p', { class: 'form-err', role: 'alert' }, G.err) : null, G.info ? h('p', { class: 'sh-info' }, G.info) : null];
  if (mode === 'loading') { title.textContent = 'Connecting…'; sub.textContent = 'Loading your account.'; rc(body); return; }
  if (mode === 'signin') {
    const up = G.mode === 'signup';
    title.textContent = up ? 'Create account' : 'Sign in';
    sub.textContent = up ? 'An admin approves new accounts before they can see the log.' : 'Use your Google account, or your email and password.';
    rc(body,
      h('button', { type: 'button', class: 'btn btn-lg btn-block gbtn', disabled: G.busy, onclick: googleSignIn }, h('span', { class: 'g-mark', 'aria-hidden': 'true' }, 'G'), 'Continue with Google'),
      h('div', { class: 'or' }, h('span', null, 'or with email')),
      up ? h('label', { class: 'field', for: 'au-name' }, h('span', null, 'Your name'), h('input', { id: 'au-name', type: 'text', maxlength: '60', autocomplete: 'name', value: G.name, oninput: e => { G.name = e.target.value; } })) : null,
      h('label', { class: 'field', for: 'au-email' }, h('span', null, 'Email'), h('input', { id: 'au-email', type: 'email', autocomplete: 'email', value: G.email, oninput: e => { G.email = e.target.value; } })),
      h('label', { class: 'field', for: 'au-pass' }, h('span', null, up ? 'Choose a password, at least 8 characters' : 'Password'), h('input', { id: 'au-pass', type: 'password', autocomplete: up ? 'new-password' : 'current-password', value: G.pass, oninput: e => { G.pass = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') (up ? emailSignUp : emailSignIn)(); } })),
      msgs(),
      gateBtn(up ? 'Create account' : 'Sign in', 'btn-primary', up ? emailSignUp : emailSignIn),
      h('div', { class: 'gate-foot' },
        h('button', { type: 'button', class: 'linkbtn', onclick: () => { G.mode = up ? 'signin' : 'signup'; G.err = ''; G.info = ''; renderGate(); } }, up ? 'I already have an account' : 'Create an account'),
        up ? null : h('button', { type: 'button', class: 'linkbtn', onclick: resetPass }, 'Forgot password?')));
    return;
  }
  if (mode === 'verify') {
    title.textContent = 'Verify your email'; sub.textContent = 'We sent a link to ' + email + '. Admin rights switch on after you open it.';
    rc(body, msgs(), gateBtn('I opened the link', 'btn-primary', recheckVerified), gateBtn('Send the link again', '', resendVerify), gateBtn('Sign out', 'btn-quiet', signOut));
    return;
  }
  if (mode === 'pending') {
    title.textContent = 'Waiting for approval'; sub.textContent = email + ' is signed in. An admin has to approve you before you can see the log. This page opens by itself once you are approved.';
    rc(body, msgs(), gateBtn('Sign out', '', signOut));
    return;
  }
  if (mode === 'disabled') {
    title.textContent = 'Access turned off'; sub.textContent = 'Your access to the log is turned off. Ask an admin to turn it back on.';
    rc(body, gateBtn('Sign out', '', signOut));
    return;
  }
  if (mode === 'bye') {
    const s = G.clockedOut;
    title.textContent = 'Clocked out'; sub.textContent = 'Thanks, ' + (s.name || myName()) + '. Your shift is saved.';
    rc(body,
      h('div', { class: 'acct-stats' },
        h('div', null, h('span', null, 'Clocked in'), h('b', null, hm(s.clockIn))),
        h('div', null, h('span', null, 'Clocked out'), h('b', null, hm(s.clockOut))),
        h('div', null, h('span', null, 'Time on shift'), h('b', null, fmtDur(s.clockOut - s.clockIn))),
        h('div', null, h('span', null, 'Date'), h('b', null, fmtDate(s.clockIn)))),
      gateBtn('Download shift report (PDF)', 'btn-primary', e => makeReport({ name: s.name || myName(), from: s.clockIn, to: s.clockOut, out: true }, e.currentTarget)),
      gateBtn('Done', '', () => { G.clockedOut = null; renderAll(); }),
      gateBtn('Sign out', 'btn-quiet', () => { G.clockedOut = null; signOut(); }));
  }
}
async function googleSignIn() {
  G.err = ''; G.info = ''; G.busy = true; renderGate();
  const prov = new firebase.auth.GoogleAuthProvider();
  prov.setCustomParameters({ prompt: 'select_account' });
  try { await S.auth.signInWithPopup(prov); }
  catch (x) {
    if (x && ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(x.code)) {
      try { await S.auth.signInWithRedirect(prov); return; } catch (y) { x = y; }
    }
    if (x && x.code !== 'auth/popup-closed-by-user' && x.code !== 'auth/cancelled-popup-request') G.err = authMsg(x);
  }
  G.busy = false; renderGate();
}
async function emailSignIn() {
  G.err = ''; G.info = '';
  const email = G.email.trim();
  if (!email || !G.pass) { G.err = 'Enter your email and password.'; renderGate(); return; }
  G.busy = true; renderGate();
  try { await S.auth.signInWithEmailAndPassword(email, G.pass); G.pass = ''; } catch (x) { G.err = authMsg(x); }
  G.busy = false; renderGate();
}
async function emailSignUp() {
  G.err = ''; G.info = '';
  const email = G.email.trim(), name = G.name.trim();
  if (!name) G.err = 'Enter your name.';
  else if (!email) G.err = 'Enter your email.';
  else if (G.pass.length < 8) G.err = 'Use a password of at least 8 characters.';
  if (G.err) { renderGate(); return; }
  G.busy = true; G.pendingName = name; renderGate();
  try {
    const cred = await S.auth.createUserWithEmailAndPassword(email, G.pass);
    G.pass = '';
    try { await cred.user.updateProfile({ displayName: name }); } catch (e) {}
    try { await cred.user.sendEmailVerification(); } catch (e) {}
  } catch (x) { G.err = authMsg(x); }
  G.busy = false; renderGate();
}
async function resetPass() {
  G.err = ''; G.info = '';
  const email = G.email.trim();
  if (!email) { G.err = 'Type your email above first, then press Forgot password.'; renderGate(); return; }
  try { await S.auth.sendPasswordResetEmail(email); G.info = 'If ' + email + ' has an account, a reset link is on its way. Check your inbox.'; }
  catch (x) { G.err = authMsg(x); }
  renderGate();
}
async function resendVerify() { G.err = ''; try { await S.fbUser.sendEmailVerification(); G.info = 'Sent. Check your inbox and spam folder.'; } catch (x) { G.err = authMsg(x); } renderGate(); }
async function recheckVerified() {
  G.err = ''; G.busy = true; renderGate();
  try { await S.fbUser.reload(); await S.fbUser.getIdToken(true); onAuth(S.auth.currentUser); } catch (x) { G.err = authMsg(x); }
  G.busy = false; if (S.fbUser && !S.fbUser.emailVerified) { G.err = 'Not verified yet. Open the link in the email, then try again.'; } renderGate();
}
async function signOut() { closeAcct(); try { await S.auth.signOut(); } catch (e) {} }

function onAuth(u) {
  stopData();
  S.fbUser = u || null; S.authReady = true;
  S.me = null; S.meLoaded = false; S.session = null; G.err = ''; G.info = '';
  if (S.unsubMe) { try { S.unsubMe(); } catch (e) {} S.unsubMe = null; }
  if (u && !(isSuperEmail(u) && !u.emailVerified)) watchMe();
  renderAll();
}
function watchMe() {
  const ref = S.db.collection('users').doc(S.fbUser.uid);
  S.unsubMe = ref.onSnapshot(snap => {
    if (!snap.exists) { S.meLoaded = isSuper(); ensureProfile(ref); if (isSuper()) startData(); renderAll(); return; }
    S.me = normUser(snap.id, snap.data()); S.meLoaded = true;
    if (isActive()) startData(); else stopData();
    renderAll();
  }, err => { S.meLoaded = true; if (isSuper()) startData(); else G.err = fbMsg(err); renderAll(); });
}
async function ensureProfile(ref) {
  if (S.creatingMe) return; S.creatingMe = true;
  const u = S.fbUser, sup = isSuper();
  const doc = { name: (G.pendingName || u.displayName || String(u.email || '').split('@')[0] || 'New user').slice(0, 60), email: String(u.email || '').toLowerCase(), role: sup ? 'admin' : 'user', status: sup ? 'active' : 'pending', createdAt: Date.now(), photo: u.photoURL || '' };
  try { await ref.set(doc); } catch (x) { G.err = "Couldn't create your profile. " + fbMsg(x); S.meLoaded = true; renderAll(); }
  S.creatingMe = false;
}
function startData() {
  if (S.started || !S.db) return;
  S.started = true; S.conn = 'live';
  let cfgSig = '';
  S.unsubCfg = S.db.doc('config/line').onSnapshot(snap => {
    if (!snap.exists && isAdmin()) { S.db.doc('config/line').set(Object.assign(clone(DEFAULT_CONFIG), { updatedAt: Date.now(), updatedBy: myUid() })).catch(() => {}); }
    S.config = normalizeConfig(snap.exists ? snap.data() : null);
    const sig = JSON.stringify(S.config.machines.map(m => m.name));
    if (cfgSig && sig !== cfgSig) refreshSeeds();
    cfgSig = sig; EX.sig = ''; renderAll();
  }, () => {});
  S.unsubUsers = S.db.collection('users').onSnapshot(snap => {
    S.users = snap.docs.map(d => normUser(d.id, d.data() || {})).filter(Boolean);
    S.usersLoaded = true; renderAll();
  }, () => { S.usersLoaded = true; });
  subLive();
  S.unsubSess = S.db.collection('sessions').where('uid', '==', myUid()).where('open', '==', true).onSnapshot(snap => {
    const open = snap.docs.map(d => normSession(d.id, d.data() || {})).filter(Boolean).sort((a, b) => b.clockIn - a.clockIn);
    const was = S.session;
    S.session = open[0] || null;
    if (was && !S.session && !S.clockingOut && !G.clockedOut) { G.clockedOut = Object.assign({}, was, { clockOut: Date.now() }); toast('You were clocked out from another screen.'); }
    renderAll();
  }, () => {});
  S.db.collection('events').limit(1).get()
    .then(s => { if (S.hasAny !== true) S.hasAny = !s.empty; renderAll(); })
    .catch(() => { if (S.hasAny == null) S.hasAny = true; renderAll(); });
}
function stopData() {
  for (const k of ['unsubCfg', 'unsubUsers', 'unsubLive', 'unsubSess', 'unsubSessions']) { if (S[k]) { try { S[k](); } catch (e) {} S[k] = null; } }
  if (!S.started) return;
  S.started = false; S.conn = 'connecting';
  S.live = []; S.liveLoaded = false; S.liveSeeds = {}; S.liveSeedsLoaded = false; S.hist = null; S.users = []; S.usersLoaded = false; S.sessions = []; S.session = null; S.hasAny = null;
}
function clockIn() {
  if (!S.db || !isActive()) return;
  const now = Date.now(), sb = shiftBounds(now), ref = S.db.collection('sessions').doc();
  if (S.session) S.db.collection('sessions').doc(S.session.id).update({ open: false, clockOut: now, autoClosed: true }).catch(() => {});
  const doc = { uid: myUid(), name: myName(), clockIn: now, clockOut: null, open: true, shiftName: sb.name, shiftStart: sb.start, shiftEnd: sb.end };
  ref.set(doc).catch(x => toast(fbMsg(x)));
  S.session = Object.assign({ id: ref.id }, doc);
  G.clockedOut = null;
  renderAll(); openCheck();
}
function clockOut() {
  const s = S.session; if (!s) return;
  const now = Date.now();
  S.clockingOut = true;
  S.db.collection('sessions').doc(s.id).update({ open: false, clockOut: now }).catch(x => toast(fbMsg(x))).then(() => { S.clockingOut = false; });
  setTimeout(() => { S.clockingOut = false; }, 5000);
  G.clockedOut = Object.assign({}, s, { name: myName(), clockOut: now });
  S.session = null;
  closeAcct(); if ($('#sheet').open) closeSheet();
  renderAll(); window.scrollTo({ top: 0 });
}

/* ---------- account sheet: shift, device and sign-out ---------- */
const acct = $('#acct');
function openAcct() { renderAcct(); if (typeof acct.showModal === 'function') { if (!acct.open) acct.showModal(); } else acct.setAttribute('open', ''); }
function closeAcct() { if (acct.open) { if (typeof acct.close === 'function') acct.close(); else acct.removeAttribute('open'); } }
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function renderAcct() {
  const nm = myName(), now = Date.now();
  $('#acAvatar').textContent = initials(nm); $('#acTitle').textContent = nm || 'Account';
  $('#acRole').textContent = (S.fbUser ? S.fbUser.email : '') + ' · ' + (isSuper() ? 'Main admin' : isAdmin() ? 'Admin' : 'User');
  const stats = [];
  if (S.session) stats.push(h('div', null, h('span', null, 'Clocked in'), h('b', null, hm(S.session.clockIn))), h('div', null, h('span', null, 'On shift for'), h('b', null, fmtDur(now - S.session.clockIn))));
  else stats.push(h('div', null, h('span', null, 'Shift'), h('b', null, 'Not clocked in')), h('div', null, h('span', null, 'Connection'), h('b', null, S.online ? 'Online' : 'Offline')));
  rc($('#acStats'), stats);
  const dev = [];
  dev.push(h('label', { class: 'check', style: 'display:flex;gap:10px;align-items:center;font-weight:600' }, h('input', { type: 'checkbox', checked: !!S.wake || S.wantWake, onchange: e => setWake(e.target.checked) }), 'Keep this screen on'));
  if (S.installPrompt && !isStandalone()) dev.push(h('button', { type: 'button', class: 'btn btn-sm', onclick: installApp }, 'Install as an app'));
  else if (isIOS() && !isStandalone()) dev.push(h('span', { class: 'muted', style: 'font-size:.86rem' }, 'To install on iPhone: Share, then Add to Home Screen.'));
  rc($('#acInfo'), h('div', { style: 'display:grid;gap:10px' }, S.session ? 'Your shift report covers everything logged on the line from when you clocked in until now, or until you clock out.' : 'Clock in at the start of your shift to log entries and get your shift report.', dev));
  const acts = [];
  if (S.session) {
    acts.push(h('button', { type: 'button', class: 'btn btn-lg', onclick: e => makeReport({ name: nm, from: S.session.clockIn, to: Date.now(), out: false }, e.currentTarget) }, 'Shift report PDF'));
    acts.push(h('span', { class: 'sp' }));
    acts.push(h('button', { type: 'button', class: 'btn btn-stop btn-lg', onclick: e => { const b = e.currentTarget; if (b.dataset.armed) { clockOut(); return; } b.dataset.armed = '1'; b.textContent = 'Press again to clock out'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Clock out'; } }, 4000); } }, 'Clock out'));
  } else if (isActive()) {
    acts.push(h('button', { type: 'button', class: 'btn btn-quiet btn-lg', onclick: signOut }, 'Sign out'), h('span', { class: 'sp' }), h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => { closeAcct(); clockIn(); } }, 'Clock in'));
  }
  if (S.session) acts.unshift(h('button', { type: 'button', class: 'btn btn-quiet btn-lg', onclick: e => { const b = e.currentTarget; if (b.dataset.armed) { signOut(); return; } b.dataset.armed = '1'; b.textContent = 'Still clocked in. Press again'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Sign out'; } }, 4000); } }, 'Sign out'));
  rc($('#acActions'), acts);
}
async function setWake(on) {
  S.wantWake = !!on; LS.set('wake', !!on);
  if (on) {
    try { S.wake = await navigator.wakeLock.request('screen'); S.wake.addEventListener('release', () => { S.wake = null; }); }
    catch (e) { S.wake = null; if (!document.hidden) { toast("This browser can't keep the screen on. Change the screen timeout in the phone settings."); S.wantWake = false; LS.set('wake', false); } }
  } else if (S.wake) { try { await S.wake.release(); } catch (e) {} S.wake = null; }
  if (acct.open) renderAcct();
}
async function installApp() { const p = S.installPrompt; if (!p) return; S.installPrompt = null; try { p.prompt(); await p.userChoice; } catch (e) {} if (acct.open) renderAcct(); }
function saveFile(name, blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 5000);
}

/* ================= chrome ================= */
function buildSeg(id, opts, cur, onPick) {
  const c = $('#' + id); const sig = opts.map(o => o.id).join('|') + '#' + cur;
  if (c.dataset.sig === sig) return; c.dataset.sig = sig;
  c.replaceChildren(...opts.map(o => h('button', { type: 'button', class: 'seg-b', 'aria-pressed': String(o.id === cur), onclick: () => onPick(o.id) }, o.label)));
}
function setOptions(sel, pairs, value) {
  const el = $(sel); const sig = JSON.stringify(pairs);
  if (el.dataset.sig !== sig) { el.replaceChildren(...pairs.map(([v, l]) => h('option', { value: v }, l))); el.dataset.sig = sig; }
  el.value = value; if (el.value !== value && pairs.length) el.value = pairs[0][0];
}
const TABS = ['shift', 'analysis', 'history', 'admin'];
function setTab(t) { if (!TABS.includes(t)) t = 'shift'; S.tab = t; LS.set('tab', t); renderAll(); window.scrollTo({ top: 0 }); }
function applyTab() {
  const gated = gateMode() !== 'none', admin = isAdmin();
  if (S.tab === 'admin' && !admin) S.tab = 'shift';
  $$('.tab, .bn').forEach(b => { b.hidden = b.dataset.tab === 'admin' && !admin; b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); });
  $('.tabs').hidden = gated; $('.bnav').hidden = gated;
  document.body.classList.toggle('gated', gated);
  $('#pageTitle').textContent = gated ? 'Downtime' : ({ shift: 'Dashboard', analysis: 'Analysis', history: 'History', admin: 'Admin' })[S.tab];
  $('.bnav').style.gridTemplateColumns = 'repeat(' + (admin ? 4 : 3) + ',minmax(0,1fr))';
  $$('[data-panel]').forEach(p => { p.hidden = gated || p.dataset.panel !== S.tab; });
  subSessions(!gated && admin && S.tab === 'admin');
}
function renderHeader(L) {
  const st = $('#lineState'); st.className = 'state';
  const sb = shiftBounds(Date.now());
  rc($('#hdrShift'), h('span', { class: 'hc' }, ico('clock'), h('span', null, h('small', null, 'Shift'), h('b', null, sb.name + ' · ' + hm(sb.start) + '–' + hm(sb.end)))),
    h('span', { class: 'hc' }, ico('cal'), h('span', null, h('small', null, 'Date'), h('b', null, new Date(sb.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })))));
  const ub = $('#userBtn');
  ub.hidden = !S.fbUser || gateMode() !== 'none';
  if (!ub.hidden) {
    const nm = myName();
    rc(ub, h('span', { class: 'avatar' }, initials(nm)), h('span', { class: 'u-name' }, nm), h('span', { class: 'u-role' }, S.session ? 'On shift' : (isAdmin() ? 'Admin' : 'User')));
    ub.setAttribute('aria-label', nm + '. Clock in or out, shift report, sign out.');
  }
  const net = $('#netChip');
  const off = !S.online, waiting = S.pending || 0;
  net.hidden = S.conn !== 'live' || (!off && !waiting);
  if (!net.hidden) { net.className = 'netchip' + (off ? ' off' : ''); net.textContent = off ? 'Offline' + (waiting ? ' · ' + waiting + ' to sync' : ' · saving on this device') : 'Syncing ' + waiting; }
  if (!L || !L.ready) { st.textContent = S.conn === 'offline' ? 'Demo' : (S.authReady && !S.fbUser) ? 'Signed out' : 'Connecting…'; return; }
  const line = L.R.line;
  if (useExample()) { st.textContent = 'Example data'; return; }
  if (line.run === true) st.replaceChildren(h('span', { class: 'dot', 'aria-hidden': 'true' }), 'Running');
  else if (line.run === false) { st.classList.add('st-alarm'); st.replaceChildren(h('span', { class: 'tri', 'aria-hidden': 'true' }, '▲'), 'Down · ' + line.machine); }
  else st.textContent = 'Clock not started';
}
function renderBanner() {
  const ex = useExample();
  $('#exBanner').hidden = !ex || S.tab === 'admin' || gateMode() !== 'none';
  if (ex) $('#exText').textContent = S.conn === 'offline'
    ? 'This copy is not connected to the database yet, so these are generated sample shifts. Nothing here is real or saved.'
    : (S.exampleForced && S.hasAny) ? 'Generated sample shifts. Your real log is hidden while examples are on.'
    : 'Nothing has been logged yet, so these are generated sample shifts. Log a real entry from a machine tile and they go away.';
}
function showNotice(msg) { $('#noticeText').textContent = msg; $('#notice').hidden = false; }
let toastT = 0;
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(h('span', null, msg));
  if (action) t.append(h('button', { type: 'button', class: 'toast-btn', onclick: () => { t.hidden = true; action.fn(); } }, action.label));
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, action ? 9000 : 3200);
}
function fillNames() {}
function nameOf(uid) { const u = uid ? userById(uid) : null; return u ? u.name : (uid ? 'Someone' : '—'); }
function whoEl(e) { if (e.example) return e.personName || 'Example'; return e.personName || nameOf(e.uid); }
const whoText = e => e.personName || (e.uid ? nameOf(e.uid) : '');

/* ================= SHIFT view ================= */
function liveModel() {
  const now = Date.now();
  let D;
  if (useExample()) { const e = exampleData(); D = { events: e.events, seeds: e.seeds, from: e.since, ready: true }; }
  else if (S.conn === 'live') D = { events: S.live, seeds: S.liveSeeds, from: S.liveSince, ready: S.liveLoaded && S.liveSeedsLoaded };
  else return { ready: false };
  if (!D.ready) return { ready: false };
  const R = replay(D.seeds, D.events, D.from, now);
  const shift = shiftBounds(now);
  const RS = replay(D.seeds, D.events, shift.start, now);
  return { ready: true, now, D, R, shift, RS, st: segStats(RS.segs) };
}
function renderShift(L) {
  const load = $('#shiftLoading'), body = $('#shiftBody');
  if (!L || !L.ready) {
    load.hidden = false; body.hidden = true;
    rc(load, h('p', { class: 'empty-t' }, S.conn === 'offline' && S.exampleDismissed ? "The shared log isn't available here." : 'Loading the shared log…'),
      h('p', { class: 'empty-s' }, 'The line state, machine tiles and shift timeline appear here.'));
    return;
  }
  load.hidden = true; body.hidden = false;
  const strip = $('#clockStrip');
  strip.hidden = S.conn !== 'live' || !!S.session;
  renderHero(L); renderMachines(L);
}
const lockOut = () => !canLog() || useExample();
function actBtn(label, cls, fn) { return h('button', { type: 'button', class: cls, disabled: lockOut(), onclick: e => fn(e.currentTarget) }, label); }
function backBtn(m, cls) { const t = runStateOf(m); return actBtn(m + ' back to ' + t, cls, b => quickLog(m, t, 'Auto', b)); }
function renderHero(L) {
  const line = L.R.line, now = L.now, P = primary();
  const kind = line.run === true ? 'run' : line.run === false ? 'down' : 'unk';
  const hero = $('#hero'), st = L.st, shift = L.shift;
  hero.className = 'card lcard is-' + kind;
  $('#lineTag').textContent = shift.name + ' shift · ' + hm(shift.start) + '–' + hm(shift.end);
  const stateTxt = kind === 'unk' ? 'Not logged yet' : line.group ? line.group.name + ' ' + line.state.toLowerCase() : (kind === 'down' && line.machine !== P) ? line.machine + ' ' + line.state.toLowerCase() : line.state;
  const alarmTxt = line.group ? andList(line.group.members) + ' down together' : [line.ev && line.ev.alarm === OTHER ? line.ev.note : line.ev && line.ev.alarm, line.ev && line.ev.stop ? 'press stopped' : ''].filter(Boolean).join(' · ');
  setPill($('#linePill'), kind === 'run' ? 'run' : kind === 'down' ? 'down' : 'unk', kind === 'run' ? 'Running' : kind === 'down' ? 'Down · ' + (line.group ? line.group.name : line.machine) : 'Not started');
  rc($('#lineGauge'), h('p', { class: 'col-t' }, 'Productivity'), gaugeEl(st.avail, 'Availability'));
  rc($('#lineInfo'),
    irow('state', 'Line state', stateTxt),
    irow('alarm', kind === 'down' ? 'Cause' : 'Alarm', kind === 'down' ? alarmTxt || line.machine : '—'),
    irow('mode', 'Mode', (line.mode || (kind === 'unk' ? '—' : 'Not set'))),
    irow('user', 'Last entry by', line.ev && !line.group ? whoText(line.ev) || '—' : '—'));
  const r = hmParts(st.run), d = hmParts(st.down), top = st.causes[0];
  rc($('#lineData'),
    dtile('run', 'Running', r[0] + ' ' + r[1]),
    dtile('down', 'Downtime', d[0] + ' ' + d[1]),
    dtile('stops', 'Stops', String(st.stops)),
    dtile('cause', 'Biggest cause', top ? top.state + ' · ' + top.machine : '—'));
  renderTimeline($('#shiftTl'), L.RS.segs, shift.start, shift.end, now);
  const btns = [];
  if (useExample()) btns.push(h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: !canLog(), onclick: () => openSheet(P) }, 'Start the real clock'));
  else if (kind === 'down') {
    if (line.group) { btns.push(bothBackBtn(line.group, 'btn btn-go btn-lg')); line.group.members.forEach(m => btns.push(backBtn(m, 'btn btn-lg'))); }
    else if (line.machine === P) btns.push(actBtn('Back to ' + runStateOf(P), 'btn btn-go btn-lg', b => quickLog(P, runStateOf(P), 'Auto', b)));
    else {
      btns.push(backBtn(line.machine, 'btn btn-go btn-lg'));
      if (ruleOf(line.machine) === 'optional') btns.push(actBtn('Restart the press, issue still open', 'btn btn-lg', b => setPressStop(line.machine, false, b)));
    }
    btns.push(h('button', { type: 'button', class: 'btn btn-lg', disabled: !canLog(), onclick: () => openSheet(null) }, 'Log other'));
  } else if (kind === 'run') btns.push(h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: !canLog(), onclick: () => openSheet(null) }, 'Log a stop'));
  else btns.push(h('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: !canLog(), onclick: () => openSheet(P) }, 'Start the clock'));
  rc($('#heroAct'), btns);
  renderWatch(L);
}
function renderWatch(L) {
  const st = L.R.state, now = L.now, line = L.R.line, items = [], done = new Set();
  const row = o => h('div', { class: 'watch' + (o.urgent ? ' urgent' : '') },
    h('i', { class: 'w-dot', 'aria-hidden': 'true' }),
    h('div', { class: 'w-t' }, h('b', null, o.title), h('span', null, o.sub)),
    o.until ? h('span', { class: 'w-clock', 'data-until': String(o.until), title: 'Time until the press stops' }, mmss(o.until - now)) : h('span'),
    h('div', { class: 'w-act' }, o.actions));
  const what = s => s.state + (evText(s) ? ' · ' + evText(s) : '');
  for (const m of machines()) {
    if (m.main) continue;
    const s = st[m.name]; if (!s || s.run) continue;
    if (m.rule === 'optional' && !s.stop) {
      items.push(row({ title: m.name + ': ' + what(s), sub: 'Line still running', since: s.downSince,
        actions: [actBtn('Stop the press', 'btn btn-sm btn-stop', b => setPressStop(m.name, true, b)), backBtn(m.name, 'btn btn-sm btn-go')] }));
    } else if (m.rule === 'group') {
      const g = groupOf(m.name); if (!g || done.has(g.name)) continue;
      if (line.group && line.group.name === g.name) { done.add(g.name); continue; }
      const ss = g.members.map(x => st[x]), allDown = ss.every(x => x && !x.run);
      if (allDown) {
        done.add(g.name);
        const trig = Math.max(...ss.map(x => x.downSince)) + g.delay * MIN;
        items.push(row({ urgent: true, title: andList(g.members) + ' are ' + (g.members.length === 2 ? 'both' : 'all') + ' down', sub: 'Press stops at ' + hm(trig), until: trig,
          actions: [bothBackBtn(g, 'btn btn-sm btn-go'), ...g.members.map(x => backBtn(x, 'btn btn-sm'))] }));
      } else {
        const others = g.members.filter(x => x !== m.name);
        items.push(row({ title: m.name + ': ' + what(s), sub: 'Line still running', since: s.downSince,
          actions: [backBtn(m.name, 'btn btn-sm btn-go')] }));
      }
    }
  }
  rc($('#heroWatch'), items);
}
const ICON = {
  state: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  alarm: '<path d="M12 4 2.5 20h19L12 4z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  mode: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/>',
  run: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  down: '<path d="M7 3h10M7 21h10M8 3v3.5l4 5.5-4 5.5V21M16 3v3.5L12 12l4 5.5V21"/>',
  stops: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  cause: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  bell: '<path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15L6 16z"/><path d="M10 21h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
};
function ico(k) { const sp = document.createElement('span'); sp.className = 'ico'; sp.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>'; return sp; }
const irow = (k, label, value) => h('div', { class: 'irow' }, ico(k), h('span', null, label, h('b', null, value)));
const dtile = (k, label, value) => h('div', { class: 'dtile' }, ico(k), h('span', null, label, h('b', null, value)));
function setPill(el, k, text) { el.className = 'spill k-' + k; rc(el, h('i'), text); }
function gaugeEl(p, label) {
  const r = 52, c = 2 * Math.PI * r, arc = c * 0.75, v = p == null ? 0 : Math.max(0, Math.min(1, p));
  const box = h('div', { class: 'gauge', role: 'img', 'aria-label': label + ' ' + (p == null ? 'not available yet' : Math.round(v * 100) + '%') });
  box.innerHTML = '<svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + arc.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(135 70 70)"/>' +
    (v > 0 ? '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="var(--run)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (arc * v).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(135 70 70)"/>' : '') + '</svg>';
  box.append(h('div', { class: 'g-v' }, h('b', null, p == null ? '–' : Math.round(v * 100) + '%'), h('small', null, label)));
  return box;
}
/* simple line drawings of each machine type */
const ART = {
  press: '<rect x="14" y="94" width="172" height="8" rx="3"/><rect x="24" y="34" width="34" height="60" rx="4"/><rect x="142" y="34" width="36" height="60" rx="4"/><path d="M58 44h84M58 84h84"/><rect x="70" y="52" width="34" height="24" rx="5" class="f"/><rect x="108" y="56" width="34" height="16" rx="3"/><path d="M58 64h12"/>',
  feed: '<path d="M10 82h180"/><circle cx="24" cy="88" r="6"/><circle cx="52" cy="88" r="6"/><circle cx="80" cy="88" r="6"/><circle cx="108" cy="88" r="6"/><circle cx="136" cy="88" r="6"/><circle cx="164" cy="88" r="6"/><rect x="16" y="64" width="46" height="16" rx="8" class="f"/><rect x="70" y="64" width="46" height="16" rx="8" class="f"/><rect x="124" y="64" width="46" height="16" rx="8" class="f"/><path d="M150 38h36v26h-36z"/>',
  puller: '<path d="M8 90h184M8 98h184"/><path d="M8 62h76" stroke-width="5"/><rect x="80" y="40" width="58" height="42" rx="8" class="f"/><path d="M84 56h10M84 68h10"/><circle cx="94" cy="90" r="6"/><circle cx="126" cy="90" r="6"/><path d="M138 52h30v20h-30"/>',
  stretcher: '<path d="M8 96h184"/><rect x="16" y="40" width="40" height="52" rx="6" class="f"/><rect x="144" y="40" width="40" height="52" rx="6" class="f"/><path d="M56 66h88" stroke-width="5"/><path d="M78 52l-10 0M68 52l5-4M68 52l5 4M122 52h10M132 52l-5-4M132 52l-5 4"/>',
  table: '<path d="M14 62h172l-10 14H24z" class="f"/><path d="M30 76v24M100 76v24M170 76v24"/><path d="M26 54h150M32 46h140M38 38h128" stroke-width="3"/><circle cx="56" cy="88" r="6"/><circle cx="144" cy="88" r="6"/>',
  other: '<rect x="40" y="36" width="120" height="58" rx="8" class="f"/><path d="M20 100h160"/><circle cx="100" cy="65" r="14"/><path d="M100 45v6M100 79v6M80 65h6M114 65h6"/>'
};
function artKind(n) { n = n.toLowerCase(); return /press/.test(n) ? 'press' : /feed|billet|furnace|log/.test(n) ? 'feed' : /pull/.test(n) ? 'puller' : /stretch/.test(n) ? 'stretcher' : /zpe|table|cool|saw|stack|run.?out/.test(n) ? 'table' : 'other'; }
function artEl(name, k) { const d = h('div', { class: 'art k-' + k }); d.innerHTML = '<svg viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ART[artKind(name)] + '</svg>'; return d; }
function mStatus(m, e, line) {
  if (!e) return { k: 'unk', label: 'Not logged' };
  if (e.run) return { k: 'run', label: 'Running' };
  const causing = m.main || line.machine === m.name || (line.group && line.group.members.includes(m.name));
  return causing ? { k: 'down', label: 'Down · ' + e.state } : { k: 'warn', label: 'Issue · line running' };
}
function ruleText(m) { const g = m.rule === 'group' ? groupOf(m.name) : null; return m.main ? 'Main machine' : g ? g.name + ' pair' : m.rule === 'optional' ? 'Line keeps running' : 'Stops the line'; }
function machineShift(L, m) {
  const g = m.rule === 'group' ? groupOf(m.name) : null, keys = g ? [m.name, g.name] : [m.name];
  const cs = L.st.causes.filter(c => keys.includes(c.machine));
  const evs = L.D.events.filter(e => e.machine === m.name && !e.run && e.at >= L.shift.start && e.at <= L.now);
  const al = {}; evs.forEach(e => { const a = e.alarm === OTHER ? (e.note || OTHER) : (e.alarm || e.state); al[a] = (al[a] || 0) + 1; });
  const top = Object.entries(al).sort((a, b) => b[1] - a[1])[0];
  return { ms: cs.reduce((a, c) => a + c.ms, 0), stops: cs.reduce((a, c) => a + c.n, 0), issues: evs.length, top: top ? top[0] : '—' };
}
function renderMachines(L) {
  const line = L.R.line;
  const all = machines().map(m => { const e = L.R.state[m.name] || null; return { m, e, st: mStatus(m, e, line) }; });
  const isDown = x => x.st.k === 'down' || x.st.k === 'warn';
  const n = { all: all.length, down: all.filter(isDown).length, run: all.filter(x => x.st.k === 'run').length };
  const view = S.mview === 'list' ? 'list' : 'grid', f = ['all', 'down', 'run'].includes(S.mfilter) ? S.mfilter : 'all';
  const vbtn = (v, label) => h('button', { type: 'button', class: 'vbtn', 'aria-pressed': String(view === v), 'aria-label': label + ' view', onclick: () => { S.mview = v; LS.set('mview', v); renderAll(); } }, ico(v), v === 'grid' ? label : null);
  const fbtn = (v, label) => h('button', { type: 'button', class: 'fpill', 'aria-pressed': String(f === v), onclick: () => { S.mfilter = v; LS.set('mfilter', v); renderAll(); } }, ico('filter'), label, h('small', null, String(n[v])));
  rc($('#mTools'), h('div', { class: 'vtoggle', role: 'group', 'aria-label': 'View' }, vbtn('grid', 'Grid'), vbtn('list', 'List')),
    h('div', { class: 'fpills', role: 'group', 'aria-label': 'Show' }, fbtn('all', 'All machines'), fbtn('down', 'Down'), fbtn('run', 'Running')));
  const list = all.filter(x => f === 'all' || (f === 'down' ? isDown(x) : x.st.k === 'run'));
  const box = $('#tiles');
  box.className = view === 'list' ? 'tiles' : 'mcards';
  if (!list.length) { rc(box, h('p', { class: 'muted empty-line' }, f === 'down' ? 'No machine is down right now.' : 'No machine is running right now.')); return; }
  rc(box, list.map(x => view === 'list' ? tileEl(x) : cardEl(x, L)));
}
function tileEl({ m, e, st }) {
  const color = st.k === 'run' ? 'var(--run)' : st.k === 'down' ? 'var(--down)' : st.k === 'warn' ? 'var(--warn)' : 'var(--axis)';
  return h('button', { type: 'button', class: 'mtile k-' + st.k, onclick: () => openSheet(m.name), 'aria-label': m.name + ': ' + (e ? e.state + (e.alarm ? ', ' + e.alarm : '') : 'not logged') + '. Open.' },
    h('span', { class: 'mt-name' }, m.name),
    h('span', { class: 'mt-state', style: '--c:' + color }, h('i'), h('span', null, e ? (e.alarm && !e.run ? e.alarm : e.state) : 'Not logged')));
}
function cardEl({ m, e, st }, L) {
  const ms = machineShift(L, m), d = hmParts(ms.ms);
  const pill = h('span'); setPill(pill, st.k, st.label);
  return h('article', { class: 'card mc k-' + st.k, onclick: ev => { if (!ev.target.closest('button')) openSheet(m.name); } },
    h('div', { class: 'card-h' },
      h('div', { class: 'card-t' }, h('h3', null, m.name), h('span', { class: 'rtag' }, ruleText(m))),
      pill,
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openSheet(m.name) }, 'Open')),
    h('div', { class: 'mc-b' },
      artEl(m.name, st.k),
      h('div', { class: 'col' }, h('p', { class: 'col-t' }, 'Machine info'), h('div', { class: 'irows' },
        irow('state', 'State', e ? e.state : 'Not logged'),
        irow('alarm', 'Alarm', e && !e.run ? ((e.alarm === OTHER ? e.note : e.alarm) || '—') : '—'),
        irow('mode', 'Mode', e ? (e.mode || 'Not set') : '—'),
        irow('user', 'Logged by', e ? whoText(e) || '—' : '—'))),
      h('div', { class: 'dbox' }, h('p', { class: 'col-t' }, 'This shift'), h('div', { class: 'dtiles' },
        dtile('stops', 'Line stops', String(ms.stops)),
        dtile('down', 'Line downtime', d[0] + ' ' + d[1]),
        dtile('bell', 'Issues logged', String(ms.issues)),
        dtile('alarm', 'Most common', ms.top)))));
}
function kpiEl(l, v, u, s, meter) {
  return h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, l), h('span', { class: 'kpi-v' }, v, u ? h('small', null, u) : null),
    meter != null ? h('span', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(0, Math.min(100, meter * 100)).toFixed(1) + '%' })) : null,
    s ? h('span', { class: 'kpi-s' }, s) : null);
}
function hmParts(ms) { const m = Math.max(0, Math.round(ms / MIN)); return m < 60 ? [String(m), 'min'] : [Math.floor(m / 60) + ':' + pad(m % 60), 'h']; }
const causeLabel = c => c.machine + ' · ' + c.state;
function segTip(s) {
  const head = s.run === true ? 'Running' : s.run == null ? 'Not logged' : 'Downtime';
  const extra = [s.alarm, s.note].filter(Boolean).join(' · ');
  return head + (s.machine ? ': ' + s.machine + ' · ' + s.state : '') + (s.mode ? ' (' + s.mode + ')' : '') + '\n' + hm(s.start) + '–' + hm(s.end) + ' · ' + fmtDur(s.end - s.start) + (extra ? '\n' + extra : '');
}
function renderTimeline(box, segs, from, to, now) {
  const span = Math.max(1, to - from), pct = t => Math.max(0, Math.min(100, (t - from) / span * 100));
  const els = segs.filter(s => s.end > from && s.start < to).map(s => {
    const a = pct(s.start), b = pct(Math.min(s.end, now)), col = segColor(s);
    return h('div', { class: 'tl-seg' + (col ? '' : ' unk'), style: 'left:' + a.toFixed(3) + '%;width:' + Math.max(0.12, b - a).toFixed(3) + '%' + (col ? ';background:' + col : ''), 'data-tip': segTip(s) });
  });
  const nowP = pct(now);
  const ticks = [], spanH = span / HOUR, stepH = spanH <= 8 ? 1 : spanH <= 14 ? 2 : spanH <= 26 ? 4 : 12;
  const t0 = new Date(from); t0.setMinutes(0, 0, 0); let t = +t0; if (t < from) t += HOUR;
  while (t <= to) { if (new Date(t).getHours() % stepH === 0) ticks.push(t); t += HOUR; }
  const xs = uniq([from, ...ticks]).map((x, i, arr) => h('span', { class: [x === from ? 'first' : '', i === arr.length - 1 && pct(x) > 96 ? 'last' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ') || null, style: 'left:' + pct(x).toFixed(3) + '%' }, hm(x)));
  rc(box,
    h('div', { class: 'tl-wrap' }, h('div', { class: 'tl-bar' }, els, nowP < 100 ? h('div', { class: 'tl-future', style: 'left:' + nowP.toFixed(3) + '%' }) : null),
      nowP < 100 ? h('div', { class: 'tl-now', style: 'left:' + nowP.toFixed(3) + '%', 'data-tip': 'Now ' + hm(now) }) : null),
    h('div', { class: 'tl-x' }, xs));
}
function entryRow(e, dur, ongoing) {
  const run = isRunState(e.machine, e.state, e.run);
  return h('button', { type: 'button', class: 'erow', 'data-id': e.id },
    h('span', { class: 'e-time' }, hm(e.at)),
    h('span', { class: 'e-main' }, h('span', { class: 'e-m' }, e.machine), stateChip(e.machine, e.state, run), e.mode ? h('span', { class: 'e-mode' }, e.mode) : null, e.stop && !run ? h('span', { class: 'tag' }, 'Press stopped') : null),
    h('span', { class: 'e-note' }, e.alarm ? h('span', { class: 'e-alarm' }, e.alarm) : null, e.alarm && e.note ? ' · ' : null, e.note || null, e.code ? h('code', { class: 'code' }, e.code) : null),
    h('span', { class: 'e-dur' }, ongoing ? h('span', { class: 'live-dot', title: 'Still in this state' }) : null, dur != null ? fmtDur(dur) : ''),
    h('span', { class: 'e-by' }, whoEl(e)));
}

/* ================= ANALYSIS ================= */
function bucketsFor(from, to) {
  const span = to - from, out = [];
  if (span <= 26 * HOUR) { const d = new Date(from); d.setMinutes(0, 0, 0); for (let s = +d; s < to; s += HOUR) out.push({ s, e: s + HOUR, label: hm(s), unit: 'hour' }); }
  else if (span <= 32 * DAY) { let d = new Date(from); d.setHours(0, 0, 0, 0); while (+d < to) { const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); out.push({ s: +d, e: +n, label: fmtDate(+d), unit: 'day' }); d = n; } }
  else { let d = new Date(from); d.setHours(0, 0, 0, 0); while (+d < to) { const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7); out.push({ s: +d, e: +n, label: fmtDate(+d), unit: 'week' }); d = n; } }
  return out;
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function renderAnalysis() {
  buildSeg('aRange', RANGES, S.arange, v => { S.arange = v; LS.set('arange', v); renderAll(); });
  const b = rangeBounds(S.arange), D = getData(b.from);
  const empty = $('#anEmpty'), body = $('#anBody');
  if (!D.ready) { empty.hidden = false; body.hidden = true; rc(empty, h('p', { class: 'empty-t' }, S.conn === 'offline' ? "The shared log isn't available here." : 'Loading ' + b.phrase + '…')); return; }
  const R = replay(D.seeds, D.events, b.from, b.to), st = segStats(R.segs);
  if (st.run + st.down <= 0) { empty.hidden = false; body.hidden = true; rc(empty, h('p', { class: 'empty-t' }, 'Nothing logged in ' + b.phrase + '.'), h('p', { class: 'empty-s' }, 'Log entries from the Shift tab. This page fills in from them.')); return; }
  empty.hidden = true; body.hidden = false;
  $('#anKicker').textContent = b.phrase.replace(/^./, c => c.toUpperCase()) + (useExample() ? ' · example data' : '');
  const head = $('#anHead'), sub = $('#anSub');
  if (st.causes.length) {
    const top = st.causes[0], pct = Math.round(top.ms / (st.down || 1) * 100);
    rc(head, h('span', { class: 'hl' }, top.state), ' on the ' + top.machine + ' is ' + pct + '% of the downtime.');
    sub.textContent = 'The line ran ' + (st.avail * 100).toFixed(1) + '% of the logged time. ' + plural(st.stops, 'stop') + ' added up to ' + fmtDur(st.down) + ' of downtime' + (st.unk >= HOUR ? ', with ' + fmtDur(st.unk) + ' not logged' : '') + '.';
  } else { head.textContent = 'No downtime in ' + b.phrase + '.'; sub.textContent = 'The line ran the whole logged time.'; }
  const find = re => st.causes.filter(c => re.test(c.state));
  const dc = find(/die change/i), dcN = dc.reduce((t, c) => t + c.n, 0), dcMs = dc.reduce((t, c) => t + c.ms, 0);
  const fl = st.causes.filter(c => !/die change|first profile/i.test(c.state)), flN = fl.reduce((t, c) => t + c.n, 0), flMs = fl.reduce((t, c) => t + c.ms, 0);
  const days = Math.max(1, (b.to - b.from) / DAY);
  rc($('#anKpis'),
    kpiEl('Extrusion', fmtH(st.run), 'h', 'running time'),
    kpiEl('Downtime', fmtH(st.down), 'h', plural(st.stops, 'stop')),
    kpiEl('Availability', st.avail == null ? '–' : (st.avail * 100).toFixed(1), '%', 'extrusion ÷ logged time', st.avail),
    kpiEl('Stops', String(st.stops), '', days >= 2 ? (st.stops / days).toFixed(1) + ' per day' : 'in this period'),
    dcN ? kpiEl('Avg die change', String(Math.round(dcMs / dcN / MIN)), 'min', plural(dcN, 'die change')) : kpiEl('Die changes', '0', '', 'in this period'),
    flN ? kpiEl('MTTR', String(Math.round(flMs / flN / MIN)), 'min', plural(flN, 'breakdown') + ', die changes excluded') : kpiEl('MTTR', '–', '', 'no breakdowns'));
  renderPareto(st); renderTrend(R, b); renderIssues(R); renderModes(st); renderByShift(R, b, st);
}
function renderPareto(st) {
  const box = $('#anPareto');
  if (!st.causes.length) { rc(box, h('p', { class: 'muted' }, 'No downtime in this period.')); return; }
  const total = st.down || 1, max = st.causes[0].ms || 1;
  const out = [h('div', { class: 'pr pr-h', 'aria-hidden': 'true' }, h('span', { class: 'pr-l' }, 'Cause'), h('span', { class: 'pr-track' }), h('span', { class: 'pr-v' }, 'Downtime'), h('span', { class: 'pr-c' }, 'Cum.'))];
  let cum = 0, cut = false;
  st.causes.forEach((c, i) => {
    const before = cum / total; cum += c.ms;
    const vital = before < 0.8;
    if (!vital && !cut && i > 0) { out.push(h('div', { class: 'pr-cut' }, h('span', null, 'above the line: ' + Math.round(before * 100) + '% of downtime'))); cut = true; }
    const col = causeColor(c.machine, c.state);
    out.push(h('div', { class: 'pr' + (vital ? ' vital' : '') },
      h('div', { class: 'pr-l' }, h('span', { class: 'pr-name' }, c.state), h('span', { class: 'pr-sub' }, c.machine + ' · ' + plural(c.n, 'stop') + ' · avg ' + fmtDur(c.ms / c.n))),
      h('div', { class: 'pr-track' }, h('div', { class: 'pr-bar', style: 'width:' + Math.max(0.8, c.ms / max * 100).toFixed(2) + '%;background:' + col, 'data-tip': causeLabel(c) + '\n' + fmtDur(c.ms) + ' · ' + plural(c.n, 'stop') + ' · avg ' + fmtDur(c.ms / c.n) + '\nLongest: ' + fmtDur(c.longest) })),
      h('div', { class: 'pr-v' }, fmtDur(c.ms)),
      h('div', { class: 'pr-c' }, Math.round(cum / total * 100) + '%')));
  });
  rc(box, out);
}
function renderTrend(R, b) {
  const B = bucketsFor(b.from, b.to), unit = B.length ? B[0].unit : 'day';
  const vals = B.map(() => ({ total: 0, c: {} }));
  for (const s of R.segs) {
    if (s.run !== false) continue;
    const k = s.machine + '|' + s.state;
    for (let i = 0; i < B.length; i++) { const ov = Math.min(B[i].e, s.end) - Math.max(B[i].s, s.start); if (ov > 0) { vals[i].total += ov; vals[i].c[k] = (vals[i].c[k] || 0) + ov; } }
  }
  const inMin = unit === 'hour', div = inMin ? MIN : HOUR, u = inMin ? ' min' : ' h';
  const maxV = niceMax(Math.max(0, ...vals.map(v => v.total / div)));
  $('#trSub').textContent = 'Downtime per ' + unit + ', stacked by cause, in ' + (inMin ? 'minutes.' : 'hours.');
  const keysAll = uniq(R.segs.filter(s => s.run === false).map(s => s.machine + '|' + s.state)).sort((a, c) => causeRank(a) - causeRank(c));
  const grid = [0, 0.5, 1].map(f => h('div', { class: 'tr-grid', style: 'bottom:' + (f * 100) + '%' }, h('span', null, String(+(maxV * f).toFixed(2)) + u)));
  const cols = vals.map((v, i) => {
    const keys = keysAll.filter(k => v.c[k]);
    const tip = (B[i].unit === 'week' ? 'Week of ' : '') + (B[i].unit === 'hour' ? fmtDay(B[i].s) + ' ' : '') + B[i].label + '\n' + (v.total ? fmtDur(v.total) + ' downtime' : 'No downtime') + keys.slice(0, 6).map(k => '\n' + k.replace('|', ' · ') + ': ' + fmtDur(v.c[k])).join('');
    return h('div', { class: 'tr-col', 'data-tip': tip }, h('div', { class: 'tr-stack', style: 'height:' + (v.total / div / maxV * 100).toFixed(2) + '%' },
      keys.map(k => { const [m, s] = k.split('|'); return h('i', { style: 'flex:' + v.c[k] + ' 1 0;background:' + causeColor(m, s) }); })));
  });
  const step = Math.max(1, Math.ceil(B.length / 6)), xl = [];
  for (let i = 0; i < B.length; i += step) xl.push(h('span', { style: 'left:' + ((i + 0.5) / B.length * 100).toFixed(2) + '%' }, B[i].label));
  rc($('#anTrend'), h('div', { class: 'tr-plot' }, grid, h('div', { class: 'tr-cols' }, cols)), h('div', { class: 'tr-x' }, xl));
  rc($('#trLegend'), keysAll.map(k => { const [m, s] = k.split('|'); return h('span', { class: 'lg' }, h('i', { class: 'sw', style: 'background:' + causeColor(m, s) }), m + ' · ' + s); }));
}
function stoppedOverlap(segs, iv, m) {
  let lo = 0, hi = segs.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].end <= iv.start) lo = mid + 1; else hi = mid; }
  const g = m.rule === 'group' ? groupOf(m.name) : null;
  let s = 0;
  for (let i = lo; i < segs.length && segs[i].start < iv.end; i++) {
    const x = segs[i];
    if (x.run !== false || !(x.machine === m.name || (g && x.group === g.name))) continue;
    const ov = Math.min(x.end, iv.end) - Math.max(x.start, iv.start); if (ov > 0) s += ov;
  }
  return s;
}
function renderIssues(R) {
  const rows = new Map();
  for (const m of machines()) {
    let prev = null;
    for (const iv of (R.mint[m.name] || [])) {
      if (iv.run) { prev = iv; continue; }
      const al = iv.alarm || '';
      const k = m.name + '|' + iv.state + '|' + al.toLowerCase();
      let r = rows.get(k); if (!r) { r = { machine: m.name, state: iv.state, alarm: al, ms: 0, n: 0, stopped: 0 }; rows.set(k, r); }
      r.ms += iv.end - iv.start;
      if (!prev || prev.run || prev.state !== iv.state || (prev.alarm || '') !== al) r.n++;
      r.stopped += stoppedOverlap(R.segs, iv, m);
      prev = iv;
    }
  }
  const list = [...rows.values()].sort((a, b) => b.ms - a.ms).slice(0, 30);
  const box = $('#anIssues');
  if (!list.length) { rc(box, h('p', { class: 'muted' }, 'No issues in this period.')); return; }
  rc(box, h('table', { style: 'min-width:620px' },
    h('thead', null, h('tr', null, h('th', null, 'Machine'), h('th', null, 'State'), h('th', null, 'Alarm'), h('th', { class: 'num' }, 'Times'), h('th', { class: 'num' }, 'Time'), h('th', { class: 'num' }, 'Line stopped'))),
    h('tbody', null, list.map(r => h('tr', null,
      h('td', { class: 'big' }, r.machine),
      h('td', null, stateChip(r.machine, r.state, false)),
      h('td', null, r.alarm || h('span', { class: 'ran' }, '—')),
      h('td', { class: 'num big' }, String(r.n)),
      h('td', { class: 'num' }, fmtDur(r.ms)),
      h('td', { class: 'num' }, r.stopped >= MIN ? fmtDur(r.stopped) + ' (' + Math.round(r.stopped / r.ms * 100) + '%)' : h('span', { class: 'ran' }, 'Ran through')))))));
}
function renderModes(st) {
  const rows = MODES.concat(['Not set']).filter(m => st.modes[m] && (st.modes[m].run + st.modes[m].down) > 0);
  const box = $('#anModes');
  if (!rows.length) { rc(box, h('p', { class: 'muted' }, 'No modes recorded.')); return; }
  const maxD = Math.max(...rows.map(m => st.modes[m].down)) || 1;
  rc(box, h('table', { class: 't-min' },
    h('thead', null, h('tr', null, h('th', null, 'Mode'), h('th', { class: 'num' }, 'Extrusion'), h('th', { class: 'num' }, 'Downtime'), h('th', { style: 'width:30%' }, 'Share of downtime'))),
    h('tbody', null, rows.map(m => { const v = st.modes[m]; return h('tr', null, h('td', { class: 'big' }, m), h('td', { class: 'num' }, fmtDur(v.run)), h('td', { class: 'num' }, fmtDur(v.down)),
      h('td', null, h('span', { class: 'sharebar', style: 'width:' + (v.down / maxD * 100).toFixed(1) + '%', 'data-tip': m + ': ' + (st.down ? Math.round(v.down / st.down * 100) : 0) + '% of downtime' }))); }))));
}
function renderByShift(R, b, st) {
  const periods = shiftPeriods(b.from, b.to), agg = {};
  for (const p of periods) { agg[p.name] = agg[p.name] || { run: 0, down: 0, stops: 0, n: 0 }; agg[p.name].n++; }
  for (const s of R.segs) {
    if (s.run == null) continue;
    for (const p of periods) { const ov = Math.min(p.end, s.end) - Math.max(p.start, s.start); if (ov > 0) agg[p.name][s.run ? 'run' : 'down'] += ov; }
  }
  for (const o of st.occ) { const p = periods.find(x => o.start >= x.start && o.start < x.end); if (p) agg[p.name].stops++; }
  const names = uniq(shiftList().map(x => x.name)).filter(n => agg[n]);
  rc($('#anShifts'), h('table', { class: 't-min' },
    h('thead', null, h('tr', null, h('th', null, 'Shift'), h('th', { class: 'num' }, 'Extrusion'), h('th', { class: 'num' }, 'Downtime'), h('th', { class: 'num' }, 'Avail.'), h('th', { class: 'num' }, 'Stops'))),
    h('tbody', null, names.map(n => { const v = agg[n], tot = v.run + v.down; return h('tr', null, h('td', { class: 'big' }, n, h('span', { class: 'muted', style: 'font:400 .78rem var(--f-body);margin-left:6px' }, plural(v.n, 'shift'))), h('td', { class: 'num' }, fmtDur(v.run)), h('td', { class: 'num' }, fmtDur(v.down)), h('td', { class: 'num' }, tot ? (v.run / tot * 100).toFixed(1) + '%' : '–'), h('td', { class: 'num' }, String(v.stops))); }))));
}

/* ================= HISTORY ================= */
function historyList(b, D) { return D.events.filter(e => e.at >= b.from && e.at <= b.to && (!S.hmachine || e.machine === S.hmachine)).sort((a, c) => byAt(c, a)); }
function renderHistory() {
  buildSeg('hRange', RANGES.filter(r => r.id !== '90d'), S.hrange, v => { S.hrange = v; LS.set('hrange', v); $('#csvFallback').hidden = true; renderAll(); });
  setOptions('#hMachine', [['', 'All machines'], ...machines().map(m => [m.name, m.name])], S.hmachine);
  const b = rangeBounds(S.hrange), D = getData(b.from);
  const box = $('#hList'), empty = $('#hEmpty');
  if (!D.ready) { box.hidden = true; empty.hidden = false; rc(empty, h('p', { class: 'empty-t' }, S.conn === 'offline' ? "The shared log isn't available here." : 'Loading ' + b.phrase + '…')); $('#hCount').textContent = ''; return; }
  const list = historyList(b, D);
  const next = nextMap(D.events.concat(Object.values(D.seeds || {})));
  $('#hCount').textContent = (list.length === 1 ? '1 entry' : list.length + ' entries') + ' in ' + b.phrase + (useExample() ? ' · example data' : '') + '. ' + (isAdmin() ? 'Select an entry to correct it.' : 'Select one of your entries to correct it.');
  if (!list.length) { box.hidden = true; empty.hidden = false; rc(empty, h('p', { class: 'empty-t' }, 'No entries in ' + b.phrase + '.')); return; }
  empty.hidden = true; box.hidden = false;
  const now = Date.now(), out = []; let day = '';
  for (const e of list.slice(0, 600)) {
    const d = fmtDay(e.at);
    if (d !== day) { out.push(h('div', { class: 'dayhead' }, d)); day = d; }
    out.push(entryRow(e, (next[e.id] || now) - e.at, !next[e.id]));
  }
  if (list.length > 600) out.push(h('p', { class: 'muted', style: 'padding:12px 4px' }, 'Showing the newest 600 entries. Export the CSV for the rest.'));
  rc(box, out);
  fillNames(box);
}
const csvTime = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const csvEsc = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function buildTimelineCsv() {
  const b = rangeBounds(S.hrange), D = getData(b.from); if (!D.ready) return '';
  const R = replay(D.seeds, D.events, b.from, Math.min(b.to, Date.now()));
  const g = S.hmachine ? groupOf(S.hmachine) : null;
  const segs = R.segs.filter(s => !S.hmachine || s.machine === S.hmachine || (g && g.name === s.group));
  const head = ['Start', 'End', 'Minutes', 'Line', 'Shift', 'Machine', 'State', 'Alarm', 'Mode', 'Notes', 'Logged by'];
  const rows = segs.map(s => [csvTime(s.start), csvTime(s.end), Math.round((s.end - s.start) / MIN), s.run === true ? 'Running' : s.run === false ? 'Downtime' : 'Not logged', shiftBounds(s.start).name, s.machine, s.state, s.alarm, s.mode, s.note, s.personName || (s.uid ? nameOf(s.uid) : '')]);
  return [head, ...rows].map(r => r.map(csvEsc).join(',')).join('\r\n');
}
function buildEntriesCsv() {
  const b = rangeBounds(S.hrange), D = getData(b.from); if (!D.ready) return '';
  const list = historyList(b, D).slice().reverse(), next = nextMap(D.events.concat(Object.values(D.seeds || {}))), now = Date.now();
  const head = ['Time', 'Shift', 'Machine', 'State', 'Running or issue', 'Alarm', 'Mode', 'Press stopped', 'Notes', 'Minutes in state', 'Logged by'];
  const rows = list.map(e => { const run = isRunState(e.machine, e.state, e.run); return [csvTime(e.at), shiftBounds(e.at).name, e.machine, e.state, run ? 'Running' : 'Issue', e.alarm, e.mode, !run && e.stop ? 'yes' : '', [e.note, e.code].filter(Boolean).join(' '), Math.round(((next[e.id] || now) - e.at) / MIN), whoText(e)]; });
  return [head, ...rows].map(r => r.map(csvEsc).join(',')).join('\r\n');
}
function showCsvFallback(csv) { const t = $('#csvFallback'); t.value = csv; t.hidden = false; t.focus(); t.select(); }
function exportCsv(kind) {
  const csv = kind === 'timeline' ? buildTimelineCsv() : buildEntriesCsv();
  if (!csv) { toast('Wait for the history to load.'); return; }
  try { saveFile('extrusion-' + kind + '-' + ymd(Date.now()) + '.csv', new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); toast('CSV downloaded'); }
  catch (x) { showCsvFallback(csv); toast('Copy the CSV text below into Excel.'); }
}

/* ================= ADMIN ================= */
const RULES = [['main', 'Main machine: sets the line state'], ['always', 'Stops the line right away'], ['optional', 'Line keeps running unless the press is stopped'], ['group', 'Group: stops only when all are down']];
function draftFromConfig(c) {
  return {
    machines: c.machines.map(m => ({ name: m.name, rule: m.main ? 'main' : (m.rule || 'always'), group: m.group || '', delay: m.delay != null ? m.delay : 5,
      run: (m.states.find(s => s.run) || { name: 'Auto' }).name,
      down: m.states.filter(s => !s.run).map(s => ({ name: s.name, alarms: (s.alarms || []).slice(), add: '' })) })),
    shifts: c.shifts.map(s => ({ name: s.name, start: s.start }))
  };
}
function configFromDraft(d) {
  const ms = d.machines;
  if (!ms.length) throw 'Add at least one machine.';
  if (ms.length > 10) throw 'Keep it to 10 machines or fewer.';
  const names = ms.map(m => m.name.trim());
  if (names.some(n => !n)) throw 'Every machine needs a name.';
  if (names.some(n => n.length > 30)) throw 'Machine names can be up to 30 characters.';
  if (uniq(names.map(n => n.toLowerCase())).length !== names.length) throw 'Two machines have the same name.';
  if (ms.filter(m => m.rule === 'main').length !== 1) throw 'Pick exactly one main machine. It sets the line state, normally the press.';
  const out = ms.map(m => {
    const name = m.name.trim(), run = m.run.trim();
    if (!run) throw name + ' needs a running state, like Auto.';
    const down = m.down.map(s => ({ name: s.name.trim(), alarms: cleanAlarms(s.alarms) }));
    if (!down.length) throw name + ' needs at least one downtime state, like Issue.';
    if (down.some(s => !s.name)) throw 'A state on ' + name + ' has no name.';
    const all = [run, ...down.map(s => s.name)];
    if (all.some(x => x.length > 30)) throw 'State names on ' + name + ' can be up to 30 characters.';
    if (uniq(all.map(x => x.toLowerCase())).length !== all.length) throw name + ' lists the same state twice.';
    const o = { name, main: m.rule === 'main', rule: m.rule, states: [runSt(run), ...down.map(s => dnSt(s.name, s.alarms))] };
    if (m.rule === 'group') {
      const g = String(m.group || '').trim(); if (!g) throw name + ' needs a group name.';
      const dl = Number(m.delay); if (!Number.isInteger(dl) || dl < 0 || dl > 120) throw 'The group delay on ' + name + ' must be a whole number from 0 to 120 minutes.';
      o.group = g.slice(0, 30); o.delay = dl;
    }
    return o;
  });
  const gc = {}; out.forEach(m => { if (m.rule === 'group') gc[m.group] = (gc[m.group] || 0) + 1; });
  for (const [g, n] of Object.entries(gc)) {
    if (n < 2) throw 'Group ' + g + ' needs at least two machines.';
    if (out.some(m => m.name.toLowerCase() === g.toLowerCase())) throw 'Group ' + g + ' has the same name as a machine. Pick another group name.';
  }
  const sh = d.shifts.map(s => ({ name: String(s.name || '').trim(), start: String(s.start || '').trim() }));
  if (!sh.length) throw 'Add at least one shift.';
  for (const s of sh) { if (!s.name) throw 'Every shift needs a name.'; if (toMin(s.start) == null) throw 'Shift ' + s.name + ' needs a start time.'; }
  if (uniq(sh.map(s => toMin(s.start))).length !== sh.length) throw 'Two shifts start at the same time.';
  return { machines: out, shifts: sh.map(s => { const mn = toMin(s.start); return { name: s.name.slice(0, 30), start: pad(Math.floor(mn / 60)) + ':' + pad(mn % 60) }; }) };
}
function renderAdmin() {
  const sig = JSON.stringify(S.config);
  if (!S.draft || (!S.draftDirty && S.draftSig !== sig)) { S.draft = draftFromConfig(S.config); S.draftSig = sig; S.edVer++; }
  if (S.edDrawn !== S.edVer) { drawMachines(); drawShifts(); S.edDrawn = S.edVer; }
  renderPeople(); renderSessions(); renderSaveBar();
  $('#exToggle').textContent = useExample() ? 'Hide example data' : 'Show example data';
}
function markDirty() { S.draftDirty = true; renderSaveBar(); }
function renderSaveBar() { $('#saveBar').hidden = !S.draftDirty; }
function redrawEditor() { S.edVer++; drawMachines(); drawShifts(); S.edDrawn = S.edVer; }
function drawMachines() {
  const ms = S.draft.machines;
  rc($('#admMachines'), ms.map((m, i) => h('div', { class: 'mcard', 'data-m': String(i) },
    h('div', { class: 'mc-head' },
      h('input', { type: 'text', 'data-f': 'name', value: m.name, maxlength: '30', 'aria-label': 'Machine name', placeholder: 'Machine name' }),
      h('div', { class: 'mc-tools' },
        h('button', { type: 'button', class: 'ibtn', 'data-act': 'up', disabled: i === 0, 'aria-label': 'Move up', title: 'Move up' }, '↑'),
        h('button', { type: 'button', class: 'ibtn', 'data-act': 'down', disabled: i === ms.length - 1, 'aria-label': 'Move down', title: 'Move down' }, '↓'),
        h('button', { type: 'button', class: 'ibtn danger', 'data-act': 'delm' }, 'Delete'))),
    h('div', { class: 'row2' },
      h('label', { class: 'field' }, h('span', null, 'Effect on the line'), h('select', { 'data-f': 'rule' }, RULES.map(([v, l]) => h('option', { value: v, selected: m.rule === v }, l)))),
      h('label', { class: 'field' }, h('span', null, 'Running state'), h('input', { type: 'text', 'data-f': 'run', value: m.run, maxlength: '30', placeholder: m.rule === 'main' ? 'Extrusion' : 'Auto' }))),
    m.rule === 'group' ? h('div', { class: 'grp' },
      h('label', { class: 'field' }, h('span', null, 'Group name'), h('input', { type: 'text', 'data-f': 'group', value: m.group, maxlength: '30', placeholder: 'ZPE' })),
      h('label', { class: 'field' }, h('span', null, 'Stops after (min)'), h('input', { type: 'number', 'data-f': 'delay', value: String(m.delay), min: '0', max: '120', step: '1' }))) : null,
    h('div', { class: 'dstates' },
      h('p', { class: 'lbl' }, m.rule === 'main' ? 'Downtime states and their alarms' : 'Issue states and their alarms'),
      m.down.map((s, j) => h('div', { class: 'dstate', 'data-s': String(j) },
        h('div', { class: 'ds-head' }, h('input', { type: 'text', 'data-f': 'sname', value: s.name, maxlength: '30', 'aria-label': 'State name', placeholder: 'State name' }), h('button', { type: 'button', class: 'ibtn danger', 'data-act': 'dels', disabled: m.down.length <= 1 }, 'Remove')),
        h('div', { class: 'alist' }, h('span', { class: 'alist-l' }, s.alarms.length ? 'Alarms' : 'No alarm list'),
          s.alarms.map((a, k) => h('span', { class: 'achip' }, a, h('button', { type: 'button', 'data-act': 'dela', 'data-a': String(k), 'aria-label': 'Remove ' + a }, '×'))),
          h('span', { class: 'aadd' }, h('input', { type: 'text', 'data-f': 'add', value: s.add || '', maxlength: '40', placeholder: 'Add alarm', 'aria-label': 'New alarm' }), h('button', { type: 'button', class: 'ibtn', 'data-act': 'adda' }, 'Add'))))),
      h('div', null, h('button', { type: 'button', class: 'btn btn-sm btn-quiet', 'data-act': 'adds' }, '+ Add state'))))));
}
function drawShifts() {
  rc($('#admShifts'), S.draft.shifts.map((s, i) => h('div', { class: 'shrow dstate', 'data-sh': String(i) },
    h('input', { type: 'text', 'data-f': 'shname', value: s.name, maxlength: '30', 'aria-label': 'Shift name', placeholder: 'Shift name' }),
    h('input', { type: 'time', 'data-f': 'shstart', value: s.start, 'aria-label': 'Start time' }),
    h('button', { type: 'button', class: 'ibtn danger', 'data-act': 'delsh', disabled: S.draft.shifts.length <= 1 }, 'Remove'))));
}
function adminAct(act, el) {
  const ms = S.draft.machines, mc = el.closest('[data-m]'), i = mc ? +mc.dataset.m : -1, m = ms[i];
  const sEl = el.closest('[data-s]'), j = sEl ? +sEl.dataset.s : -1;
  let focus = null;
  if (act === 'up' && i > 0) [ms[i - 1], ms[i]] = [ms[i], ms[i - 1]];
  else if (act === 'down' && i >= 0 && i < ms.length - 1) [ms[i + 1], ms[i]] = [ms[i], ms[i + 1]];
  else if (act === 'delm') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.classList.add('armed'); el.textContent = 'Press again'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.classList.remove('armed'); el.textContent = 'Delete'; } }, 4000); return; }
    ms.splice(i, 1);
  }
  else if (act === 'adds' && m) { m.down.push({ name: '', alarms: [], add: '' }); focus = '[data-m="' + i + '"] [data-s="' + (m.down.length - 1) + '"] [data-f="sname"]'; }
  else if (act === 'dels' && m && m.down.length > 1) m.down.splice(j, 1);
  else if (act === 'dela' && m && m.down[j]) m.down[j].alarms.splice(+el.dataset.a, 1);
  else if (act === 'adda' && m && m.down[j]) {
    const s = m.down[j], v = (s.add || '').trim().slice(0, 40);
    if (!v) return;
    if (v.toLowerCase() === 'other') { toast('Other is always offered. No need to add it.'); return; }
    if (s.alarms.some(a => a.toLowerCase() === v.toLowerCase())) { toast('That alarm is already in the list.'); return; }
    if (s.alarms.length >= 60) { toast('A state can have up to 60 alarms.'); return; }
    s.alarms.push(v); s.add = '';
    focus = '[data-m="' + i + '"] [data-s="' + j + '"] [data-f="add"]';
  }
  else if (act === 'addm') { ms.push({ name: '', rule: 'always', group: '', delay: 5, run: 'Auto', down: [{ name: 'Issue', alarms: [], add: '' }] }); focus = '[data-m="' + (ms.length - 1) + '"] [data-f="name"]'; }
  else if (act === 'delsh') { const k = +el.closest('[data-sh]').dataset.sh; if (S.draft.shifts.length > 1) S.draft.shifts.splice(k, 1); }
  else if (act === 'addsh') { S.draft.shifts.push({ name: '', start: '' }); focus = '[data-sh="' + (S.draft.shifts.length - 1) + '"] [data-f="shname"]'; }
  else return;
  markDirty(); redrawEditor();
  if (focus) { const f = $(focus); if (f) f.focus(); }
}
async function saveConfig() {
  const err = $('#saveErr'); err.hidden = true;
  let cfg;
  try { cfg = configFromDraft(S.draft); } catch (x) { err.textContent = String(x); err.hidden = false; return; }
  if (!S.db) return;
  const b = $('#saveBtn'); b.disabled = true;
  try {
    await S.db.doc('config/line').set(Object.assign(cfg, { updatedAt: Date.now(), updatedBy: myUid() }));
    S.draftDirty = false; S.draftSig = ''; toast('Line setup saved'); renderAll();
  } catch (x) { err.textContent = fbMsg(x); err.hidden = false; }
  finally { b.disabled = false; }
}

/* ---------- users: approve, turn off, and (main admin only) make admins ---------- */
const PE = { sig: '' };
function renderPeople(force) {
  const sig = JSON.stringify(S.users) + '|' + isSuper() + '|' + myUid();
  if (!force && sig === PE.sig) return;
  PE.sig = sig;
  const me = myUid(), sup = isSuper();
  const isMain = u => !!u.email && u.email === SUPER;
  const btn = (label, cls, fn) => h('button', { type: 'button', class: 'btn btn-sm ' + (cls || ''), onclick: e => fn(e.currentTarget) }, label);
  const row = u => {
    const acts = [];
    const canTouch = u.id !== me && !isMain(u) && (sup || u.role !== 'admin');
    if (u.status === 'pending' && canTouch) acts.push(btn('Approve', 'btn-primary', b => setUser(u, { status: 'active', approvedBy: me, approvedAt: Date.now() }, b, u.name + ' approved')), btn('Decline', 'btn-quiet', b => setUser(u, { status: 'disabled' }, b, u.name + ' declined')));
    if (u.status === 'active' && sup && u.id !== me && !isMain(u)) acts.push(u.role === 'admin' ? btn('Remove admin', 'btn-quiet', b => setUser(u, { role: 'user' }, b, u.name + ' is a user now')) : btn('Make admin', '', b => setUser(u, { role: 'admin' }, b, u.name + ' is an admin now')));
    if (u.status === 'active' && canTouch) acts.push(btn('Turn off', 'btn-quiet', b => { if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Press again'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Turn off'; } }, 4000); return; } setUser(u, { status: 'disabled' }, b, u.name + ' turned off'); }));
    if (u.status === 'disabled' && canTouch) acts.push(btn('Turn back on', '', b => setUser(u, { status: 'active' }, b, u.name + ' turned back on')));
    return h('div', { class: 'prow' }, h('span', { class: 'avatar' }, initials(u.name)),
      h('span', { class: 'p-name' }, u.name, u.id === me ? h('small', null, 'you') : null, h('small', { style: 'display:block;margin-left:0' }, u.email)),
      h('span', null, h('span', { class: 'rchip' + (u.role === 'admin' ? ' admin' : '') }, isMain(u) ? 'Main admin' : u.role === 'admin' ? 'Admin' : 'User')),
      h('span', { class: 'form-actions', style: 'gap:6px;justify-content:flex-end' }, acts));
  };
  const by = st => S.users.filter(u => u.status === st).sort((a, c) => a.name.localeCompare(c.name));
  const pend = by('pending'), act = by('active'), off = by('disabled');
  rc($('#admPeople'),
    pend.length ? h('div', { class: 'ugroup' }, h('p', { class: 'lbl' }, 'Waiting for approval (' + pend.length + ')'), pend.map(row)) : null,
    h('div', { class: 'ugroup' }, h('p', { class: 'lbl' }, 'Active (' + act.length + ')'), act.length ? act.map(row) : h('p', { class: 'muted' }, 'Nobody yet.')),
    off.length ? h('div', { class: 'ugroup' }, h('p', { class: 'lbl' }, 'Turned off (' + off.length + ')'), off.map(row)) : null,
    h('p', { class: 'panel-sub' }, 'New people sign in with Google or email on the sign-in screen, then show up here for approval. ' + (sup ? 'Only you can make or remove admins.' : 'Only the main admin can make or remove admins.')));
}
async function setUser(u, patch, btn, msg) {
  if (btn) btn.disabled = true;
  try { await S.db.collection('users').doc(u.id).update(patch); toast(msg || 'Saved'); }
  catch (x) { toast(fbMsg(x)); if (btn) btn.disabled = false; }
}

/* ---------- clock-ins ---------- */
function subSessions(on) {
  if (on && !S.unsubSessions && S.db) {
    try {
      S.unsubSessions = S.db.collection('sessions').orderBy('clockIn', 'desc').limit(50).onSnapshot(snap => {
        S.sessions = snap.docs.map(d => normSession(d.id, d.data() || {})).filter(Boolean);
        S.sessionsLoaded = true;
        if (S.tab === 'admin') renderSessions();
      }, () => { S.sessionsLoaded = true; });
    } catch (e) {}
  }
  if (!on && S.unsubSessions) { try { S.unsubSessions(); } catch (e) {} S.unsubSessions = null; }
}
function renderSessions() {
  const box = $('#admSessions'), list = S.sessions, now = Date.now();
  if (!list.length) { rc(box, h('p', { class: 'muted' }, S.sessionsLoaded ? 'No clock-ins yet.' : 'Loading…')); return; }
  rc(box, h('table', { style: 'min-width:600px' },
    h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Date'), h('th', null, 'In'), h('th', null, 'Out'), h('th', { class: 'num' }, 'Time'), h('th', null, ''))),
    h('tbody', null, list.map(s => {
      const nm = (userById(s.uid) || {}).name || s.name, end = s.clockOut || now;
      return h('tr', null,
        h('td', { class: 'big' }, nm),
        h('td', null, fmtDay(s.clockIn)),
        h('td', { class: 'mono' }, hm(s.clockIn)),
        h('td', { class: 'mono' }, s.open ? h('span', { class: 'schip', style: '--c:var(--run)' }, h('i'), 'On shift') : (s.clockOut ? hm(s.clockOut) : '—')),
        h('td', { class: 'num' }, fmtDur(end - s.clockIn)),
        h('td', null, h('span', { class: 'form-actions', style: 'justify-content:flex-end;gap:6px' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: e => makeReport({ name: nm, from: s.clockIn, to: end, out: !s.open }, e.currentTarget) }, 'PDF'),
          s.open && !(S.session && S.session.id === s.id) ? h('button', { type: 'button', class: 'btn btn-sm btn-quiet', onclick: e => adminClockOut(s, nm, e.currentTarget) }, 'Clock out') : null)));
    }))));
}
async function adminClockOut(s, nm, btn) {
  btn.disabled = true;
  try { await S.db.collection('sessions').doc(s.id).update({ open: false, clockOut: Date.now(), closedBy: myUid() }); toast(nm + ' clocked out'); }
  catch (x) { toast(fbMsg(x)); btn.disabled = false; }
}

let untilFired = false;
function renderAll() {
  const L = liveModel(); S.L = L; untilFired = false;
  renderGate(); applyTab(); renderHeader(L); renderBanner();
  if (gateMode() !== 'none') return;
  if (S.tab === 'shift') renderShift(L);
  if (S.tab === 'analysis') renderAnalysis();
  if (S.tab === 'history') renderHistory();
  if (S.tab === 'admin' && isAdmin()) renderAdmin();
  if ($('#sheet').open) renderSheet(true);
}

/* ================= writing entries ================= */
function docFor(d, now) {
  const run = isRunState(d.machine, d.state);
  return { machine: d.machine, state: d.state, run, stop: !run && !!d.stop, mode: d.mode, at: d.at, alarm: run ? '' : (d.alarm || ''), note: d.note || '', code: '',
    uid: myUid(), personName: myName(), sessionId: S.session ? S.session.id : null, createdAt: now, updatedAt: now };
}
/* Writes go to the local cache first and sync in the background, so logging works with a weak or no connection. */
function writeEvents(items, toastText) {
  if (!S.db) return { ok: false, msg: 'Not connected to the database.' };
  if (!S.session) return { ok: false, msg: 'Clock in first.' };
  const now = Date.now(), col = S.db.collection('events');
  const refs = items.map(d => { const r = col.doc(); r.set(docFor(d, now)).catch(x => toast(fbMsg(x))); return r; });
  S.hasAny = true; S.exampleForced = false;
  toast(toastText + (S.online ? '' : ' on this device. It syncs when you are back online.'), { label: 'Undo', fn: () => { refs.forEach(r => r.delete().catch(() => {})); toast(refs.length > 1 ? 'Entries removed' : 'Entry removed'); } });
  renderAll();
  return { ok: true };
}
const writeEvent = d => writeEvents([d], d.toast || (d.machine + ': ' + d.state + (d.alarm ? ' · ' + d.alarm : '') + ' logged'));
async function quickLog(machine, state, mode, btn) {
  const cur = realCurrent(machine);
  if (btn) btn.disabled = true;
  const r = await writeEvent({ machine, state, mode: mode || (cur && cur.mode) || 'Auto', at: Date.now() });
  if (!r.ok) { toast(r.msg); if (btn) btn.disabled = false; }
}
async function groupLog(g, state, mode, btn) {
  const now = Date.now();
  const items = g.members.filter(mm => { const c = realCurrent(mm); return !(c && c.state === state && c.mode === mode); }).map(mm => ({ machine: mm, state, mode, at: now }));
  if (!items.length) { toast(andList(g.members) + ' are already ' + state + '.'); return; }
  if (btn) btn.disabled = true;
  const r = await writeEvents(items, groupLabel(g) + ': ' + state + ' logged');
  if (!r.ok) { toast(r.msg); if (btn) btn.disabled = false; }
}
function bothBackBtn(g, cls) { const t = runStateOf(g.members[0]); return actBtn(groupLabel(g) + ' back to ' + t, cls, b => groupLog(g, t, 'Auto', b)); }
async function setPressStop(machine, stop, btn) {
  const cur = realCurrent(machine);
  if (!cur || isRunState(machine, cur.state, cur.run)) { toast('The ' + machine.toLowerCase() + ' has no open issue.'); return; }
  if (btn) btn.disabled = true;
  const r = await writeEvent({ machine, state: cur.state, mode: cur.mode || 'Auto', at: Date.now(), alarm: cur.alarm, note: cur.note, stop,
    toast: stop ? 'Press stopped for ' + machine.toLowerCase() + ': ' + (cur.alarm || cur.state) : 'Press restarted. ' + machine + ' issue still open' });
  if (!r.ok) { toast(r.msg); if (btn) btn.disabled = false; }
}

/* ---------- log sheet ---------- */
const sheet = $('#sheet');
const SH = { machine: null, group: null, state: null, alarm: null, mode: null, modeTouched: false, stop: false, ago: 0, custom: false };
function sheetCurrent(m) { const L = S.L; return L && L.ready ? (L.R.state[m] || null) : null; }
function shErr(m) { const e = $('#shErr'); e.textContent = m || ''; e.hidden = !m; }
function openSheet(machine, group) {
  Object.assign(SH, { machine: machine || null, group: group || null, state: null, alarm: null, mode: null, modeTouched: false, stop: false, ago: 0, custom: false });
  $('#shText').value = ''; $('#shAt').value = toLocalInput(Date.now()); shErr('');
  renderSheet();
  if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); } else sheet.setAttribute('open', '');
}
function closeSheet() { if (typeof sheet.close === 'function') sheet.close(); else sheet.removeAttribute('open'); }
function sheetInfo(m, st) {
  const mc = cfgMachine(m), P = primary();
  if (!mc) return '';
  const run = isRunState(m, st);
  if (run) return m === P ? 'Extrusion clock starts. Downtime stops.' : (mc.rule === 'always' ? 'Clears the ' + m.toLowerCase() + ' issue. The line goes back to what the ' + P.toLowerCase() + ' is doing.' : '');
  if (mc.main) return 'Downtime until someone logs ' + runStateOf(P) + '.';
  if (mc.rule === 'always') return 'Stops the extrusion clock until the ' + m.toLowerCase() + ' is back to ' + runStateOf(m) + '.';
  if (mc.rule === 'optional') return 'Extrusion keeps running unless you stop the press. If the fix takes long, stop it here or later from the Shift screen.';
  const g = groupOf(m); if (!g) return '';
  const others = g.members.filter(x => x !== m), down = others.filter(x => { const c = sheetCurrent(x); return c && !c.run; });
  return down.length === others.length
    ? andList(others) + (others.length === 1 ? ' is' : ' are') + ' already down. If they stay down together, the press stops after ' + g.delay + ' min.'
    : 'Extrusion keeps running. The press stops only if ' + andList(g.members) + ' are all down together for ' + g.delay + ' min. Use ' + groupLabel(g) + ' if they went down together.';
}
function groupInfo(g, st) {
  if (isRunState(g.members[0], st)) return 'Logs ' + andList(g.members) + ' back to ' + st + ' at the same time. Extrusion carries on with whatever the press is doing.';
  return 'Logs ' + andList(g.members) + ' down together, one entry each. ' + (g.delay ? 'The press stops ' + g.delay + ' min after both are down unless one is back first.' : 'The press stops right away.');
}
function groupDot(g) {
  const cs = g.members.map(x => sheetCurrent(x));
  if (cs.some(c => !c)) return 'var(--axis)';
  const down = cs.filter(c => !c.run).length;
  return down === 0 ? 'var(--run)' : down === cs.length ? causeColor(g.name, groupState(g)) : 'var(--warn)';
}
function sheetAlarms() {
  if (!SH.state) return [];
  if (SH.group) { const s = groupStates(SH.group).find(x => x.name === SH.state); return s && !s.run ? (s.alarms || []) : []; }
  return SH.machine ? alarmsFor(SH.machine, SH.state) : [];
}
function renderSheet(soft) {
  const now = Date.now(), g = SH.group, m = SH.machine;
  const mc = g ? { states: groupStates(g), rule: 'groupAll' } : (m ? cfgMachine(m) : null);
  const target = g ? groupLabel(g) : m;
  const n0 = $('#shNote0');
  n0.hidden = false;
  if (S.conn !== 'live') n0.textContent = 'This copy is not connected to the database, so nothing can be saved.';
  else if (!S.session) rc(n0, 'Clock in first to log entries. ', h('button', { type: 'button', class: 'btn btn-sm btn-primary', style: 'margin-left:6px', onclick: () => { clockIn(); renderSheet(); } }, 'Clock in now'));
  else if (useExample()) n0.textContent = 'You are looking at example data. This entry is saved for real and starts your line clock.';
  else n0.hidden = true;
  $('#shKicker').textContent = (target ? 'Log a change' : 'Log a change · pick the machine') + (S.session ? ' · ' + myName() : '');
  $('#shTitle').textContent = target || 'Which machine?';
  let nowTxt;
  if (g) nowTxt = 'Now: ' + g.members.map(x => { const c = sheetCurrent(x); return x + ' ' + (c ? c.state : 'not logged'); }).join(' · ');
  else if (m) {
    const cur = sheetCurrent(m);
    if (cur) {
      const since = cur.run ? cur.at : cur.downSince;
      nowTxt = [h('span', { class: 'sh-st', style: '--c:' + (cur.run ? 'var(--run)' : 'var(--down)') }, h('i'), [cur.state, cur.alarm === OTHER ? cur.note : cur.alarm, cur.mode && cur.mode !== cur.state && cur.mode !== 'Auto' ? cur.mode : '', cur.stop && !cur.run ? 'press stopped' : ''].filter(Boolean).join(' · ')),
        h('span', { class: 'sh-clock' }, h('b', { 'data-since': String(since) }, clock(now - since)), h('small', null, 'since ' + fmtWhen(since)))];
    } else nowTxt = 'Nothing logged for this machine yet.';
  }
  else nowTxt = 'Start with the machine, then what it is doing.';
  rc($('#shNow'), nowTxt);
  renderMachineHistory(g ? g.members : m ? [m] : null);
  if (soft) return;
  $('#shMachWrap').hidden = !!target;
  if (!target) {
    const opts = [], seenG = new Set();
    for (const x of machines()) {
      const c = sheetCurrent(x.name);
      opts.push(h('button', { type: 'button', class: 'opt', style: '--c:' + (c ? (c.run ? 'var(--run)' : causeColor(x.name, c.state)) : 'var(--axis)'), onclick: () => { SH.machine = x.name; SH.group = null; SH.state = null; SH.alarm = null; renderSheet(); } },
        h('i'), h('span', { class: 'opt-t' }, x.name, h('small', null, c ? c.state + (c.mode && c.mode !== c.state ? ' · ' + c.mode : '') : 'Not logged'))));
      const gg = x.rule === 'group' ? groupOf(x.name) : null;
      if (gg && !seenG.has(gg.name) && gg.members[gg.members.length - 1] === x.name) {
        seenG.add(gg.name);
        opts.push(h('button', { type: 'button', class: 'opt', style: '--c:' + groupDot(gg), onclick: () => { SH.group = gg; SH.machine = null; SH.state = null; SH.alarm = null; renderSheet(); } },
          h('i'), h('span', { class: 'opt-t' }, groupLabel(gg), h('small', null, 'Logs ' + andList(gg.members) + ' together'))));
      }
    }
    rc($('#shMachines'), opts);
  }
  $('#shStateWrap').hidden = !target;
  const gl = m ? groupOf(m) : null;
  $('#shGroupLink').hidden = !gl;
  if (gl) $('#shGroupLink').textContent = groupLabel(gl);
  const key = g ? g.members[0] : m;
  if (target && mc) {
    $('#shStateLbl').textContent = g ? 'What are ' + andList(g.members) + ' doing now?' : 'What is the ' + m.toLowerCase() + ' doing now?';
    const isNow = s => (g ? g.members : [m]).every(x => { const c = sheetCurrent(x); return c && c.state === s.name; });
    const kindLbl = s => s.run ? 'Running' : g ? (g.members.length === 2 ? 'Both down' : 'All down') : (mc.main || mc.rule === 'always') ? 'Downtime' : 'Issue';
    rc($('#shStates'), mc.states.map(s => h('button', { type: 'button', class: 'opt', 'aria-pressed': String(SH.state === s.name), style: '--c:' + (s.run ? 'var(--run)' : causeColor(key, s.name)), onclick: () => pickState(s.name) },
      h('i'), h('span', { class: 'opt-t' }, s.name, h('small', null, kindLbl(s) + (s.alarms && s.alarms.length ? ' · ' + plural(s.alarms.length, 'alarm') : ''))), isNow(s) ? h('span', { class: 'opt-cur' }, 'Now') : null)));
  }
  const rest = !!(target && SH.state);
  const runSel = rest && isRunState(key, SH.state), down = rest && !runSel;
  const alarms = down ? sheetAlarms() : [];
  $('#shAlarmWrap').hidden = !alarms.length;
  if (alarms.length) rc($('#shAlarms'), alarms.concat([OTHER]).map(a => h('button', { type: 'button', class: 'opt', 'aria-pressed': String(SH.alarm === a), style: '--c:' + (a === OTHER ? 'var(--axis)' : causeColor(key, SH.state)), onclick: () => { SH.alarm = a; shErr(''); renderSheet(); if (a === OTHER) setTimeout(() => $('#shText').focus(), 0); } }, h('i'), h('span', { class: 'opt-t' }, a))));
  const info = rest ? (g ? groupInfo(g, SH.state) : sheetInfo(m, SH.state)) : '';
  $('#shInfo').textContent = info; $('#shInfo').hidden = !info;
  const optional = down && !g && mc && mc.rule === 'optional';
  $('#shStopWrap').hidden = !optional;
  if (optional) rc($('#shStop'),
    h('button', { type: 'button', class: 'mode', 'aria-pressed': String(!SH.stop), onclick: () => { SH.stop = false; renderSheet(); } }, 'Keep extruding'),
    h('button', { type: 'button', class: 'mode stop', 'aria-pressed': String(SH.stop), onclick: () => { SH.stop = true; renderSheet(); } }, 'Stop the press'));
  $('#shModeWrap').hidden = !rest; $('#shWhenWrap').hidden = !rest; $('#shDetail').hidden = !down;
  if (down) {
    const other = SH.alarm === OTHER;
    rc($('#shTextLbl'), other ? 'Describe the problem' : 'Notes ', other ? null : h('em', null, 'optional'));
    $('#shText').placeholder = other ? 'What is wrong, in a few words' : 'What you saw, what you already tried';
    const who = g ? g.members : [m];
    const src = (useExample() ? exampleData().events : S.live.concat(S.hist ? S.hist.events : [])).filter(e => who.includes(e.machine) && e.note);
    rc($('#shList'), uniqBy(src.map(e => e.note), x => x.toLowerCase()).slice(0, 20).map(n => h('option', { value: n })));
  }
  if (rest) {
    rc($('#shModes'), MODES.map(md => h('button', { type: 'button', class: 'mode', 'aria-pressed': String(SH.mode === md), onclick: () => { SH.mode = md; SH.modeTouched = true; renderSheet(); } }, md)));
    const opts = [[0, 'Now'], [2, '−2 min'], [5, '−5 min'], [10, '−10 min'], [15, '−15 min']];
    rc($('#shWhen'), opts.map(([a, l]) => h('button', { type: 'button', 'aria-pressed': String(!SH.custom && SH.ago === a), onclick: () => { SH.custom = false; SH.ago = a; renderSheet(); } }, l)),
      h('button', { type: 'button', 'aria-pressed': String(SH.custom), onclick: () => { SH.custom = true; renderSheet(); $('#shAt').focus(); } }, 'Other time'));
    $('#shAt').hidden = !SH.custom;
  }
  const sub = $('#shSubmit');
  sub.textContent = SH.state ? 'Log ' + SH.state + (SH.alarm && SH.alarm !== OTHER ? ': ' + SH.alarm : '') + (g ? (g.members.length === 2 ? ' on both' : ' on all') : '') + (optional && SH.stop ? ' and stop the press' : '') : (target ? 'Choose what it is doing' : 'Choose a machine');
  sub.className = 'btn btn-lg btn-block ' + (runSel ? 'btn-go' : (optional && SH.stop) ? 'btn-stop' : 'btn-primary');
  sub.disabled = !SH.state || !canLog();
}
function renderMachineHistory(who) {
  const wrap = $('#shHistWrap'), L = S.L;
  wrap.hidden = !who || !L || !L.ready;
  if (wrap.hidden) return;
  const pool = L.D.events.concat(Object.values(L.D.seeds || {}));
  const next = nextMap(uniqBy(pool, e => e.id));
  const list = uniqBy(L.D.events, e => e.id).filter(e => who.includes(e.machine) && e.at <= L.now).sort((a, b) => byAt(b, a)).slice(0, 15);
  const box = $('#shHist');
  box.classList.toggle('one', who.length === 1);
  if (!list.length) { rc(box, h('p', { class: 'muted' }, 'Nothing logged in the last day.')); return; }
  const rows = []; let day = '';
  for (const e of list) { const d = fmtDay(e.at); if (d !== day) { day = d; rows.push(h('div', { class: 'dayhead' }, d)); } rows.push(entryRow(e, (next[e.id] || L.now) - e.at, !next[e.id])); }
  rc(box, rows);
}
function pickState(stName) {
  SH.state = stName; SH.stop = false; SH.alarm = null;
  if (!SH.modeTouched) { const key = SH.group ? SH.group.members[0] : SH.machine; const cur = realCurrent(key) || sheetCurrent(key); SH.mode = isRunState(key, stName) ? 'Auto' : ((cur && cur.mode) || 'Auto'); }
  shErr(''); renderSheet();
}
async function submitSheet(e) {
  e.preventDefault(); shErr('');
  const g = SH.group, m = SH.machine, stName = SH.state;
  if ((!m && !g) || !stName) return;
  if (!canLog()) return shErr(!S.session ? 'Clock in first.' : 'Not connected to the database.');
  const now = Date.now();
  const at = SH.custom ? fromLocalInput($('#shAt').value) : now - SH.ago * MIN;
  if (!at) return shErr('Enter when it started.');
  if (at > now + MIN) return shErr('That time is in the future.');
  if (at < now - 2 * DAY) return shErr('Entries can go back up to 48 hours. For older corrections, edit the entry in History.');
  const mode = SH.mode || 'Auto', key = g ? g.members[0] : m, down = !isRunState(key, stName);
  const alarms = down ? sheetAlarms() : [];
  const note = down ? $('#shText').value.trim() : '';
  if (alarms.length && !SH.alarm) return shErr('Pick the alarm, or Other.');
  if (SH.alarm === OTHER && !note) return shErr('Describe the problem for Other.');
  const alarm = down ? (SH.alarm || '') : '';
  const btn = $('#shSubmit');
  if (g) {
    const items = [];
    for (const mm of g.members) {
      const cur = realCurrent(mm);
      if (cur && at < cur.at) return shErr('That is before the last ' + mm + ' entry at ' + fmtWhen(cur.at) + '. Pick a later time, or correct that entry in History.');
      if (cur && cur.state === stName && cur.mode === mode && (cur.alarm || '') === alarm) continue;
      items.push({ machine: mm, state: stName, mode, at, alarm, note });
    }
    if (!items.length) return shErr(andList(g.members) + ' are already in ' + stName + ', ' + mode + '.');
    btn.disabled = true;
    const r = await writeEvents(items, groupLabel(g) + ': ' + stName + (alarm ? ' · ' + alarm : '') + ' logged');
    btn.disabled = false;
    if (r.ok) closeSheet(); else shErr(r.msg);
    return;
  }
  const cur = realCurrent(m);
  const stop = down && ruleOf(m) === 'optional' && SH.stop;
  if (cur && at < cur.at) return shErr('That is before the ' + m.toLowerCase() + "'s last entry at " + fmtWhen(cur.at) + '. Pick a later time, or correct that entry in History.');
  if (cur && cur.state === stName && cur.mode === mode && !!cur.stop === stop && (cur.alarm || '') === alarm && !note) return shErr('The ' + m.toLowerCase() + ' is already in ' + stName + (alarm ? ' · ' + alarm : '') + ', ' + mode + '.');
  btn.disabled = true;
  const r = await writeEvent({ machine: m, state: stName, mode, at, stop, alarm, note });
  btn.disabled = false;
  if (r.ok) closeSheet(); else shErr(r.msg);
}

/* ---------- start-of-shift line check: the state of every machine, once, at clock-in ---------- */
const check = $('#check');
const CK = { rows: {} };
function ckErr(m) { const e = $('#ckErr'); e.textContent = m || ''; e.hidden = !m; }
function openCheck() {
  if (!canLog()) return;
  CK.rows = {};
  for (const m of machines()) {
    const cur = realCurrent(m.name), st = cur && m.states.some(x => x.name === cur.state) ? cur.state : runStateOf(m.name);
    const run = isRunState(m.name, st);
    const alarms = run ? [] : alarmsFor(m.name, st);
    const alarm = !run && cur && cur.state === st && (alarms.includes(cur.alarm) || cur.alarm === OTHER) ? cur.alarm : '';
    CK.rows[m.name] = { state: st, mode: (cur && cur.mode) || 'Auto', alarm, note: !run && cur && cur.state === st ? (cur.note || '') : '', stop: !!(cur && cur.stop && !run) };
  }
  ckErr(''); renderCheck();
  if (typeof check.showModal === 'function') { if (!check.open) check.showModal(); } else check.setAttribute('open', '');
}
function closeCheck() { if (typeof check.close === 'function') check.close(); else check.removeAttribute('open'); }
function ckRow(m) {
  const r = CK.rows[m.name], run = isRunState(m.name, r.state), alarms = run ? [] : alarmsFor(m.name, r.state);
  const color = s => s.run ? 'var(--run)' : 'var(--down)';
  const set = patch => { Object.assign(r, patch); ckErr(''); const el = $('#ck-' + CSS.escape(m.name.replace(/\s+/g, '_'))); if (el) el.replaceWith(ckRow(m)); };
  return h('div', { class: 'ck-row' + (run ? '' : ' is-down'), id: 'ck-' + m.name.replace(/\s+/g, '_') },
    h('div', { class: 'ck-head' },
      h('span', { class: 'ck-name' }, m.name),
      h('select', { class: 'ck-mode', 'aria-label': m.name + ' mode', onchange: e => { r.mode = e.target.value; } }, MODES.map(md => { const o = h('option', { value: md }, md); if (md === r.mode) o.selected = true; return o; }))),
    h('div', { class: 'chips', role: 'group', 'aria-label': m.name + ' state' }, m.states.map(s => h('button', { type: 'button', class: 'chip', style: '--c:' + color(s), 'aria-pressed': String(r.state === s.name),
      onclick: () => set({ state: s.name, alarm: '', note: '', stop: false, mode: s.run ? 'Auto' : r.mode }) }, h('i'), s.name))),
    !run && alarms.length ? h('select', { class: 'ck-alarm', 'aria-label': m.name + ' alarm', onchange: e => set({ alarm: e.target.value }) },
      [h('option', { value: '' }, 'Which alarm?')].concat(alarms.concat([OTHER]).map(a => { const o = h('option', { value: a }, a); if (a === r.alarm) o.selected = true; return o; }))) : null,
    !run && (r.alarm === OTHER || !alarms.length) ? h('input', { type: 'text', class: 'ck-note', maxlength: '120', placeholder: r.alarm === OTHER ? 'Describe the problem' : 'Notes (optional)', value: r.note, oninput: e => { r.note = e.target.value; } }) : null,
    !run && m.rule === 'optional' ? h('label', { class: 'ck-stop' }, h('input', { type: 'checkbox', checked: r.stop, onchange: e => { r.stop = e.target.checked; } }), 'Press stopped for this') : null);
}
function renderCheck() {
  rc($('#ckBody'), machines().map(ckRow));
}
async function submitCheck(e) {
  e.preventDefault(); ckErr('');
  if (!canLog()) return ckErr('Not connected to the database.');
  const now = Date.now(), items = [], snap = [];
  for (const m of machines()) {
    const r = CK.rows[m.name]; if (!r) continue;
    const run = isRunState(m.name, r.state), alarms = run ? [] : alarmsFor(m.name, r.state);
    const note = run ? '' : r.note.trim();
    if (alarms.length && !r.alarm) return ckErr('Pick the alarm for the ' + m.name.toLowerCase() + '.');
    if (r.alarm === OTHER && !note) return ckErr('Describe the problem on the ' + m.name.toLowerCase() + '.');
    const alarm = run ? '' : r.alarm;
    const stop = !run && m.rule === 'optional' && r.stop;
    snap.push({ machine: m.name, state: r.state, mode: r.mode, alarm });
    const cur = realCurrent(m.name);
    if (cur && cur.state === r.state && (cur.mode || 'Auto') === r.mode && (cur.alarm || '') === alarm && !!cur.stop === stop && (cur.note || '') === note) continue;
    items.push({ machine: m.name, state: r.state, mode: r.mode, at: now, alarm, note, stop });
  }
  if (S.session) S.db.collection('sessions').doc(S.session.id).update({ check: snap, checkedAt: now }).catch(() => {});
  closeCheck();
  if (items.length) writeEvents(items, 'Line check saved');
  else toast('Line check saved');
}

/* ---------- edit entry ---------- */
const edit = $('#edit');
let editId = null;
function findEvent(id) { const pool = useExample() ? exampleData().events : S.live.concat(S.hist ? S.hist.events : []); return pool.find(e => e.id === id) || null; }
function edErr(m) { const e = $('#edErr'); e.textContent = m || ''; e.hidden = !m; }
function fillEditAlarms(e, state) {
  const run = isRunState(e.machine, state, e.run);
  $('#edAlarmWrap').hidden = run;
  if (run) return;
  const list = uniq(['', ...alarmsFor(e.machine, state), e.alarm || '', OTHER]).filter((x, i) => i === 0 || x);
  setOptions('#ed-alarm', list.map(a => [a, a || 'None']), $('#ed-alarm').dataset.cur != null ? $('#ed-alarm').dataset.cur : (e.alarm || ''));
}
function openEdit(id) {
  const e = findEvent(id); if (!e) return;
  editId = id; edErr('');
  const ro = !canEditEntry(e);
  $('#edKicker').textContent = fmtDay(e.at) + ' · ' + hm(e.at);
  $('#edTitle').textContent = e.machine + ': ' + e.state;
  const mc = cfgMachine(e.machine);
  setOptions('#ed-state', uniq([...(mc ? mc.states.map(s => s.name) : []), e.state]).map(s => [s, s]), e.state);
  setOptions('#ed-mode', [['', 'Not set'], ...MODES.map(m => [m, m])], e.mode);
  $('#ed-alarm').dataset.cur = e.alarm || '';
  fillEditAlarms(e, e.state);
  $('#edStopWrap').hidden = ruleOf(e.machine) !== 'optional';
  $('#ed-stop').value = e.stop ? '1' : '';
  $('#ed-at').value = toLocalInput(e.at); $('#ed-note').value = [e.note, e.code].filter(Boolean).join(' ');
  const meta = $('#edMeta'); meta.replaceChildren();
  if (!e.example) { meta.append('Logged by ', whoEl(e), ' · saved ' + fmtWhen(e.createdAt) + (e.updatedAt && e.updatedAt - e.createdAt > 5000 ? ' · edited ' + fmtWhen(e.updatedAt) : '')); fillNames(meta); }
  $$('#edForm input, #edForm select').forEach(i => { i.disabled = ro; });
  $('#edActions').hidden = ro;
  const del = $('#edDelete'); del.classList.remove('armed'); del.textContent = 'Delete';
  const note = $('#edNote');
  note.textContent = e.example ? 'This is an example entry. It is not saved anywhere.'
    : ro ? 'Only admins and the person who logged this entry can change it.'
    : 'Changing the time or state recalculates the timeline for everyone.';
  note.hidden = false;
  if (typeof edit.showModal === 'function') { if (!edit.open) edit.showModal(); } else edit.setAttribute('open', '');
}
function closeEdit() { if (typeof edit.close === 'function') edit.close(); else edit.removeAttribute('open'); editId = null; }
async function saveEdit(ev) {
  ev.preventDefault();
  const e = findEvent(editId); if (!e || !canEditEntry(e)) return;
  const at = fromLocalInput($('#ed-at').value), now = Date.now();
  if (!at) return edErr('Enter when it started.');
  if (at > now + MIN) return edErr('That time is in the future.');
  const state = $('#ed-state').value, run = isRunState(e.machine, state, e.run);
  const alarm = run ? '' : $('#ed-alarm').value, note = $('#ed-note').value.trim();
  if (alarm === OTHER && !note) return edErr('Describe the problem for Other.');
  const patch = { state, run, stop: !run && ruleOf(e.machine) === 'optional' && $('#ed-stop').value === '1', mode: $('#ed-mode').value, at, alarm, note, code: '', updatedAt: now, editedBy: myUid() };
  const btn = $('#edSave'); btn.disabled = true;
  S.db.collection('events').doc(editId).update(patch).catch(x => toast(fbMsg(x)));
  if (e.at < S.liveSince || at < S.liveSince) { S.hist = null; refreshSeeds(); }
  btn.disabled = false; closeEdit(); toast('Entry updated'); renderAll();
}
let armT = 0;
async function deleteEntry() {
  const b = $('#edDelete');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Press again to delete'; clearTimeout(armT); armT = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Delete'; }, 4000); return; }
  clearTimeout(armT);
  const e = findEvent(editId);
  if (!S.db || !e || !canEditEntry(e)) return;
  b.disabled = true;
  S.db.collection('events').doc(editId).delete().catch(x => toast(fbMsg(x)));
  if (e.at < S.liveSince) { S.hist = null; refreshSeeds(); }
  b.disabled = false; b.classList.remove('armed'); b.textContent = 'Delete';
  closeEdit(); toast('Entry deleted'); renderAll();
}

/* ================= PDF shift report ================= */
const JSPDF_URL = 'vendor/jspdf.umd.min.js';
let jspdfP = null;
function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jspdfP) jspdfP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = JSPDF_URL; s.async = true;
    s.onload = () => (window.jspdf && window.jspdf.jsPDF) ? res(window.jspdf.jsPDF) : rej(new Error('load'));
    s.onerror = () => { jspdfP = null; rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return jspdfP;
}
function reportCurrent(btn) {
  if (S.session) return makeReport({ name: myName(), from: S.session.clockIn, to: Date.now(), out: false }, btn);
  const sb = shiftBounds(Date.now());
  return makeReport({ name: S.conn === 'live' ? myName() + ' (not clocked in)' : 'Example operator', from: sb.start, to: Date.now(), out: false, shiftOnly: true }, btn);
}
async function makeReport(o, btn) {
  if (btn) btn.disabled = true;
  try {
    const [jsPDF, D] = await Promise.all([loadJsPDF(), ensureData(o.from)]);
    if (!D) throw new Error('data');
    const doc = drawReport(jsPDF, o, D);
    const blob = doc.output('blob');
    saveFile('shift-report-' + slug(o.name) + '-' + ymd(o.from) + '-' + hm(o.from).replace(':', '') + '.pdf', blob);
    toast('Shift report downloaded');
  } catch (x) {
    const c = x && x.code;
    if (c === 'declined') return;
    if (c === 'rate_limited') toast('A save prompt is already open.');
    else if (x && x.message === 'load') toast("Couldn't load the PDF tool. Check the connection and try again.");
    else if (x && x.message === 'data') toast("Couldn't load the entries for that shift. Try again.");
    else toast("Couldn't make the report. Try again.");
  } finally { if (btn) btn.disabled = false; }
}
function drawReport(jsPDF, o, D) {
  const from = o.from, to = Math.max(o.to, o.from + MIN), example = useExample();
  const R = replay(D.seeds, D.events, from, to), st = segStats(R.segs);
  const evs = D.events.filter(e => e.at >= from && e.at <= to).sort(byAt);
  const next = nextMap(D.events.concat(Object.values(D.seeds || {})));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14, W = PW - 2 * M;
  const C = { ink: [17, 26, 35], ink2: [71, 82, 94], muted: [108, 119, 131], line: [213, 218, 224], panel2: [239, 242, 244], hmi: [26, 37, 48], hmiInk: [233, 238, 243], hmiMuted: [159, 176, 193] };
  const ctx = { M, W, PH, C };
  const sb = shiftBounds(from), P = primary();
  const txt = (s, x, y, size, style, color, opt) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || C.ink)); doc.text(String(s), x, y, opt || {}); };
  doc.setLineHeightFactor(1.35);
  // header band
  doc.setFillColor(...C.hmi); doc.rect(0, 0, PW, 32, 'F');
  txt('EXTRUSION LINE  ·  SHIFT REPORT' + (example ? '  ·  EXAMPLE DATA' : ''), M, 11, 7.5, 'bold', C.hmiMuted);
  txt(sb.name.toUpperCase() + ' SHIFT', M, 23, 22, 'bold', C.hmiInk);
  txt(longDate(from), PW - M, 16, 10, 'normal', C.hmiInk, { align: 'right' });
  txt('Scheduled ' + hm(sb.start) + ' - ' + hm(sb.end), PW - M, 22, 9, 'normal', C.hmiMuted, { align: 'right' });
  // who and when
  let y = 42;
  const info = [['Operator', o.name], [o.shiftOnly ? 'From' : 'Clocked in', fmtDate(from) + ' ' + hm(from)], [o.out ? 'Clocked out' : 'Report time', fmtDate(to) + ' ' + hm(to)], ['Time covered', fmtDur(to - from)]];
  info.forEach(([l, v], i) => { const x = M + i * (W / 4); txt(l.toUpperCase(), x, y, 7, 'bold', C.muted); txt(doc.splitTextToSize(String(v), W / 4 - 3)[0], x, y + 6, 11, 'bold'); });
  y += 13;
  // numbers
  doc.setFillColor(...C.panel2); doc.roundedRect(M, y, W, 21, 2, 2, 'F');
  [['Extrusion', fmtDur(st.run)], ['Downtime', fmtDur(st.down)], ['Availability', st.avail == null ? '-' : (st.avail * 100).toFixed(1) + ' %'], ['Stops', String(st.stops)]]
    .forEach(([l, v], i) => { const x = M + 5 + i * (W / 4); txt(l.toUpperCase(), x, y + 7, 7, 'bold', C.ink2); txt(v, x, y + 15.5, 15, 'bold'); });
  y += 29;
  const section = (t, need) => { if (y + (need || 20) > PH - 18) { doc.addPage(); y = 18; } txt(t.toUpperCase(), M, y, 9, 'bold', C.ink); doc.setDrawColor(...C.ink); doc.setLineWidth(0.4); doc.line(M, y + 1.8, M + W, y + 1.8); y += 7; };
  // timeline
  section('Timeline', 30);
  const span = to - from, X = t => M + (t - from) / span * W;
  doc.setFillColor(...C.panel2); doc.rect(M, y, W, 9, 'F');
  for (const s of R.segs) {
    const x1 = X(Math.max(s.start, from)), x2 = X(Math.min(s.end, to));
    const hex = s.run === true ? '#0ca30c' : s.run === false ? causeHex(s.machine, s.state) : '#d5dae0';
    doc.setFillColor(...hexRgb(hex)); doc.rect(x1, y, Math.max(0.25, x2 - x1), 9, 'F');
  }
  const spanH = span / HOUR, stepH = spanH <= 8 ? 1 : spanH <= 14 ? 2 : spanH <= 26 ? 4 : 12;
  const t0 = new Date(from); t0.setMinutes(0, 0, 0); let tk = +t0; if (tk < from) tk += HOUR;
  doc.setDrawColor(...C.muted); doc.setLineWidth(0.2);
  txt(hm(from), M, y + 13.5, 7, 'normal', C.muted);
  while (tk <= to) {
    if (new Date(tk).getHours() % stepH === 0) { const x = X(tk); doc.line(x, y + 9, x, y + 10.5); if (x - M > 9 && M + W - x > 9) txt(hm(tk), x, y + 13.5, 7, 'normal', C.muted, { align: 'center' }); }
    tk += HOUR;
  }
  txt(hm(to), M + W, y + 13.5, 7, 'normal', C.muted, { align: 'right' });
  y += 18;
  // legend
  const leg = [{ hex: '#0ca30c', label: runStateOf(P) }].concat(st.causes.map(c => ({ hex: causeHex(c.machine, c.state), label: c.machine + ' · ' + c.state })));
  if (st.unk >= MIN) leg.push({ hex: '#d5dae0', label: 'Not logged' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  let lx = M;
  for (const l of leg) {
    const w = doc.getTextWidth(l.label) + 7;
    if (lx + w > M + W) { lx = M; y += 4.6; }
    doc.setFillColor(...hexRgb(l.hex)); doc.rect(lx, y - 2.4, 2.6, 2.6, 'F');
    txt(l.label, lx + 3.8, y, 7.5, 'normal', C.ink2); lx += w + 3;
  }
  y += 9;
  // downtime by cause
  section('Downtime by cause', 26);
  if (!st.causes.length) { txt('No downtime in this period.', M, y + 2, 9, 'normal', C.muted); y += 9; }
  else {
    y = drawTable(doc, y, [{ h: 'Cause', w: 60 }, { h: 'Machine', w: 42 }, { h: 'Stops', w: 22, align: 'right' }, { h: 'Downtime', w: 32, align: 'right' }, { h: 'Share', w: 26, align: 'right' }],
      st.causes.map(c => [{ t: c.state, sw: causeHex(c.machine, c.state), b: true }, { t: c.machine }, { t: String(c.n) }, { t: fmtDur(c.ms) }, { t: Math.round(c.ms / (st.down || 1) * 100) + ' %' }]), ctx);
    y += 8;
  }
  // time-wise log
  section('Log, in time order', 26);
  const startEv = Object.values(R.state).length ? null : null;
  const carried = machines().map(m => { const e = [...D.events, ...Object.values(D.seeds || {})].filter(x => x.machine === m.name && x.at < from).sort(byAt).pop(); return e; }).filter(Boolean);
  const rows = [];
  for (const e of carried) rows.push([{ t: 'before', mute: true }, { t: e.machine, b: true }, { t: e.state, sw: isRunState(e.machine, e.state, e.run) ? '#0ca30c' : causeHex(e.machine, e.state) }, { t: [e.alarm, e.note].filter(Boolean).join(' · ') + (rows.length === 0 ? '' : ''), mute: true }, { t: e.mode, mute: true }, { t: 'carried in', mute: true }, { t: e.personName || '', mute: true }]);
  for (const e of evs) {
    const run = isRunState(e.machine, e.state, e.run);
    const dur = (next[e.id] || Math.min(Date.now(), to)) - e.at;
    rows.push([{ t: hm(e.at) }, { t: e.machine, b: true }, { t: e.state + (e.stop && !run ? ' (press stopped)' : ''), sw: run ? '#0ca30c' : causeHex(e.machine, e.state) }, { t: [e.alarm, e.note, e.code].filter(Boolean).join(' · ') }, { t: e.mode }, { t: fmtDur(dur) + (next[e.id] ? '' : '+') }, { t: whoText(e) || (e.example ? 'Example' : '') }]);
  }
  if (!rows.length) { txt('Nothing was logged in this period.', M, y + 2, 9, 'normal', C.muted); y += 9; }
  else y = drawTable(doc, y, [{ h: 'Time', w: 15 }, { h: 'Machine', w: 26 }, { h: 'State', w: 32 }, { h: 'Alarm / notes', w: 49 }, { h: 'Mode', w: 20 }, { h: 'Lasted', w: 18, align: 'right' }, { h: 'Logged by', w: 22 }], rows, ctx);
  y += 6;
  if (y < PH - 30) txt('Lasted is how long the machine stayed in that state. A + means it was still in that state at the end of the report.', M, y, 7, 'normal', C.muted);
  // footer on every page
  const n = doc.getNumberOfPages(), gen = 'Generated ' + fmtDate(Date.now()) + ' ' + hm(Date.now()) + ' · Extrusion Downtime Log' + (example ? ' · EXAMPLE DATA, NOT REAL' : '');
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M, PH - 12, M + W, PH - 12);
    txt(gen, M, PH - 7.5, 7, 'normal', C.muted);
    txt('Page ' + i + ' of ' + n, M + W, PH - 7.5, 7, 'normal', C.muted, { align: 'right' });
    if (example) { try { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.08 })); txt('EXAMPLE DATA', PW / 2, PH / 2, 60, 'bold', C.ink, { align: 'center', angle: 30 }); doc.restoreGraphicsState(); } catch (e) {} }
  }
  void startEv;
  return doc;
}
function drawTable(doc, y, cols, rows, ctx) {
  const { M, W, PH, C } = ctx, lh = 4.1;
  const head = () => {
    doc.setFillColor(...C.panel2); doc.rect(M, y, W, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.ink2);
    let x = M; cols.forEach(c => { doc.text(c.h.toUpperCase(), c.align === 'right' ? x + c.w - 2 : x + 2, y + 4.7, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w; });
    y += 7;
  };
  head();
  for (const row of rows) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6);
    const lines = row.map((cell, i) => doc.splitTextToSize(String(cell.t == null ? '' : cell.t), cols[i].w - 4 - (cell.sw ? 3.4 : 0)));
    const nl = Math.max(1, ...lines.map(l => l.length)), rh = nl * lh + 2.6;
    if (y + rh > PH - 16) { doc.addPage(); y = 18; head(); }
    let x = M;
    row.forEach((cell, i) => {
      const c = cols[i]; let tx = x + 2;
      if (cell.sw) { doc.setFillColor(...hexRgb(cell.sw)); doc.rect(x + 2, y + 1.6, 2.4, 2.4, 'F'); tx += 3.4; }
      doc.setFont('helvetica', cell.b ? 'bold' : 'normal'); doc.setFontSize(8.6); doc.setTextColor(...(cell.mute ? C.muted : C.ink));
      if (c.align === 'right') doc.text(lines[i], x + c.w - 2, y + 4, { align: 'right' }); else doc.text(lines[i], tx, y + 4);
      x += c.w;
    });
    y += rh;
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M, y, M + W, y);
  }
  return y;
}

/* ================= boot ================= */
function boot() {
  const cfg = window.APP_CONFIG || {};
  const fb = cfg.firebase || {};
  if (typeof firebase === 'undefined' || !fb.apiKey || /PASTE|YOUR_/i.test(fb.apiKey)) {
    S.conn = 'offline'; S.authReady = true; renderAll();
    showNotice('This copy is not connected to a database yet, so it shows example data. Add the Firebase settings to js/config.js.');
    return;
  }
  firebase.initializeApp(fb);
  S.auth = firebase.auth(); S.db = firebase.firestore();
  try { S.db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
  S.auth.getRedirectResult().catch(x => { G.err = authMsg(x); renderAll(); });
  S.auth.onAuthStateChanged(onAuth);
  renderAll();
}

$$('.tab, .bn').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.addEventListener('click', e => { const g = e.target.closest && e.target.closest('[data-goto]'); if (g) setTab(g.dataset.goto); });
$('#noticeX').addEventListener('click', () => { $('#notice').hidden = true; });
$('#userBtn').addEventListener('click', openAcct);
$('#clockInBtn').addEventListener('click', () => clockIn());
$('#acClose').addEventListener('click', closeAcct);
acct.addEventListener('click', e => { if (e.target === acct) closeAcct(); });
$('#reportBtn').addEventListener('click', e => reportCurrent(e.currentTarget));
$('#exHide').addEventListener('click', () => { if (S.exampleForced) S.exampleForced = false; else { S.exampleDismissed = true; LS.set('exampleDismissed', true); } renderAll(); });
$('#exToggle').addEventListener('click', () => {
  if (useExample()) { if (S.exampleForced) S.exampleForced = false; else { S.exampleDismissed = true; LS.set('exampleDismissed', true); } }
  else S.exampleForced = true;
  renderAll();
});
$('#shForm').addEventListener('submit', submitSheet);
$('#ckForm').addEventListener('submit', submitCheck);
$('#ckSkip').addEventListener('click', closeCheck);
$('#ckClose').addEventListener('click', closeCheck);
$('#shClose').addEventListener('click', closeSheet);
$('#shChange').addEventListener('click', () => { SH.machine = null; SH.group = null; SH.state = null; SH.alarm = null; renderSheet(); });
$('#shGroupLink').addEventListener('click', () => { const g = SH.machine ? groupOf(SH.machine) : null; if (!g) return; SH.group = g; SH.machine = null; SH.state = null; SH.alarm = null; SH.modeTouched = false; renderSheet(); });
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
$('#edForm').addEventListener('submit', saveEdit);
$('#edClose').addEventListener('click', closeEdit);
$('#edDelete').addEventListener('click', deleteEntry);
$('#ed-state').addEventListener('change', () => { const e = findEvent(editId); if (!e) return; $('#ed-alarm').dataset.cur = $('#ed-alarm').value; fillEditAlarms(e, $('#ed-state').value); });
edit.addEventListener('click', e => { if (e.target === edit) closeEdit(); });
edit.addEventListener('close', () => { editId = null; });
document.addEventListener('click', e => { const r = e.target.closest && e.target.closest('.erow[data-id]'); if (r) openEdit(r.dataset.id); });
$('#hMachine').addEventListener('change', e => { S.hmachine = e.target.value; renderHistory(); });
$('#csvTimeline').addEventListener('click', () => exportCsv('timeline'));
$('#csvEntries').addEventListener('click', () => exportCsv('entries'));
/* admin editor */
const admM = $('#admMachines');
admM.addEventListener('input', e => {
  const t = e.target, f = t.dataset.f; if (!f || f === 'rule') return;
  const mc = t.closest('[data-m]'); const m = mc && S.draft.machines[+mc.dataset.m]; if (!m) return;
  const sEl = t.closest('[data-s]'), s = sEl ? m.down[+sEl.dataset.s] : null;
  if (f === 'add') { if (s) s.add = t.value; return; }
  if (f === 'name') m.name = t.value; else if (f === 'run') m.run = t.value; else if (f === 'group') m.group = t.value;
  else if (f === 'delay') m.delay = t.value === '' ? '' : Number(t.value); else if (f === 'sname' && s) s.name = t.value;
  markDirty();
});
admM.addEventListener('change', e => {
  const t = e.target; if (t.dataset.f !== 'rule') return;
  const i = +t.closest('[data-m]').dataset.m, m = S.draft.machines[i]; if (!m) return;
  if (t.value === 'main') S.draft.machines.forEach((x, k) => { if (k !== i && x.rule === 'main') x.rule = 'always'; });
  if (t.value === 'group' && !m.group) { const other = S.draft.machines.find(x => x !== m && x.rule === 'group'); m.group = other ? other.group : 'Group'; m.delay = other ? other.delay : 5; }
  m.rule = t.value; markDirty(); redrawEditor();
});
admM.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.f === 'add') { e.preventDefault(); adminAct('adda', e.target); } });
admM.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) adminAct(b.dataset.act, b); });
$('#addMachine').addEventListener('click', e => adminAct('addm', e.currentTarget));
const admS = $('#admShifts');
admS.addEventListener('input', e => { const t = e.target, row = t.closest('[data-sh]'); if (!row) return; const s = S.draft.shifts[+row.dataset.sh]; if (!s) return; if (t.dataset.f === 'shname') s.name = t.value; else if (t.dataset.f === 'shstart') s.start = t.value; markDirty(); });
admS.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) adminAct(b.dataset.act, b); });
$('#addShift').addEventListener('click', e => adminAct('addsh', e.currentTarget));
$('#saveBtn').addEventListener('click', saveConfig);
$('#discardBtn').addEventListener('click', () => { S.draftDirty = false; S.draftSig = ''; $('#saveErr').hidden = true; renderAll(); });
/* connection, install and screen-on */
window.addEventListener('online', () => { S.online = true; renderHeader(S.L); });
window.addEventListener('offline', () => { S.online = false; renderHeader(S.L); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (S.wantWake && !S.wake) setWake(true); renderAll(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });

/* tooltip */
const tip = $('#tip');
function posTip(e) {
  const p = 14, w = tip.offsetWidth, ht = tip.offsetHeight;
  let x = e.clientX + p, y = e.clientY + p;
  if (x + w > innerWidth - 8) x = e.clientX - w - p;
  if (y + ht > innerHeight - 8) y = e.clientY - ht - p;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
document.addEventListener('pointerover', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t || e.pointerType === 'touch') { tip.hidden = true; return; }
  tip.textContent = t.getAttribute('data-tip'); tip.hidden = false; posTip(e);
});
document.addEventListener('pointermove', e => { if (!tip.hidden) posTip(e); });
document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

/* clocks: re-render only, never writes */
setInterval(() => {
  if (document.hidden) return;
  const now = Date.now();
  $$('[data-since]').forEach(el => { el.textContent = clock(now - +el.dataset.since); });
  let due = false;
  $$('[data-until]').forEach(el => { const left = +el.dataset.until - now; el.textContent = mmss(left); if (left <= 0) due = true; });
  if (due && !untilFired) { untilFired = true; renderAll(); }
}, 1000);
setInterval(() => {
  if (document.hidden) return;
  if (S.conn === 'live' && Date.now() - S.liveSince > 60 * HOUR) subLive();
  renderAll();
}, 30000);

const hash = (location.hash || '').replace('#', '');
S.tab = TABS.includes(hash) ? hash : LS.get('tab', 'shift');
if (!TABS.includes(S.tab)) S.tab = 'shift';
if (S.wantWake) setWake(true);
boot();
})();
