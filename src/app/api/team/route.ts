import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { currentSeason } from '@/lib/season';
import { fetchAll } from '@/lib/paging';
import { MatchLite, normalizeTeamName, teamHistory, teamRecord } from '@/lib/league';
import { isCompetitionCode } from '@/lib/competitions';

export const dynamic = 'force-dynamic';

const COLS =
  'id,competition,season,matchday,stage,utc_date,status,home_name,away_name,home_crest,away_crest,home_score,away_score';

// Historial de un equipo en una competición: TODAS las temporadas guardadas (la actual y las
// que se hayan traído con el backfill), con estadísticas de la temporada actual y también
// históricas. Se comparan los nombres normalizados porque cada fuente de datos puede escribir
// el mismo equipo de forma ligeramente distinta.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Falta el equipo.' }, { status: 400 });
  const competition = isCompetitionCode(req.nextUrl.searchParams.get('competition'))
    ? req.nextUrl.searchParams.get('competition')!
    : 'PD';

  const supabase = db();
  const all = await fetchAll<MatchLite>((from, to) =>
    supabase.from('matches').select(COLS).eq('competition', competition).order('id').range(from, to)
  );
  const key = normalizeTeamName(name);
  const mine = all.filter((m) => normalizeTeamName(m.home_name) === key || normalizeTeamName(m.away_name) === key);
  const now = currentSeason();
  const current = mine.filter((m) => m.season === now);
  const seasons = [...new Set(mine.map((m) => m.season as number))].sort((a, b) => a - b);

  return NextResponse.json({
    team: name,
    matches: teamHistory(mine, name),
    record: teamRecord(current, name),
    recordAll: teamRecord(mine, name),
    seasons,
    currentSeason: now,
  });
}
