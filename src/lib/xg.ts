// Importación del xG (goles esperados) de La Liga desde Understat.
//
// OJO: Understat no tiene API oficial ni pública. Esto lee lo que publica su web, que ha cambiado
// de forma con el tiempo, así que el lector admite las dos que se conocen:
//   1. El JSON de /getLeagueData/La_liga/<año> (lo que usa su propia web ahora).
//   2. La variable `datesData = JSON.parse('...')` incrustada en el HTML de /league/La_liga/<año>.
// Si ninguna funciona (la web cambia, o bloquea las peticiones desde el servidor), el panel de
// admin permite poner el xG a mano partido a partido: ese camino no depende de nadie.

export type UMatch = {
  home: string;
  away: string;
  goalsH: number | null;
  goalsA: number | null;
  xgH: number;
  xgA: number;
  at: number; // instante en ms
};

export class XgError extends Error {}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

// Solo los partidos ya jugados y con xG de los dos equipos
function fromDates(list: unknown[]): UMatch[] {
  const out: UMatch[] = [];
  for (const raw of list) {
    const m = raw as {
      isResult?: boolean;
      h?: { title?: string; short_title?: string };
      a?: { title?: string; short_title?: string };
      goals?: { h?: unknown; a?: unknown };
      xG?: { h?: unknown; a?: unknown };
      datetime?: string;
    };
    if (m?.isResult === false) continue;
    const xgH = num(m?.xG?.h);
    const xgA = num(m?.xG?.a);
    const home = m?.h?.title ?? m?.h?.short_title;
    const away = m?.a?.title ?? m?.a?.short_title;
    const at = m?.datetime ? Date.parse(m.datetime.replace(' ', 'T') + 'Z') : NaN;
    if (xgH == null || xgA == null || !home || !away || !Number.isFinite(at)) continue;
    out.push({ home, away, goalsH: num(m?.goals?.h), goalsA: num(m?.goals?.a), xgH, xgA, at });
  }
  return out;
}

// Respuesta JSON: { dates: [...] } (o la lista directamente)
export function parseUnderstatJson(payload: unknown): UMatch[] {
  const p = payload as { dates?: unknown; datesData?: unknown } | unknown[] | null;
  const list = Array.isArray(p) ? p : Array.isArray(p?.dates) ? p.dates : Array.isArray(p?.datesData) ? p.datesData : null;
  return list ? fromDates(list) : [];
}

// HTML: datesData = JSON.parse('\x5B\x7B...') con los caracteres escapados como \xNN
export function parseUnderstatHtml(html: string): UMatch[] {
  const m = html.match(/datesData\s*=\s*JSON\.parse\(\s*'([^']*)'\s*\)/);
  if (!m) return [];
  const text = m[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\'/g, "'");
  try {
    return parseUnderstatJson(JSON.parse(text));
  } catch {
    return [];
  }
}

const UA = 'Mozilla/5.0 (compatible; QuinielaBot/1.0)';

export async function fetchUnderstatLaLiga(year: number): Promise<UMatch[]> {
  const page = `https://understat.com/league/La_liga/${year}`;
  let lastStatus = 0;
  try {
    const res = await fetch(`https://understat.com/getLeagueData/La_liga/${year}`, {
      headers: { 'user-agent': UA, 'x-requested-with': 'XMLHttpRequest', referer: page, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    lastStatus = res.status;
    if (res.ok) {
      const got = parseUnderstatJson(await res.json().catch(() => null));
      if (got.length) return got;
    }
  } catch {
    /* se prueba con el HTML */
  }
  try {
    const res = await fetch(page, { headers: { 'user-agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    lastStatus = res.status;
    if (res.ok) {
      const got = parseUnderstatHtml(await res.text());
      if (got.length) return got;
    }
  } catch {
    /* sin conexión */
  }
  throw new XgError(
    lastStatus
      ? `Understat respondió ${lastStatus} o ha cambiado su formato. Pon el xG a mano.`
      : 'No se pudo conectar con Understat. Pon el xG a mano.'
  );
}

// ---------- Emparejar nombres de equipo (Understat vs. football-data.org) ----------

const STOP = new Set(['fc', 'cf', 'cd', 'ud', 'sd', 'rc', 'rcd', 'ca', 'club', 'de', 'del', 'real', 'deportivo', 'balompie', 'futbol', 'las', 'la', 'el']);

// "Athletic Club" y "Athletic" -> "athletic"; "Atlético de Madrid" y "Atleti" -> "atletico"; "Barça" -> "barcelona"
export function teamKey(name: string): string {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();
  if (/\batleti/.test(n)) return 'atletico';
  if (/\bbarca/.test(n)) return 'barcelona';
  const words = n.split(/\s+/).filter((w) => w && !STOP.has(w));
  return words[0] ?? n;
}

export type DbMatchRef = { id: number; home_name: string; away_name: string; utc_date: string };

const DAY = 86400e3;

// Cada partido de Understat se empareja con el de la base que tenga los mismos equipos y la fecha
// más cercana (hasta 3 días de margen por aplazamientos u horarios). Un partido de la base se usa una vez.
export function pairWithDb(u: UMatch[], db: DbMatchRef[]): { id: number; xgH: number; xgA: number }[] {
  const byTeams = new Map<string, DbMatchRef[]>();
  for (const m of db) {
    const k = `${teamKey(m.home_name)}|${teamKey(m.away_name)}`;
    (byTeams.get(k) ?? byTeams.set(k, []).get(k)!).push(m);
  }
  const used = new Set<number>();
  const out: { id: number; xgH: number; xgA: number }[] = [];
  for (const x of u) {
    const cands = byTeams.get(`${teamKey(x.home)}|${teamKey(x.away)}`) ?? [];
    let best: DbMatchRef | null = null;
    let bestD = 3 * DAY + 1;
    for (const c of cands) {
      if (used.has(c.id)) continue;
      const d = Math.abs(Date.parse(c.utc_date) - x.at);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      used.add(best.id);
      out.push({ id: best.id, xgH: Math.round(x.xgH * 100) / 100, xgA: Math.round(x.xgA * 100) / 100 });
    }
  }
  return out;
}
