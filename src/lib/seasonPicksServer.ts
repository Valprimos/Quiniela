import { db } from './db';
import { MatchLite, buildLiga, isFinished } from './league';
import { DEFAULT_DEADLINES, DEFAULT_ZONES, Zones, normalizeZones } from './seasonPicks';
import { fetchAll } from './paging';

type Supa = ReturnType<typeof db>;

export type SettingsRow = {
  group_id: string;
  season: number;
  deadline: string | null;
  zones: unknown;
  results: { order?: string[] | null; awards?: Record<string, string[]> } | null;
};

// ¿Existen ya las tablas? Mientras no se ejecute la migración, la sección no se ofrece.
export function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return error.code === '42P01' || error.code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache');
}

export async function loadSettings(supabase: Supa, gid: string, season: number) {
  const { data, error } = await supabase
    .from('season_settings')
    .select('group_id,season,deadline,zones,results')
    .eq('group_id', gid)
    .eq('season', season)
    .maybeSingle();
  return { settings: (data as SettingsRow | null) ?? null, error };
}

export type DeadlineInfo = { iso: string | null; source: 'admin' | 'default' | 'jornada1' | 'none' };

// 1) el que fije el admin; 2) el de este año (6 nov, 20:59); 3) 1 minuto antes del primer partido de la jornada 1
export function resolveDeadline(settings: SettingsRow | null, season: number, matches: MatchLite[]): DeadlineInfo {
  if (settings?.deadline) return { iso: new Date(settings.deadline).toISOString(), source: 'admin' };
  const fixed = DEFAULT_DEADLINES[season];
  if (fixed) return { iso: new Date(fixed).toISOString(), source: 'default' };
  const first = matches
    .filter((m) => m.matchday === 1)
    .map((m) => new Date(m.utc_date).getTime())
    .sort((a, b) => a - b)[0];
  if (first) return { iso: new Date(first - 60_000).toISOString(), source: 'jornada1' };
  return { iso: null, source: 'none' };
}

export const isClosed = (d: DeadlineInfo, now = Date.now()) => !!d.iso && now >= new Date(d.iso).getTime();

export async function loadLigaMatches(supabase: Supa, season: number): Promise<MatchLite[]> {
  return fetchAll<MatchLite>((from, to) =>
    supabase
      .from('matches')
      .select('id,competition,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score')
      .eq('competition', 'PD')
      .eq('season', season)
      .order('id')
      .range(from, to)
  );
}

export type Team = { name: string; crest: string | null };

// Equipos de La Liga de la temporada (según los partidos cargados), por orden alfabético
export function teamsOf(matches: MatchLite[]): Team[] {
  const liga = buildLiga(matches.filter((m) => m.matchday < 100));
  return liga.map((r) => ({ name: r.team, crest: r.crest })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// Clasificación de verdad: la que fije el admin; si no, la calculada con los resultados guardados.
export function effectiveOrder(settings: SettingsRow | null, matches: MatchLite[]) {
  const liga = buildLiga(matches.filter((m) => m.matchday < 100));
  const played = matches.some(isFinished);
  const total = matches.filter((m) => m.matchday < 100).length;
  const allDone = total > 0 && matches.filter((m) => m.matchday < 100).every(isFinished);
  const official = settings?.results?.order;
  if (Array.isArray(official) && official.length) {
    return { order: official, source: 'oficial' as const, final: true };
  }
  if (!played) return { order: null, source: 'ninguna' as const, final: false };
  return { order: liga.map((r) => r.team), source: (allDone ? 'calculada' : 'provisional') as 'calculada' | 'provisional', final: allDone };
}

export function zonesOf(settings: SettingsRow | null, teamCount: number): Zones {
  return settings?.zones ? normalizeZones(settings.zones, teamCount) : { ...DEFAULT_ZONES };
}
