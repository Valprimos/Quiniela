import { db } from './db';
import { fetchAll } from './paging';
import { competitionDef } from './competitions';
import { pointsForPrediction, resultOf } from './scoring';

// Estados que ya no esperan juego. Cualquier otro (programado, en juego, aplazado, suspendido) cuenta como
// pendiente: no se archiva una temporada con partidos por jugar.
const DONE_STATUSES = ['FINISHED', 'AWARDED', 'CANCELLED'];

export type ArchiveRow = {
  group_id: string;
  competition: string;
  season: number;
  player_id: string;
  player_name: string;
  points: number;
  pos: number;
};

type MatchRow = { id: number; status: string; home_score: number | null; away_score: number | null; is_pleno: boolean | null };
type PredRow = { player_id: string; match_id: number; pick: string; pleno_home: number | null; pleno_away: number | null };

// ¿Ya no queda nada por jugar en esa competición y temporada? En las que tienen eliminatorias (Champions)
// hace falta además que se haya jugado la Final: entre la fase de liga y los playoffs puede no haber
// partidos pendientes en la base de datos y aun así la temporada no ha acabado.
export async function isSeasonComplete(competition: string, season: number): Promise<boolean> {
  const supabase = db();
  const base = () => supabase.from('matches').select('id').eq('competition', competition).eq('season', season);
  const { count, error } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('competition', competition)
    .eq('season', season);
  if (error || !count) return false;
  const { data: pending, error: pendingError } = await base()
    .not('status', 'in', `(${DONE_STATUSES.join(',')})`)
    .limit(1);
  if (pendingError || pending?.length) return false;
  if (competitionDef(competition).knockout) {
    const { data: final, error: finalError } = await base().eq('stage', 'FINAL').eq('status', 'FINISHED').limit(1);
    if (finalError || !final?.length) return false;
  }
  return true;
}

// Clasificación final de cada pandilla (o solo de una) con la misma regla que la clasificación de la app:
// resultOf + pointsForPrediction sobre los partidos terminados. Orden: por pandilla y por puesto.
export async function finalStandings(competition: string, season: number, groupId?: string): Promise<ArchiveRow[]> {
  const supabase = db();

  const matches = await fetchAll<MatchRow>(async (from, to) => {
    const res = await supabase
      .from('matches')
      .select('id,status,home_score,away_score,is_pleno')
      .eq('competition', competition)
      .eq('season', season)
      .order('id')
      .range(from, to);
    if (res.error) throw new Error(`partidos: ${res.error.message}`);
    return res as { data: MatchRow[] | null };
  });
  if (!matches.length) return [];

  const playersQuery = supabase.from('players').select('id,name,group_id');
  const { data: players, error: playersError } = await (groupId ? playersQuery.eq('group_id', groupId) : playersQuery);
  if (playersError) throw new Error(`jugadores: ${playersError.message}`);
  if (!players?.length) return [];
  const playerIds = new Set(players.map((p) => p.id));

  const finished = new Map(matches.filter((m) => resultOf(m.status, m.home_score, m.away_score) != null).map((m) => [m.id, m]));
  const finishedIds = [...finished.keys()];
  const points = new Map<string, number>();
  for (let i = 0; i < finishedIds.length; i += 100) {
    const ids = finishedIds.slice(i, i + 100);
    const preds = await fetchAll<PredRow>(async (from, to) => {
      const res = await supabase
        .from('predictions')
        .select('player_id,match_id,pick,pleno_home,pleno_away')
        .in('match_id', ids)
        .order('match_id')
        .order('player_id')
        .range(from, to);
      if (res.error) throw new Error(`pronósticos: ${res.error.message}`);
      return res as { data: PredRow[] | null };
    });
    for (const p of preds) {
      const m = finished.get(p.match_id);
      if (!m || !playerIds.has(p.player_id)) continue;
      const pts = pointsForPrediction({
        result: resultOf(m.status, m.home_score, m.away_score),
        pick: p.pick,
        isPleno: m.is_pleno === true,
        homeScore: m.home_score,
        awayScore: m.away_score,
        plenoHome: p.pleno_home,
        plenoAway: p.pleno_away,
      });
      points.set(p.player_id, (points.get(p.player_id) ?? 0) + pts);
    }
  }

  const byGroup = new Map<string, { id: string; name: string }[]>();
  for (const p of players) {
    const list = byGroup.get(p.group_id) ?? [];
    list.push({ id: p.id, name: p.name });
    byGroup.set(p.group_id, list);
  }
  const rows: ArchiveRow[] = [];
  for (const [group_id, list] of byGroup) {
    list
      .sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'es'))
      .forEach((p, i) =>
        rows.push({ group_id, competition, season, player_id: p.id, player_name: p.name, points: points.get(p.id) ?? 0, pos: i + 1 })
      );
  }
  return rows;
}

// Si la temporada ya ha terminado, guarda la clasificación final de todas las pandillas en el archivo.
// Es idempotente: solo escribe lo que falta o ha cambiado (por ejemplo, si un admin corrige un resultado
// después), así que se puede llamar en cada sincronización sin coste apreciable.
export async function autoArchiveIfComplete(competition: string, season: number): Promise<{ archived: number }> {
  if (!(await isSeasonComplete(competition, season))) return { archived: 0 };
  const rows = await finalStandings(competition, season);
  if (!rows.length) return { archived: 0 };

  const existing = await fetchAll<{ group_id: string; player_id: string; points: number; pos: number }>(async (from, to) => {
    const res = await db()
      .from('season_archive')
      .select('group_id,player_id,points,pos')
      .eq('competition', competition)
      .eq('season', season)
      .order('group_id')
      .order('player_id')
      .range(from, to);
    if (res.error) throw new Error(`archivo: ${res.error.message}`);
    return res as { data: { group_id: string; player_id: string; points: number; pos: number }[] | null };
  });
  const saved = new Map(existing.map((r) => [`${r.group_id}|${r.player_id}`, `${r.points}|${r.pos}`]));
  const changed = rows.filter((r) => saved.get(`${r.group_id}|${r.player_id}`) !== `${r.points}|${r.pos}`);
  if (!changed.length) return { archived: 0 };

  const { error } = await db().from('season_archive').upsert(changed, { onConflict: 'group_id,competition,season,player_id' });
  if (error) throw new Error(`archivo: ${error.message}`);
  return { archived: changed.length };
}
