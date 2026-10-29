import { db } from './db';
import { fetchMatches, FootballDataError } from './football';
import { currentSeason } from './season';
import { COMPETITIONS, CompetitionCode, KNOCKOUT_STAGE_ORDER } from './competitions';
import { reconcilePleno } from './pleno';

const LIVE = ['IN_PLAY', 'PAUSED', 'LIVE'];
const OPEN = ['SCHEDULED', 'TIMED', ...LIVE];

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

async function syncOne(competition: CompetitionCode): Promise<number> {
  const def = COMPETITIONS.find((c) => c.code === competition)!;
  const season = currentSeason();
  const matches = await fetchMatches(season, def.apiCode);

  // No pisar los partidos que un admin ha corregido a mano
  const { data: overridden } = await db()
    .from('matches')
    .select('id')
    .eq('competition', competition)
    .eq('manual_override', true);
  const keepAsIs = new Set((overridden ?? []).map((r) => r.id));

  const rows = matches
    .filter((m) => !keepAsIs.has(m.id))
    .map((m) => ({
      id: m.id,
      competition,
      season,
      matchday: syntheticMatchday(m.stage, m.matchday ?? 0),
      stage: m.stage ?? null,
      utc_date: m.utcDate,
      status: m.status,
      home_name: m.homeTeam.shortName ?? m.homeTeam.name,
      away_name: m.awayTeam.shortName ?? m.awayTeam.name,
      home_crest: m.homeTeam.crest ?? null,
      away_crest: m.awayTeam.crest ?? null,
      home_score: m.score.fullTime.home,
      away_score: m.score.fullTime.away,
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => r.matchday > 0);
  if (rows.length) {
    const { error } = await db().from('matches').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  // Tras cambiar fechas u horarios, el pleno al 15 puede haber dejado de ser el penúltimo
  // partido de su jornada: se recalcula sin esperar a que alguien abra la app.
  try {
    const { data: all } = await db()
      .from('matches')
      .select('id,matchday,utc_date,status,is_pleno')
      .eq('competition', competition)
      .eq('season', season)
      .limit(1000);
    await reconcilePleno(db(), all ?? []);
  } catch (e) {
    console.error(`No se pudo recalcular el pleno al 15 de ${competition}`, e);
  }
  return rows.length;
}

// Mensaje claro de por qué ha fallado la sincronización (sale en el aviso de la app y en el panel de admin)
function describeError(e: unknown): string {
  if (e instanceof FootballDataError) {
    if (e.status === 0) return 'Falta FOOTBALL_DATA_TOKEN en Vercel';
    if (e.status === 400 || e.status === 401) return 'La clave de football-data.org no es válida';
    if (e.status === 403) return 'No incluida en tu plan de football-data.org';
    if (e.status === 429) return 'Límite de peticiones de football-data.org: se reintenta en un minuto';
    if (e.status === -1) return 'No se pudo conectar con football-data.org';
    return `football-data.org respondió ${e.status}`;
  }
  return 'No se pudieron guardar los partidos';
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
    const count = await syncOne(competition);
    // Para el panel de admin; si aún no se ha ejecutado la migración 6, el error se ignora
    await db().from('sync_state').update({ last_ok: new Date().toISOString(), last_error: null }).eq('competition', competition);
    return { competition, synced: true, count };
  } catch (e) {
    console.error(`Fallo al sincronizar ${competition}`, e);
    // El "reclamo" ya marcó la competición como recién sincronizada. Si falla, se deja para reintentarlo
    // en 1 minuto (y no esperar 3 horas con resultados sin actualizar).
    await db()
      .from('sync_state')
      .update({ last_synced: new Date(Date.now() - maxAge + 60e3).toISOString() })
      .eq('competition', competition);
    const error = describeError(e);
    await db().from('sync_state').update({ last_error: error }).eq('competition', competition);
    return { competition, synced: false, error };
  }
}

export async function syncIfStale(force = false) {
  return Promise.all(COMPETITIONS.map((c) => syncCompetitionIfStale(c.code, force)));
}
