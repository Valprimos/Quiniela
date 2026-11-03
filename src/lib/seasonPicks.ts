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

export type AwardDef = { key: string; label: string; group: 'liga' | 'champions' | 'mundial'; pts: number; goalkeeper?: boolean; team?: boolean };

export const AWARDS: AwardDef[] = [
  { key: 'liga_pichichi', label: 'Pichichi', group: 'liga', pts: 3 },
  { key: 'liga_asistente', label: 'Máximo asistente', group: 'liga', pts: 3 },
  { key: 'liga_zamora', label: 'Zamora', group: 'liga', pts: 3, goalkeeper: true },
  { key: 'champions_pichichi', label: 'Máximo goleador', group: 'champions', pts: 3 },
  { key: 'champions_asistente', label: 'Máximo asistente', group: 'champions', pts: 3 },
  { key: 'champions_portero', label: 'Mejor portero', group: 'champions', pts: 3, goalkeeper: true },
  { key: 'champions_campeon', label: 'Campeón', group: 'champions', pts: 3, team: true },
  { key: 'champions_finalista', label: 'Finalista', group: 'champions', pts: 3, team: true },
  { key: 'bota_oro', label: 'Bota de Oro', group: 'mundial', pts: 5 },
  { key: 'mvp', label: 'MVP de la temporada', group: 'mundial', pts: 5 },
];

export const AWARD_GROUP_LABEL: Record<AwardDef['group'], string> = {
  liga: 'La Liga',
  champions: 'Champions League',
  mundial: 'Mundial',
};

export const AWARD_KEYS = AWARDS.map((a) => a.key);

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

export function scoreAwards(picks: Record<string, string> | null | undefined, winners: Record<string, string[]> | null | undefined) {
  const rows: AwardScore[] = [];
  let points = 0;
  for (const a of AWARDS) {
    const pick = cleanName(picks?.[a.key]);
    const w = (winners?.[a.key] ?? []).filter(Boolean);
    const decided = w.length > 0;
    const hit = !!pick && decided && w.some((x) => (a.team ? sameTeam(pick, x) : sameName(pick, x)));
    const pts = hit ? a.pts : 0;
    points += pts;
    rows.push({ key: a.key, pick, pts, hit, decided });
  }
  return { points, rows };
}

export function maxPoints(zones: Zones, teamCount = 20): { ranking: number; awards: number; total: number } {
  let ranking = 0;
  for (let p = 1; p <= teamCount; p++) ranking += zoneOf(p, zones) ? PTS_ZONE_EXACT : PTS_EXACT;
  const awards = AWARDS.reduce((s, a) => s + a.pts, 0);
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
