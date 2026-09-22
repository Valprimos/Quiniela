import { db } from './db';
import { fetchMatches, FootballDataError } from './football';
import { fetchTheSportsDbMatches, TheSportsDbError } from './thesportsdb';
import { currentSeason } from './season';
import { COMPETITIONS, CompetitionCode, CompetitionDef, KNOCKOUT_STAGE_ORDER } from './competitions';

const LIVE = ['IN_PLAY', 'PAUSED', 'LIVE'];
const OPEN = ['SCHEDULED', 'TIMED', ...LIVE];

type Row = {
  id: number;
  utc_date: string;
  status: string;
  stage: string | null;
  matchdayRaw: number;
  home_name: string;
  away_name: string;
  home_crest: string | null;
  away_crest: string | null;
  home_score: number | null;
  away_score: number | null;
};

// ¿Hay algún partido de esta competición en juego o a punto de empezar?
// Si lo hay, sincronizamos más a menudo.
async function isHot(competition: CompetitionCode): Promise<boolean> {
  const now = Date.now();
  const { count } = await db()
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('competition', competition)
    .eq('season', currentSeason())
    .in('status', OPEN)
    .gte('utc_date', new Date(now - 4 * 3600e3).toISOString())
    .lte('utc_date', new Date(now + 20 * 60e3).toISOString());
  return (count ?? 0) > 0;
}

// Un partido sin jornada (las eliminatorias de la Champions no siempre la traen) recibe
// un número sintético por fase, para que se puedan agrupar y ordenar igual que una jornada normal.
function syntheticMatchday(stage: string | undefined, fallback: number): number {
  if (!stage) return fallback;
  const idx = KNOCKOUT_STAGE_ORDER.indexOf(stage);
  return idx === -1 ? fallback : 100 + idx;
}

async function fetchRows(def: CompetitionDef, season: number): Promise<Row[]> {
  if (def.source === 'thesportsdb') {
    const matches = await fetchTheSportsDbMatches(season);
    return matches.map((m) => ({
      id: m.id,
      utc_date: m.utcDate,
      status: m.status,
      stage: null,
      matchdayRaw: m.matchday,
      home_name: m.homeTeam.name,
      away_name: m.awayTeam.name,
      home_crest: m.homeTeam.crest,
      away_crest: m.awayTeam.crest,
      home_score: m.homeScore,
      away_score: m.awayScore,
    }));
  }
  const matches = await fetchMatches(season, def.apiCode);
  return matches.map((m) => ({
    id: m.id,
    utc_date: m.utcDate,
    status: m.status,
    stage: m.stage ?? null,
    matchdayRaw: syntheticMatchday(m.stage, m.matchday ?? 0),
    home_name: m.homeTeam.shortName ?? m.homeTeam.name,
    away_name: m.awayTeam.shortName ?? m.awayTeam.name,
    home_crest: m.homeTeam.crest ?? null,
    away_crest: m.awayTeam.crest ?? null,
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
  }));
}

async function syncOne(competition: CompetitionCode): Promise<number> {
  const def = COMPETITIONS.find((c) => c.code === competition)!;
  const season = currentSeason();
  const rows = await fetchRows(def, season);

  // No pisar los partidos que un admin ha corregido a mano
  const { data: overridden } = await db()
    .from('matches')
    .select('id')
    .eq('competition', competition)
    .eq('manual_override', true);
  const keepAsIs = new Set((overridden ?? []).map((r) => r.id));

  const payload = rows
    .filter((r) => !keepAsIs.has(r.id) && r.matchdayRaw > 0)
    .map((r) => ({
      id: r.id,
      competition,
      season,
      matchday: r.matchdayRaw,
      stage: r.stage,
      utc_date: r.utc_date,
      status: r.status,
      home_name: r.home_name,
      away_name: r.away_name,
      home_crest: r.home_crest,
      away_crest: r.away_crest,
      home_score: r.home_score,
      away_score: r.away_score,
      updated_at: new Date().toISOString(),
    }));
  if (payload.length) {
    const { error } = await db().from('matches').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  }
  return payload.length;
}

// Sincroniza solo si los datos de esa competición están "viejos": 2 min con partidos en
// juego, 3 h el resto del tiempo. El "reclamo" en sync_state evita que dos peticiones a
// la vez llamen a la API de fútbol para la misma competición.
async function syncCompetitionIfStale(
  competition: CompetitionCode,
  force: boolean
): Promise<{ competition: string; synced: boolean; count?: number; error?: string }> {
  const maxAge = force ? 0 : (await isHot(competition)) ? 2 * 60e3 : 3 * 3600e3;
  const cutoff = new Date(Date.now() - maxAge).toISOString();
  const { data, error } = await db()
    .from('sync_state')
    .update({ last_synced: new Date().toISOString() })
    .eq('competition', competition)
    .or(`last_synced.is.null,last_synced.lt.${cutoff}`)
    .select();
  if (error || !data?.length) return { competition, synced: false };
  try {
    return { competition, synced: true, count: await syncOne(competition) };
  } catch (e) {
    let msg = 'Fallo al sincronizar';
    if (e instanceof FootballDataError && e.status === 403) msg = 'No incluida en tu plan de football-data.org';
    else if (e instanceof TheSportsDbError) msg = e.message;
    console.error(`Fallo al sincronizar ${competition}`, e);
    return { competition, synced: false, error: msg };
  }
}

export async function syncIfStale(force = false) {
  return Promise.all(COMPETITIONS.map((c) => syncCompetitionIfStale(c.code, force)));
}
