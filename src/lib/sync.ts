import { db } from './db';
import { fetchMatches } from './football';
import { currentSeason } from './season';

const LIVE = ['IN_PLAY', 'PAUSED', 'LIVE'];
const OPEN = ['SCHEDULED', 'TIMED', ...LIVE];

// ¿Hay algún partido en juego o a punto de empezar? Entonces sincronizamos más a menudo.
async function isHot(): Promise<boolean> {
  const now = Date.now();
  const { count } = await db()
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('season', currentSeason())
    .in('status', OPEN)
    .gte('utc_date', new Date(now - 4 * 3600e3).toISOString())
    .lte('utc_date', new Date(now + 20 * 60e3).toISOString());
  return (count ?? 0) > 0;
}

export async function syncMatches(): Promise<number> {
  const season = currentSeason();
  const matches = await fetchMatches(season);
  const rows = matches
    .filter((m) => m.matchday != null)
    .map((m) => ({
      id: m.id,
      season,
      matchday: m.matchday,
      utc_date: m.utcDate,
      status: m.status,
      home_name: m.homeTeam.shortName ?? m.homeTeam.name,
      away_name: m.awayTeam.shortName ?? m.awayTeam.name,
      home_crest: m.homeTeam.crest ?? null,
      away_crest: m.awayTeam.crest ?? null,
      home_score: m.score.fullTime.home,
      away_score: m.score.fullTime.away,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length) {
    const { error } = await db().from('matches').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  return rows.length;
}

// Sincroniza solo si los datos están "viejos": 2 min con partidos en juego, 3 h el resto del tiempo.
// El "reclamo" en sync_state evita que dos peticiones a la vez llamen a la API.
export async function syncIfStale(force = false): Promise<{ synced: boolean; count?: number }> {
  const maxAge = force ? 0 : (await isHot()) ? 2 * 60e3 : 3 * 3600e3;
  const cutoff = new Date(Date.now() - maxAge).toISOString();
  const { data, error } = await db()
    .from('sync_state')
    .update({ last_synced: new Date().toISOString() })
    .eq('id', 1)
    .or(`last_synced.is.null,last_synced.lt.${cutoff}`)
    .select();
  if (error || !data?.length) return { synced: false };
  try {
    return { synced: true, count: await syncMatches() };
  } catch (e) {
    console.error('Fallo al sincronizar partidos', e);
    return { synced: false };
  }
}
