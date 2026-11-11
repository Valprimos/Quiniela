// Sincronización entre dispositivos usando un repositorio privado de GitHub.
// - Los datos se cifran en el navegador (PBKDF2 + AES-GCM) antes de subirse.
// - La fusión se hace registro a registro (gana el cambio más reciente), así dos
//   dispositivos pueden editar por separado sin pisarse.

const FILE = 'datos-27.json';
const CFG_KEY = 'veintisiete.sync.cfg.v1';
const META_KEY = 'veintisiete.sync.meta.v1';
const API = 'https://api.github.com';
const ITER = 250000;
const TOMBSTONE_DAYS = 400;

const ID_BUCKETS = ['habits', 'areas', 'sessions', 'subjects', 'grades', 'extras', 'goals', 'books', 'customFacts', 'tasks', 'quizRuns'];
const SET_BUCKETS = ['extraCategories', 'favorites'];

/* ---------- utilidades ---------- */
export function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const b64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

/* ---------- aplanar el estado en registros ---------- */
function itemKey(bucket, item) {
  if (item && typeof item === 'object' && item.id) return `${bucket}/${item.id}`;
  return `${bucket}/#${hash(stable(item))}`;
}

export function flatten(state) {
  const records = {}, order = {};
  for (const b of ID_BUCKETS) {
    order[b] = [];
    for (const it of state[b] || []) { const k = itemKey(b, it); records[k] = it; order[b].push(k); }
  }
  for (const b of SET_BUCKETS) {
    order[b] = [];
    for (const it of state[b] || []) { const k = `${b}/${it}`; records[k] = it; order[b].push(k); }
  }
  for (const [d, v] of Object.entries(state.moods || {})) records[`moods/${d}`] = v;
  for (const [d, v] of Object.entries(state.reflections || {})) records[`reflections/${d}`] = v;
  for (const [k, v] of Object.entries(state.quizStats || {})) records[`qs/${k}`] = v;
  for (const [d, entries] of Object.entries(state.habitEntries || {}))
    for (const [hid, v] of Object.entries(entries || {})) records[`he/${d}/${hid}`] = v;
  return { records, order };
}

function orderKeys(keys, remoteOrder, localOrder, localFirst) {
  const have = new Set(keys);
  const r = remoteOrder.filter(k => have.has(k));
  const inR = new Set(r);
  const l = localOrder.filter(k => have.has(k) && !inR.has(k));
  const used = new Set([...r, ...l]);
  const rest = keys.filter(k => !used.has(k)).sort();
  return localFirst ? [...l, ...r, ...rest] : [...r, ...l, ...rest];
}

export function buildState(base, records, remoteOrder = {}, localOrder = {}) {
  const next = { ...base };
  const by = {};
  for (const k of Object.keys(records)) { const i = k.indexOf('/'); (by[k.slice(0, i)] ??= []).push(k); }
  for (const b of ID_BUCKETS) next[b] = orderKeys(by[b] || [], remoteOrder[b] || [], localOrder[b] || [], true).map(k => records[k]);
  for (const b of SET_BUCKETS) next[b] = orderKeys(by[b] || [], remoteOrder[b] || [], localOrder[b] || [], false).map(k => records[k]);
  next.moods = {}; next.reflections = {}; next.habitEntries = {}; next.quizStats = {};
  for (const k of by.moods || []) next.moods[k.slice(6)] = records[k];
  for (const k of by.reflections || []) next.reflections[k.slice(12)] = records[k];
  for (const k of by.qs || []) next.quizStats[k.slice(3)] = records[k];
  for (const k of by.he || []) {
    const rest = k.slice(3), j = rest.indexOf('/');
    (next.habitEntries[rest.slice(0, j)] ??= {})[rest.slice(j + 1)] = records[k];
  }
  return next;
}

/* ---------- metadatos de cambios locales ---------- */
export function emptyMeta() { return { hashes: {}, updated: {}, deleted: {}, dirty: false, lastSync: 0 }; }

// Compara el estado actual con la última foto y marca qué registros cambiaron o se borraron.
export function stampMeta(meta, records, now = Date.now()) {
  let changed = false;
  for (const [k, v] of Object.entries(records)) {
    const h = hash(stable(v));
    if (meta.hashes[k] !== h) { meta.hashes[k] = h; meta.updated[k] = now; delete meta.deleted[k]; changed = true; }
  }
  for (const k of Object.keys(meta.hashes)) {
    if (!(k in records)) { delete meta.hashes[k]; delete meta.updated[k]; meta.deleted[k] = now; changed = true; }
  }
  if (changed) meta.dirty = true;
  return changed;
}

/* ---------- fusión ---------- */
export function merge(local, remote) {
  const records = {}, updated = {}, deleted = {};
  const keys = new Set([...Object.keys(local.records), ...Object.keys(remote.records), ...Object.keys(local.deleted), ...Object.keys(remote.deleted)]);
  for (const k of keys) {
    const lp = k in local.records, rp = k in remote.records;
    const lt = lp ? (local.updated[k] || 0) : (local.deleted[k] || 0);
    const rt = rp ? (remote.updated[k] || 0) : (remote.deleted[k] || 0);
    let win;
    if (lt > rt) win = 'l';
    else if (rt > lt) win = 'r';
    else if (lp && !rp) win = 'l';
    else if (rp && !lp) win = 'r';
    else if (lp && rp) win = stable(local.records[k]) >= stable(remote.records[k]) ? 'l' : 'r';
    else win = 'l';
    const present = win === 'l' ? lp : rp;
    const ts = win === 'l' ? lt : rt;
    if (present) { records[k] = (win === 'l' ? local : remote).records[k]; updated[k] = ts; }
    else deleted[k] = ts;
  }
  return { records, updated, deleted };
}

export function pruneTombstones(deleted, now = Date.now()) {
  const limit = TOMBSTONE_DAYS * 86400000;
  for (const k of Object.keys(deleted)) if (now - deleted[k] > limit) delete deleted[k];
}

export function makePayload(state, meta) {
  const { records, order } = flatten(state);
  return { app: '27', v: 1, savedAt: new Date().toISOString(), startDate: state.settings?.startDate || '', records, updated: { ...meta.updated }, deleted: { ...meta.deleted }, order };
}
export const fingerprint = p => hash(stable({ r: p.records, u: p.updated, d: p.deleted, o: p.order, s: p.startDate }));

export function isFresh(state) {
  const empty = o => !o || !Object.keys(o).length;
  return empty(state.habitEntries) && empty(state.moods) && empty(state.reflections) &&
    ['sessions', 'grades', 'extras', 'goals', 'books', 'tasks', 'quizRuns', 'favorites'].every(b => !(state[b] || []).length);
}

/* ---------- cifrado ---------- */
const keyCache = new Map();
async function deriveKey(pass, salt) {
  const id = pass + '|' + b64(salt);
  if (keyCache.has(id)) return keyCache.get(id);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  keyCache.set(id, key);
  return key;
}
async function pipe(bytes, stream) {
  const w = stream.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
export async function encryptPayload(payload, pass, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let bytes = new TextEncoder().encode(JSON.stringify(payload));
  const z = typeof CompressionStream !== 'undefined';
  if (z) bytes = await pipe(bytes, new CompressionStream('gzip'));
  const key = await deriveKey(pass, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { app: '27-sync', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, z: z ? 1 : 0, salt: b64(salt), iv: b64(iv), data: b64(data) };
}
export async function decryptEnvelope(env, pass) {
  if (!env || env.app !== '27-sync' || !env.data) { const e = new Error('Formato no reconocido'); e.code = 'FORMAT'; throw e; }
  try {
    const key = await deriveKey(pass, unb64(env.salt));
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data)));
    if (env.z) bytes = await pipe(bytes, new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) { const e = new Error('Contraseña incorrecta'); e.code = 'BADPASS'; throw e; }
}

/* ---------- API de GitHub ---------- */
async function gh(cfg, method, path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method, cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch { const e = new Error('Sin conexión'); e.code = 'OFFLINE'; throw e; }
  if (res.ok) return res.status === 204 ? null : res.json();
  const e = new Error('GitHub ' + res.status); e.status = res.status;
  try { e.detail = (await res.json()).message; } catch { /* sin detalle */ }
  throw e;
}
const repoPath = cfg => `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;

export async function checkRepo(cfg) {
  try {
    const r = await gh(cfg, 'GET', repoPath(cfg));
    if (r.private === false) return { ok: false, message: 'El repositorio es público. Hazlo privado en GitHub (Settings → Danger Zone) y vuelve a intentarlo.' };
    if (r.permissions && r.permissions.push === false) return { ok: false, message: 'El token no puede escribir en el repositorio. Dale el permiso Contents: Read and write.' };
    return { ok: true };
  } catch (e) {
    if (e.code === 'OFFLINE') return { ok: false, message: 'No hay conexión con GitHub.' };
    if (e.status === 401) return { ok: false, message: 'El token no es válido o ha caducado.' };
    if (e.status === 403) return { ok: false, message: 'GitHub rechazó el acceso (permisos o límite de uso): ' + (e.detail || '') };
    if (e.status === 404) return { ok: false, message: 'No encuentro ese repositorio con ese token. Revisa usuario, nombre del repositorio y que el token tenga acceso a él.' };
    return { ok: false, message: 'Error de GitHub: ' + (e.detail || e.status) };
  }
}

async function ghRead(cfg) {
  let file;
  try { file = await gh(cfg, 'GET', `${repoPath(cfg)}/contents/${FILE}`); }
  catch (e) { if (e.status === 404) return { sha: null, payload: null }; throw e; }
  let content = file.encoding === 'base64' ? file.content : '';
  if (!content) { const blob = await gh(cfg, 'GET', `${repoPath(cfg)}/git/blobs/${file.sha}`); content = blob.content; }
  let env;
  try { env = JSON.parse(atob(content.replace(/\s/g, ''))); } catch { const e = new Error('Formato no reconocido'); e.code = 'FORMAT'; throw e; }
  const payload = await decryptEnvelope(env, cfg.pass);
  return { sha: file.sha, payload, salt: env.salt };
}
async function ghWrite(cfg, payload, sha, salt) {
  const env = await encryptPayload(payload, cfg.pass, salt);
  const body = { message: '27 · sincronización ' + new Date().toISOString(), content: btoa(JSON.stringify(env)) };
  if (sha) body.sha = sha;
  await gh(cfg, 'PUT', `${repoPath(cfg)}/contents/${FILE}`, body);
}

/* ---------- controlador ---------- */
export function createSync(hooks) {
  const load = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  let cfg = load(CFG_KEY);
  let meta = Object.assign(emptyMeta(), load(META_KEY) || {});
  let running = false, queued = false, timer = null, info = { state: 'idle', message: '' };
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* lleno */ } };
  const setInfo = (state, message = '') => { info = { state, message }; hooks.onStatus(getInfo()); };
  const getInfo = () => ({ configured: Boolean(cfg), owner: cfg?.owner, repo: cfg?.repo, lastSync: meta.lastSync, dirty: meta.dirty, ...info });

  function stamp() { stampMeta(meta, flatten(hooks.getState()).records); }
  const rebuildHashes = records => { meta.hashes = {}; for (const [k, v] of Object.entries(records)) meta.hashes[k] = hash(stable(v)); };

  function adopt(payload) { // sustituye los datos de este dispositivo por los de GitHub
    const base = hooks.getState();
    const next = buildState(base, payload.records, payload.order, {});
    if (payload.startDate) next.settings = { ...base.settings, startDate: payload.startDate };
    meta.updated = { ...payload.updated }; meta.deleted = { ...payload.deleted };
    rebuildHashes(payload.records);
    hooks.replaceState(next);
  }

  async function syncNow() {
    if (!cfg) return;
    if (running) { queued = true; return; }
    running = true; clearTimeout(timer);
    setInfo('syncing');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        stamp();
        const st = hooks.getState();
        const remote = await ghRead(cfg);
        if (!remote.sha) { await ghWrite(cfg, makePayload(st, meta), null, null); meta.dirty = false; break; }
        const rp = remote.payload;
        const loc = flatten(st);
        const m = merge({ records: loc.records, updated: meta.updated, deleted: meta.deleted }, rp);
        pruneTombstones(m.deleted);
        const startDate = [st.settings?.startDate, rp.startDate].filter(Boolean).sort()[0] || '';
        let next = buildState(st, m.records, rp.order, loc.order);
        const changed = stable(loc.records) !== stable(m.records) || (startDate && startDate !== st.settings?.startDate);
        if (changed) { if (startDate) next.settings = { ...st.settings, startDate }; }
        meta.updated = m.updated; meta.deleted = m.deleted; rebuildHashes(m.records);
        if (changed) hooks.replaceState(next); else next = st;
        const payload = makePayload(next, meta); payload.startDate = startDate;
        if (fingerprint(payload) !== fingerprint(rp)) {
          try { await ghWrite(cfg, payload, remote.sha, remote.salt); }
          catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }
        }
        meta.dirty = false; break;
      }
      meta.lastSync = Date.now(); saveMeta(); setInfo('ok');
    } catch (e) {
      saveMeta();
      if (e.code === 'OFFLINE') setInfo('offline', 'Sin conexión: se sincronizará al volver.');
      else if (e.code === 'BADPASS') setInfo('error', 'La contraseña de cifrado no coincide con la de los datos guardados.');
      else if (e.status === 401) setInfo('error', 'El token no es válido o ha caducado. Vuelve a conectar con un token nuevo.');
      else setInfo('error', 'No se pudo sincronizar' + (e.detail ? ': ' + e.detail : '.'));
    } finally {
      running = false;
      if (queued) { queued = false; setTimeout(syncNow, 800); }
    }
  }

  return {
    configured: () => Boolean(cfg),
    info: getInfo,
    syncNow,
    // Se llama tras cada cambio local: anota qué cambió y programa la subida.
    notifyChange() {
      if (!cfg) return;
      stamp(); saveMeta();
      setInfo('pending');
      clearTimeout(timer); timer = setTimeout(syncNow, 1800);
    },
    // choice: undefined (primer intento), 'replace' o 'merge'
    async connect(input, choice) {
      const c = { owner: input.owner.trim(), repo: input.repo.trim(), token: input.token.trim(), pass: input.pass };
      const chk = await checkRepo(c);
      if (!chk.ok) return { ok: false, message: chk.message };
      let remote;
      try { remote = await ghRead(c); }
      catch (e) {
        if (e.code === 'BADPASS') return { ok: false, message: 'Ese archivo ya existe y la contraseña no coincide. Usa la misma contraseña que en tu otro dispositivo.' };
        if (e.code === 'FORMAT') return { ok: false, message: `En el repositorio ya hay un archivo ${FILE} que no es de 27.` };
        return { ok: false, message: e.code === 'OFFLINE' ? 'No hay conexión con GitHub.' : 'No se pudo leer el repositorio.' };
      }
      const st = hooks.getState();
      if (remote.sha && !isFresh(st) && !choice) return { ok: false, choice: true };
      cfg = c; try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* sin espacio */ }
      if (remote.sha && (isFresh(st) || choice === 'replace')) {
        adopt(remote.payload); meta.dirty = false; meta.lastSync = Date.now(); saveMeta(); setInfo('ok');
        return { ok: true, adopted: true };
      }
      meta = emptyMeta();
      await syncNow();
      return { ok: true };
    },
    disconnect() {
      cfg = null; meta = emptyMeta(); clearTimeout(timer);
      try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(META_KEY); } catch { /* nada */ }
      info = { state: 'idle', message: '' }; hooks.onStatus(getInfo());
    },
    start() {
      if (!cfg) return;
      syncNow();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
      window.addEventListener('online', syncNow);
      setInterval(() => { if (!document.hidden) syncNow(); }, 120000);
    }
  };
}
