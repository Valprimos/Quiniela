// Juego de repaso: genera preguntas de test con las citas, datos curiosos y palabras de inglés.
// Las preguntas se hacen sobre lo que ya ha salido (o sobre todo el contenido) y se prioriza lo
// que no se ha preguntado nunca o se ha fallado. Los distractores salen siempre de todo el contenido.

import { QUOTES, FACTS, WORDS, dayContent, findItem } from './contenido.js';

export const MASTERED = 3; // aciertos seguidos para dar un elemento por dominado
const KINDS = ['quote', 'fact', 'word'];

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const textOf = (kind, it) => (kind === 'word' ? it.w : it.t);
export const itemId = (kind, it) => kind[0] + '-' + hash(textOf(kind, it));
const LISTS = { quote: QUOTES, fact: FACTS, word: WORDS };

let allCache = null;
export function allItems() {
  if (!allCache) allCache = KINDS.flatMap(kind => LISTS[kind].map(item => ({ kind, item, id: itemId(kind, item) })));
  return allCache;
}

/* ---------- utilidades ---------- */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sample = (arr, n, rng) => shuffle(arr, rng).slice(0, n);
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const uniqueBy = (arr, fn) => { const seen = new Set(); return arr.filter(x => { const k = fn(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function finish(base, correct, distractors, rng) {
  const wrong = uniqueBy(distractors.filter(d => d && norm(d) !== norm(correct)), norm);
  const options = shuffle([correct, ...wrong.slice(0, 3)], rng);
  if (options.length < 2) return null;
  return { ...base, options, answer: options.indexOf(correct) };
}

/* ---------- elementos que ya han salido ---------- */
function* eachDay(from, to) {
  const [y, m, d] = from.split('-').map(Number);
  const end = Date.UTC(...to.split('-').map((v, i) => (i === 1 ? v - 1 : v)));
  for (let t = Date.UTC(y, m - 1, d), n = 0; t <= end && n < 800; t += 86400000, n++) {
    const dt = new Date(t);
    yield `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
}

export function poolFor({ scope = 'seen', from, to, favorites = [], stats = {} }) {
  if (scope === 'all') return allItems();
  if (scope === 'fails') return allItems().filter(x => { const s = stats[x.id]; return s && s.ko > 0 && (s.streak || 0) < MASTERED; });
  const map = new Map();
  for (const d of eachDay(from, to)) {
    const c = dayContent(d);
    for (const kind of KINDS) { const item = c[kind]; const id = itemId(kind, item); if (!map.has(id)) map.set(id, { kind, item, id }); }
  }
  for (const key of favorites) { const f = findItem(key); if (f) { const id = itemId(f.kind, f.item); if (!map.has(id)) map.set(id, { kind: f.kind, item: f.item, id }); } }
  return [...map.values()];
}

/* ---------- tipos de pregunta ---------- */
const FACT_NUM = /\d{1,3}(?:\.\d{3})+|\d+/g;
const FACT_NAME = /[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{3,}/g;
const TAIL = /[\s.,;:!?»”)]+$/;

function numToken(text) {
  for (const m of text.matchAll(FACT_NUM)) {
    const tok = m[0];
    const before = text[m.index - 1], after = text[m.index + tok.length];
    if (/[\w^,]/.test(before || ' ') || /[\w^]/.test(after || ' ') || after === ',' && /\d/.test(text[m.index + tok.length + 1] || '')) continue;
    const value = parseInt(tok.replace(/\./g, ''), 10);
    if (value >= 10) return { tok, index: m.index, value, dotted: tok.includes('.') };
  }
  return null;
}
function nameToken(text) {
  for (const m of text.matchAll(FACT_NAME)) {
    const prev = text.slice(0, m.index).replace(/\s+$/, '').slice(-1);
    if (!prev || /[.!?¿¡«"“]/.test(prev)) continue;
    return { tok: m[0], index: m.index };
  }
  return null;
}
const fmtNum = (v, dotted) => (dotted ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(v));
function numberDistractors(t, text, rng) {
  const v = t.value, year = !t.dotted && v >= 1000 && v <= 2100;
  const cands = year
    ? [4, 7, 13, 25, 40, 60, 100, 150].flatMap(d => [v - d, v + d]).filter(x => x > 0 && x <= 2100)
    : [v * 2, Math.round(v / 2), Math.round(v * 1.5), Math.round(v * 0.7), v + Math.max(1, Math.round(v * 0.1)), v - Math.max(1, Math.round(v * 0.1)), v * 10, Math.round(v / 10)];
  const inText = new Set([...text.matchAll(FACT_NUM)].map(m => parseInt(m[0].replace(/\./g, ''), 10)));
  const ok = uniqueBy(cands.filter(x => x >= 1 && x !== v && !inText.has(x)), x => x);
  return sample(ok, 3, rng).map(x => fmtNum(x, t.dotted));
}
let namePool = null;
function allNames() {
  if (!namePool) {
    namePool = uniqueBy(FACTS.flatMap(f => [...f.t.matchAll(FACT_NAME)].filter(m => {
      const prev = f.t.slice(0, m.index).replace(/\s+$/, '').slice(-1);
      return prev && !/[.!?¿¡«"“]/.test(prev);
    }).map(m => m[0])), x => x);
  }
  return namePool;
}

export function typesFor(kind, item) {
  const types = [];
  if (kind === 'word') {
    types.push('w-es', 'w-en');
    if (new RegExp(`\\b${esc(item.w)}\\b`, 'i').test(item.ex || '')) types.push('w-ctx');
  } else if (kind === 'quote') {
    if (new Set(QUOTES.map(q => q.a)).size >= 3) types.push('q-author');
    if (item.t.split(/\s+/).length >= 6) types.push('q-end');
  } else {
    if (numToken(item.t) || nameToken(item.t)) types.push('f-cloze');
    types.push('f-cat');
  }
  return types;
}

export function makeQuestion(kind, item, type, rng = Math.random) {
  const base = { id: itemId(kind, item), kind, item, type };
  if (type === 'w-es') {
    const same = WORDS.filter(w => w !== item && w.k === item.k), rest = WORDS.filter(w => w !== item && w.k !== item.k);
    return finish({ ...base, prompt: `¿Qué significa «${item.w}»?` }, item.es, [...sample(same, 3, rng), ...sample(rest, 3, rng)].map(w => w.es), rng);
  }
  if (type === 'w-en') {
    const same = WORDS.filter(w => w !== item && w.k === item.k), rest = WORDS.filter(w => w !== item && w.k !== item.k);
    return finish({ ...base, prompt: `¿Cómo se dice «${item.es}» en inglés?` }, item.w, [...sample(same, 3, rng), ...sample(rest, 3, rng)].map(w => w.w), rng);
  }
  if (type === 'w-ctx') {
    const re = new RegExp(`\\b${esc(item.w)}\\b`, 'i');
    const same = WORDS.filter(w => w !== item && w.k === item.k), rest = WORDS.filter(w => w !== item && w.k !== item.k);
    return finish({ ...base, prompt: 'Completa la frase:', quote: item.ex.replace(re, '_____'), hint: item.es }, item.w, [...sample(same, 3, rng), ...sample(rest, 3, rng)].map(w => w.w), rng);
  }
  if (type === 'q-author') {
    const authors = uniqueBy(QUOTES.map(q => q.a).filter(a => a !== item.a), x => x);
    return finish({ ...base, prompt: '¿Quién dijo esto?', quote: item.t }, item.a, sample(authors, 3, rng), rng);
  }
  if (type === 'q-end') {
    const words = item.t.split(/\s+/), k = words.length >= 9 ? 3 : 2;
    const head = words.slice(0, words.length - k).join(' '), tail = words.slice(-k).join(' ').replace(TAIL, '');
    const others = QUOTES.filter(q => q !== item && q.t.split(/\s+/).length >= 6)
      .map(q => q.t.split(/\s+/).slice(-k).join(' ').replace(TAIL, ''));
    return finish({ ...base, prompt: 'Completa la cita:', quote: `${head} _____`, hint: item.a }, tail, sample(others, 5, rng), rng);
  }
  if (type === 'f-cloze') {
    const n = numToken(item.t);
    if (n) {
      const q = item.t.slice(0, n.index) + '_____' + item.t.slice(n.index + n.tok.length);
      return finish({ ...base, prompt: 'Completa el dato:', quote: q, hint: item.c }, n.tok, numberDistractors(n, item.t, rng), rng);
    }
    const nm = nameToken(item.t);
    if (!nm) return null;
    const q = item.t.slice(0, nm.index) + '_____' + item.t.slice(nm.index + nm.tok.length);
    const names = allNames().filter(x => !item.t.includes(x) && x !== nm.tok);
    return finish({ ...base, prompt: 'Completa el dato:', quote: q, hint: item.c }, nm.tok, sample(names, 3, rng), rng);
  }
  if (type === 'f-cat') {
    const cats = uniqueBy(FACTS.map(f => f.c).filter(c => c !== item.c), x => x);
    return finish({ ...base, prompt: '¿A qué tema pertenece este dato?', quote: item.t }, item.c, sample(cats, 3, rng), rng);
  }
  return null;
}

/* ---------- selección de preguntas ---------- */
export function weightOf(stats, id) {
  const s = stats[id];
  if (!s) return 3;
  const streak = s.streak || 0;
  let w = 1 + Math.min(3, s.ko || 0) * 0.8 - Math.min(streak, MASTERED) * 0.3;
  if (s.ko > 0 && streak === 0) w += 2;
  return Math.max(0.25, w);
}

export function combos(pool, cat = 'all') {
  const out = [];
  for (const p of pool) if (cat === 'all' || p.kind === cat) for (const type of typesFor(p.kind, p.item)) out.push({ ...p, type });
  return out;
}

export function buildSession({ pool, cat = 'all', n = 10, stats = {}, rng = Math.random }) {
  const left = combos(pool, cat);
  const chosen = [];
  while (chosen.length < n && left.length) {
    const total = left.reduce((a, c) => a + weightOf(stats, c.id), 0);
    let r = rng() * total, idx = 0;
    for (; idx < left.length; idx++) { r -= weightOf(stats, left[idx].id); if (r <= 0) break; }
    chosen.push(left.splice(Math.min(idx, left.length - 1), 1)[0]);
  }
  // Evita dos preguntas seguidas del mismo elemento cuando sea posible.
  for (let i = 1; i < chosen.length; i++) {
    if (chosen[i].id === chosen[i - 1].id) {
      const j = chosen.findIndex((c, k) => k > i && c.id !== chosen[i - 1].id && (!chosen[i + 1] || c.id !== chosen[i + 1].id));
      if (j > -1) [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
    }
  }
  return chosen.map(c => makeQuestion(c.kind, c.item, c.type, rng)).filter(Boolean);
}

/* ---------- progreso ---------- */
export function nextStats(prev, ok, date) {
  const s = { ok: 0, ko: 0, streak: 0, ...(prev || {}) };
  if (ok) { s.ok++; s.streak++; } else { s.ko++; s.streak = 0; }
  s.last = date;
  return s;
}
export function summarize(pool, stats) {
  const out = { quote: { seen: 0, mastered: 0 }, fact: { seen: 0, mastered: 0 }, word: { seen: 0, mastered: 0 } };
  for (const p of pool) { out[p.kind].seen++; if ((stats[p.id]?.streak || 0) >= MASTERED) out[p.kind].mastered++; }
  return out;
}
