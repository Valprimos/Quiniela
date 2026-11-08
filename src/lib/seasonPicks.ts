// Predicciones de temporada: lógica pura (sin base de datos), compartida por servidor y navegador.

// ---------- Tramos clave de la clasificación ----------

export type ZoneKey = 'champions' | 'europa' | 'conference' | 'relegation';
export type Zones = Record<ZoneKey, [number, number]>;

// Valores habituales de La Liga. El admin puede ajustarlos al final de temporada
// (por ejemplo, si España consigue una quinta plaza de Champions o cambia el reparto europeo).
export const DEFAULT_ZONES: Zones = {
  champions: [1, 4],
  europa: [5, 6],
  conference: [7, 7],
  relegation: [18, 20],
};

export const ZONE_ORDER: ZoneKey[] = ['champions', 'europa', 'conference', 'relegation'];

export const ZONE_LABEL: Record<ZoneKey, string> = {
  champions: 'Champions*',
  europa: 'Europa League*',
  conference: 'Conference',
  relegation: 'Descenso',
};

// Puntos
export const PTS_EXACT = 3; // equipo en su posición exacta (fuera de tramos clave)
export const PTS_ZONE = 3; // equipo dentro del tramo clave correcto, pero en otra posición
export const PTS_ZONE_EXACT = 5; // equipo en su posición exacta dentro de un tramo clave (en total, no se suma a lo anterior)

export function normalizeZones(raw: unknown, teamCount = 20): Zones {
  const out: Zones = { ...DEFAULT_ZONES };
  if (raw && typeof raw === 'object') {
    for (const k of ZONE_ORDER) {
      const v = (raw as Record<string, unknown>)[k];
      if (Array.isArray(v) && v.length === 2) {
        const a = Math.round(Number(v[0]));
        const b = Math.round(Number(v[1]));
        if (Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= a && b <= teamCount) out[k] = [a, b];
      }
    }
  }
  return out;
}

// Si una configuración se solapa (dos tramos con la misma posición), gana el primero de ZONE_ORDER.
export function zoneOf(pos: number, zones: Zones): ZoneKey | null {
  for (const k of ZONE_ORDER) {
    const [a, b] = zones[k];
    if (pos >= a && pos <= b) return k;
  }
  return null;
}

// ---------- Premios de jugadores ----------

export type AwardDef = { key: string; label: string; group: 'liga' | 'champions' | 'mundial'; pts: number; goalkeeper?: boolean };

export const AWARDS: AwardDef[] = [
  { key: 'liga_pichichi', label: 'Pichichi', group: 'liga', pts: 3 },
  { key: 'liga_asistente', label: 'Máximo asistente', group: 'liga', pts: 3 },
  { key: 'liga_zamora', label: 'Zamora', group: 'liga', pts: 3, goalkeeper: true },
  { key: 'champions_pichichi', label: 'Máximo goleador', group: 'champions', pts: 3 },
  { key: 'champions_asistente', label: 'Máximo asistente', group: 'champions', pts: 3 },
  { key: 'champions_portero', label: 'Mejor portero', group: 'champions', pts: 3, goalkeeper: true },
  { key: 'bota_oro', label: 'Bota de Oro', group: 'mundial', pts: 5 },
  { key: 'mvp', label: 'MVP de la temporada', group: 'mundial', pts: 5 },
];

export const CHAMPIONS_PICKS = [
  { key: 'champions_finalista1', label: 'Finalista 1', pts: 3 },
  { key: 'champions_finalista2', label: 'Finalista 2', pts: 3 },
  { key: 'champions_campeon', label: 'Campeón', pts: 5 },
] as const;
export const CHAMPIONS_MAX_POINTS = 8; // campeón (5) y el otro finalista (3); no se suman 3 extra por el campeón

export const CHAMPIONS_RESULT_KEYS = ['champions_campeon', 'champions_finalistas'] as const;
export const AWARD_RESULT_KEYS = [...AWARDS.map((a) => a.key), ...CHAMPIONS_RESULT_KEYS];

export const AWARD_GROUP_LABEL: Record<AwardDef['group'], string> = {
  liga: 'La Liga',
  champions: 'Champions League',
  mundial: 'Mundial',
};

export const INDIVIDUAL_AWARD_KEYS = AWARDS.map((a) => a.key);
export const AWARD_KEYS = [...INDIVIDUAL_AWARD_KEYS, ...CHAMPIONS_PICKS.map((a) => a.key)];

// ---------- Nombres ----------

function tokens(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

export function cleanName(s: unknown, max = 60): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// Dos escrituras de un mismo jugador: sin tildes ni mayúsculas, y vale que una sea parte de la otra
// ("Mbappé" = "Kylian Mbappé"). Una sola palabra tiene que tener al menos 4 letras para contar.
export function sameName(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length === 1 && short[0].length < 4) return short[0] === long.join('');
  return short.every((t) => long.includes(t));
}

// Para equipos: igualdad exacta una vez normalizado ("Atlético" no vale por "Atlético de Madrid" salvo que sean iguales)
export function sameTeam(a: string, b: string): boolean {
  return tokens(a).join('') === tokens(b).join('');
}

// ---------- Unificar nombres de jugadores ----------
// La gente escribe "Yamal", "Lamine" o "Lamine Yamal". Para ver lo de todos junto y para elegir ganadores
// agrupamos esas escrituras. El admin puede corregir la agrupación (se guarda como "alias").

export type Aliases = Record<string, string>; // lo que escribieron (normalizado) -> nombre unificado

export const nameKey = (s: string): string => tokens(s).join(' ');

export type NameVariant = { key: string; text: string; count: number };

function pretty(s: string): string {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (!letters || (letters !== letters.toLowerCase() && letters !== letters.toUpperCase())) return s;
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

// Escrituras distintas (sin tildes ni mayúsculas) con la forma más usada y cuántas veces aparece
export function variantsOf(names: string[]): NameVariant[] {
  const by = new Map<string, Map<string, number>>();
  for (const raw of names) {
    const text = cleanName(raw);
    const key = nameKey(text);
    if (!key) continue;
    const spellings = by.get(key) ?? new Map<string, number>();
    spellings.set(text, (spellings.get(text) ?? 0) + 1);
    by.set(key, spellings);
  }
  const hasCaps = (t: string) => (/\p{Lu}/u.test(t) ? 1 : 0);
  return [...by]
    .map(([key, spellings]) => {
      const best = [...spellings].sort((a, b) => b[1] - a[1] || hasCaps(b[0]) - hasCaps(a[0]))[0][0];
      return { key, text: pretty(best), count: [...spellings.values()].reduce((x, y) => x + y, 0) };
    })
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'es'));
}

// Propuesta automática: mismas reglas que la puntuación (sameName). Se queda con el nombre más completo.
export function autoCanonical(variants: NameVariant[]): Record<string, string> {
  const parent = variants.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      if (sameName(variants[i].text, variants[j].text)) parent[find(j)] = find(i);
    }
  }
  const best = new Map<number, NameVariant>();
  const score = (v: NameVariant) => [tokens(v.text).length, v.text.length, v.count];
  const better = (a: NameVariant, b: NameVariant) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i];
    return false;
  };
  variants.forEach((v, i) => {
    const root = find(i);
    const cur = best.get(root);
    if (!cur || better(v, cur)) best.set(root, v);
  });
  const out: Record<string, string> = {};
  variants.forEach((v, i) => (out[v.key] = best.get(find(i))!.text));
  return out;
}

// Nombre unificado de cada escritura: lo que haya fijado el admin y, si no, la propuesta automática
export function resolveNames(variants: NameVariant[], aliases?: Aliases | null): Record<string, string> {
  const auto = autoCanonical(variants);
  const out: Record<string, string> = {};
  for (const v of variants) out[v.key] = cleanName(aliases?.[v.key]) || auto[v.key];
  return out;
}

export type NameCluster = { id: string; name: string; keys: string[] };

export function clustersFrom(variants: NameVariant[], resolved: Record<string, string>): NameCluster[] {
  const byName = new Map<string, NameCluster>();
  for (const v of variants) {
    const name = resolved[v.key] ?? v.text;
    const c = byName.get(name) ?? { id: `c${byName.size}`, name, keys: [] };
    c.keys.push(v.key);
    byName.set(name, c);
  }
  return [...byName.values()];
}

// Si un grupo se llamaba como la escritura que se va, pasa a llamarse como la mejor de las que se quedan
// (si no, "Nico Williams" seguiría unificado como "Iñaki Williams" al separar a este último).
function renameAfterLeave(c: NameCluster, leftKey: string, variants: NameVariant[]): NameCluster {
  if (!c.keys.length || nameKey(c.name) !== leftKey) return c;
  const byKey = new Map(variants.map((v) => [v.key, v]));
  const rest = c.keys.map((k) => byKey.get(k)).filter((v): v is NameVariant => !!v);
  if (!rest.length) return c;
  rest.sort((a, b) => tokens(b.text).length - tokens(a.text).length || b.text.length - a.text.length || b.count - a.count);
  return { ...c, name: rest[0].text };
}

export function moveVariant(clusters: NameCluster[], key: string, toId: string, variants: NameVariant[]): NameCluster[] {
  return clusters
    .map((c) => {
      const keys = c.keys.filter((k) => k !== key);
      if (c.id === toId) return { ...c, keys: [...keys, key] };
      return c.keys.includes(key) ? renameAfterLeave({ ...c, keys }, key, variants) : { ...c, keys };
    })
    .filter((c) => c.keys.length > 0);
}

export function separateVariant(clusters: NameCluster[], key: string, text: string, variants: NameVariant[]): NameCluster[] {
  const rest = clusters
    .map((c) => (c.keys.includes(key) ? renameAfterLeave({ ...c, keys: c.keys.filter((k) => k !== key) }, key, variants) : c))
    .filter((c) => c.keys.length > 0);
  return [...rest, { id: `s:${key}`, name: text, keys: [key] }];
}

export function renameCluster(clusters: NameCluster[], id: string, name: string): NameCluster[] {
  return clusters.map((c) => (c.id === id ? { ...c, name } : c));
}

export function buildAliases(clusters: NameCluster[], variants: NameVariant[]): Aliases {
  const text = new Map(variants.map((v) => [v.key, v.text]));
  const out: Aliases = {};
  for (const c of clusters) for (const k of c.keys) out[k] = cleanName(c.name) || text.get(k) || k;
  return out;
}

// ---------- Clasificación media de La Liga ----------

export type AvgRow = { team: string; avg: number; median: number; min: number; max: number; firsts: number; n: number };

// Posición media de cada equipo según las clasificaciones de todos. Arriba, la media más baja;
// si empatan, la mediana, luego la mejor posición y, por último, el nombre.
export function averageRanking(rankings: string[][], teams: string[]): AvgRow[] {
  const keyOf = (t: string) => tokens(t).join('');
  const positions = new Map<string, number[]>(teams.map((t) => [keyOf(t), []]));
  for (const r of rankings) r.forEach((t, i) => positions.get(keyOf(t))?.push(i + 1));
  const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return teams
    .map((team) => {
      const a = positions.get(keyOf(team)) ?? [];
      if (!a.length) return null;
      return {
        team,
        avg: a.reduce((x, y) => x + y, 0) / a.length,
        median: median(a),
        min: Math.min(...a),
        max: Math.max(...a),
        firsts: a.filter((x) => x === 1).length,
        n: a.length,
      };
    })
    .filter((r): r is AvgRow => !!r)
    .sort((x, y) => x.avg - y.avg || x.median - y.median || x.min - y.min || x.team.localeCompare(y.team, 'es'));
}

// ---------- Puntos ----------

export type TeamScore = {
  team: string;
  predPos: number;
  actualPos: number | null;
  pts: number;
  kind: 'exact' | 'zone' | 'miss';
  zone: ZoneKey | null; // tramo clave en el que la había puesto el jugador
};

export function scoreRanking(pred: string[] | null | undefined, actual: string[] | null | undefined, zones: Zones) {
  const rows: TeamScore[] = [];
  let points = 0;
  if (!pred?.length || !actual?.length) return { points, rows };
  pred.forEach((team, i) => {
    const predPos = i + 1;
    const idx = actual.findIndex((t) => sameTeam(t, team));
    const actualPos = idx >= 0 ? idx + 1 : null;
    const zone = zoneOf(predPos, zones);
    let pts = 0;
    let kind: TeamScore['kind'] = 'miss';
    if (actualPos === predPos) {
      pts = zone ? PTS_ZONE_EXACT : PTS_EXACT;
      kind = 'exact';
    } else if (actualPos != null && zone && zoneOf(actualPos, zones) === zone) {
      pts = PTS_ZONE;
      kind = 'zone';
    }
    points += pts;
    rows.push({ team, predPos, actualPos, pts, kind, zone });
  });
  return { points, rows };
}

export type AwardScore = { key: string; pick: string; pts: number; hit: boolean; decided: boolean };

export function scoreAwards(
  picks: Record<string, string> | null | undefined,
  winners: Record<string, string[]> | null | undefined,
  aliases?: Aliases | null
) {
  const rows: AwardScore[] = [];
  let points = 0;
  for (const a of AWARDS) {
    const pick = cleanName(picks?.[a.key]);
    const w = (winners?.[a.key] ?? []).filter(Boolean);
    const decided = w.length > 0;
    // Si el admin unificó este nombre, cuenta el nombre unificado (así "Williams" puede ser Nico o Iñaki a propósito)
    const effective = aliases?.[nameKey(pick)] || pick;
    const hit = !!pick && decided && w.some((x) => sameName(effective, x));
    const pts = hit ? a.pts : 0;
    points += pts;
    rows.push({ key: a.key, pick, pts, hit, decided });
  }
  return { points, rows };
}

export function scoreChampions(picks: Record<string, string> | null | undefined, winners: Record<string, string[]> | null | undefined) {
  const finalists = (winners?.champions_finalistas ?? []).filter(Boolean);
  const champions = (winners?.champions_campeon ?? []).filter(Boolean);
  const championPick = cleanName(picks?.champions_campeon);
  const championHit = !!championPick && champions.some((team) => sameTeam(championPick, team));
  const rows = CHAMPIONS_PICKS.map((p) => {
    const pick = cleanName(picks?.[p.key]);
    const actual = p.key === 'champions_campeon' ? champions : finalists;
    const decided = actual.length > 0;
    const hit = !!pick && decided && actual.some((team) => sameTeam(pick, team));
    const duplicateChampionCredit = p.key.startsWith('champions_finalista') && championHit && sameTeam(pick, championPick);
    const pts = p.key === 'champions_campeon' ? (championHit ? p.pts : 0) : hit && !duplicateChampionCredit ? p.pts : 0;
    return { key: p.key, pick, pts, hit, decided };
  });
  return { points: rows.reduce((sum, row) => sum + row.pts, 0), rows };
}

export function maxPoints(zones: Zones, teamCount = 20): { ranking: number; awards: number; total: number } {
  let ranking = 0;
  for (let p = 1; p <= teamCount; p++) ranking += zoneOf(p, zones) ? PTS_ZONE_EXACT : PTS_EXACT;
  const awards = AWARDS.reduce((s, a) => s + a.pts, 0) + CHAMPIONS_MAX_POINTS;
  return { ranking, awards, total: ranking + awards };
}

// ---------- Plazo ----------

// Plazo de este año: viernes 6 de noviembre de 2026 a las 21:00 (hora de Madrid, CET = UTC+1).
// En el resto de años cierra 1 minuto antes de que empiece la jornada 1 (ver seasonPicksServer.ts),
// salvo que el admin fije otra hora.
export const DEFAULT_DEADLINES: Record<number, string> = {
  2026: '2026-11-06T21:00:00+01:00',
};

export const TZ = 'Europe/Madrid';

export function fmtDeadline(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtShort(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function untilText(ms: number): string {
  if (ms <= 0) return 'ya';
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d >= 1) return `${d} d ${h} h`;
  if (h >= 1) return `${h} h ${mm} min`;
  return `${Math.max(1, mm)} min`;
}

// Pasar el valor de un <input type="datetime-local"> (hora de Madrid) a ISO UTC, y al revés.
export function madridLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  // Probamos los dos desfases posibles de Madrid (+1 y +2) y nos quedamos con el que, al volver, da la misma hora
  for (const off of [1, 2]) {
    const t = Date.UTC(y, mo - 1, d, h - off, mi);
    if (isoToMadridLocal(new Date(t).toISOString()) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`) return new Date(t).toISOString();
  }
  return new Date(Date.UTC(y, mo - 1, d, h - 1, mi)).toISOString();
}

export function isoToMadridLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}
